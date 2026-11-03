import type {
  DetectedImage,
  DetectedPassage,
  DetectedQuestion,
  DetectedSection,
  DetectedTable,
  ExamInfoGuess,
  ParsedDoc,
  WizardQuestionType,
} from "./types";
import { docxToRichHtml } from "./docx-reader";

/**
 * Convert a .docx file into sections + questions using section-driven rules.
 * Question type is decided per section (from heading + instructions), NOT per question.
 *
 * Reads the .docx directly (not via mammoth) so we can preserve per-run
 * formatting — bold, underline, highlight, coloured text — which is how
 * WAEC / NECO / school papers mark the correct MCQ option.
 */
export async function parseDocxToBlocks(file: File): Promise<ParsedDoc> {
  const html = await docxToRichHtml(file);
  return parseHtml(html);
}

/** Exposed for tests: parse an HTML string as if it were docx-reader output. */
export function parseHtml(html: string, warnings: string[] = []): ParsedDoc {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) {
    return {
      examInfo: {},
      sections: [],
      warnings: [...warnings, "Document was empty."],
      counts: { sections: 0, questions: 0, images: 0, tables: 0 },
    };
  }

  const children = Array.from(root.children) as HTMLElement[];
  const examInfo = guessExamInfo(children.slice(0, 15));

  // ---- Pass 1: split children into section buckets --------------------------
  const buckets: { heading: string; nodes: HTMLElement[] }[] = [];
  let current: { heading: string; nodes: HTMLElement[] } = { heading: "", nodes: [] };
  buckets.push(current);

  for (const el of children) {
    const text = (el.textContent ?? "").trim();
    if (!text) {
      current.nodes.push(el);
      continue;
    }
    const isHeadingTag = /^H[1-3]$/.test(el.tagName);
    const isSectionText = /^\s*(section|part)\s+[A-Z0-9IVX]+\b/i.test(text) && text.length < 200;
    // Broader boundary: bare type headings like "THEORY", "Essay", "Objectives",
    // "Multiple Choice", "Comprehension". Only treat as a boundary once at least
    // one bucket already has real content — otherwise the first heading of the
    // paper would create an empty preamble bucket.
    const isTypeHeading =
      /^(theory|essay|objectives?|comprehension|multiple\s*choice)\b/i.test(text) &&
      text.length < 100 &&
      buckets.some((b) => b.nodes.some((n) => (n.textContent ?? "").trim().length > 0));
    if (isHeadingTag || isSectionText || isTypeHeading) {
      current = { heading: text.replace(/\s+/g, " ").slice(0, 200), nodes: [] };
      buckets.push(current);
      continue;
    }
    current.nodes.push(el);
  }

  const sections: DetectedSection[] = [];
  let sectionIdx = 0;
  for (const b of buckets) {
    const hasContent = b.nodes.some(
      (n) => (n.textContent ?? "").trim().length > 0 || n.querySelector("img,table"),
    );
    if (!b.heading && !hasContent) continue;
    const sec = buildSection(sectionIdx, b.heading, b.nodes, warnings);
    sections.push(sec);
    sectionIdx++;
  }

  if (sections.length === 0) {
    sections.push({
      id: rid(), index: 0, headingText: "Section 1", instructionText: "",
      suggestedType: "theory", questions: [], media: [], tables: [], passages: [],
      unassignedImages: [], unassignedTables: [],
    });
  }

  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
  const totalImages = sections.reduce((n, s) => n + s.media.length + s.unassignedImages.length, 0);
  const totalTables = sections.reduce((n, s) => n + s.tables.length + s.unassignedTables.length, 0);

  return {
    examInfo,
    sections,
    warnings,
    counts: { sections: sections.length, questions: totalQuestions, images: totalImages, tables: totalTables },
  };
}

// -------------------- section builder (pass 2) --------------------

function buildSection(index: number, heading: string, nodes: HTMLElement[], warnings: string[]): DetectedSection {
  const sec: DetectedSection = {
    id: rid(),
    index,
    headingText: heading || (index === 0 ? "Preamble" : `Section ${index + 1}`),
    instructionText: "",
    suggestedType: "theory",
    questions: [],
    media: [],
    tables: [],
    passages: [],
    unassignedImages: [],
    unassignedTables: [],
  };

  let currentPassageId: string | undefined;
  let autoQNumber = 0; // running counter for questions without explicit numbers
  const pendingSharedForRange: { imageIds: string[]; from: number; to: number }[] = [];
  // A text-only reference like "The diagram below … answer questions 5 – 7."
  // remembered until the NEXT image paragraph arrives, so we can attach that
  // image to the correct range even when the reference and image are split
  // across paragraphs (very common in two-column exam layouts).
  let pendingRangeForNextImage: { from: number; to: number } | null = null;

  const attachToLast = (fn: (q: DetectedQuestion) => void) => {
    const last = sec.questions[sec.questions.length - 1];
    if (last) fn(last);
  };

  // Suggest the section type early — used to decide whether ambiguous paragraphs
  // (long lines with inline "(a) X (b) Y ...") should be treated as MCQ.
  const earlyType = suggestSectionTypeFromContext(sec.headingText);

  for (const el of nodes) {
    const text = (el.textContent ?? "").trim();

    // Tables ------------------------------------------------------------
    if (el.tagName === "TABLE") {
      const table = readTable(el as HTMLTableElement);
      sec.tables.push(table);
      if (sec.questions.length > 0) attachToLast((q) => q.sharedTableIds.push(table.id));
      else sec.unassignedTables.push(table);
      continue;
    }

    // Image paragraphs --------------------------------------------------
    const imgs = Array.from(el.querySelectorAll("img"));
    if (imgs.length > 0) {
      const detected = imgs.map(imgToDetected);
      for (const d of detected) sec.media.push(d);

      const range = parseQuestionRange(text) ?? pendingRangeForNextImage;
      if (range) {
        pendingRangeForNextImage = null;
        pendingSharedForRange.push({ imageIds: detected.map((d) => d.id), ...range });
        applyPendingRanges(sec, pendingSharedForRange, warnings);
        // If any of the referenced questions already exist, we're done. If not,
        // they'll get the images when applyPendingRanges runs after they're
        // parsed below.
        if (text.length < 5 || /^\s*(the\s+)?(diagram|figure|picture|map|chart|image)\b/i.test(text)) continue;
        // fall through to also process descriptive text
      } else if (text.length < 5) {
        if (sec.questions.length > 0) attachToLast((q) => q.sharedMediaIds.push(...detected.map((d) => d.id)));
        else sec.unassignedImages.push(...detected);
        continue;
      } else {
        if (sec.questions.length > 0) attachToLast((q) => q.sharedMediaIds.push(...detected.map((d) => d.id)));
        else sec.unassignedImages.push(...detected);
        // fall through to process text
      }
    }


    if (!text) continue;

    // Explicit "Answer: B" back-fills the last question --------------------
    const ansMatch = text.match(/^\s*(?:answer|ans|correct answer)\s*[:\-=]?\s*\(?([A-Ea-e])\)?\s*(?:[-–:.=]\s*(.+))?$/i);
    if (ansMatch && sec.questions.length > 0) {
      const letter = ansMatch[1].toUpperCase();
      attachToLast((q) => {
        q.correctAnswer = letter;
      });
      continue;
    }

    // Text-only answer fallback: "Answer: Referee" → map to matching option letter.
    const ansTextMatch = text.match(/^\s*(?:answer|ans|correct answer)\s*[:\-=]\s*(.+)$/i);
    if (ansTextMatch && sec.questions.length > 0) {
      const wanted = ansTextMatch[1].trim().toLowerCase();
      const last = sec.questions[sec.questions.length - 1];
      const idx = last.options.findIndex((o) => o.trim().toLowerCase() === wanted);
      if (idx >= 0) {
        last.correctAnswer = "ABCDE"[idx];
        continue;
      }
    }

    // Instructions -------------------------------------------------------
    if (/^instructions?\s*[:\-]/i.test(text) || (sec.questions.length === 0 && /^answer\s+/i.test(text))) {
      const stripped = text.replace(/^instructions?\s*[:\-]\s*/i, "").slice(0, 500);
      sec.instructionText = sec.instructionText ? `${sec.instructionText}\n${stripped}` : stripped;
      continue;
    }

    // Text-only shared-diagram reference: "The diagram below … answer
    // questions 5 – 7." Remember the range so the next image paragraph
    // attaches to those questions, even when they arrive in a later paragraph.
    if (/\b(diagram|figure|picture|map|chart|image)\b/i.test(text) && /questions?\s*\d/i.test(text)) {
      const r = parseQuestionRange(text);
      if (r) {
        pendingRangeForNextImage = r;
        // Also register as pending so questions parsed AFTER this reference
        // (but before the image) still get linked once the image arrives.
        continue;
      }
    }

    // Explicit passage markers ------------------------------------------
    if (/^(passage|read the (following )?passage)/i.test(text)) {
      const passage: DetectedPassage = { id: rid(), text: text.replace(/^passage\s*[:\-]?\s*/i, "") };
      sec.passages.push(passage);
      currentPassageId = passage.id;
      continue;
    }

    if (/^end of passage/i.test(text)) { currentPassageId = undefined; continue; }

    // Ordered lists become numbered questions ---------------------------
    if (el.tagName === "OL") {
      const items = Array.from(el.querySelectorAll(":scope > li")) as HTMLElement[];
      items.forEach((li, idx) => {
        const liText = (li.textContent ?? "").trim();
        const inline = extractInlineOptions(li, liText);
        const num = idx + 1;
        const q = newQuestion(num, inline ? inline.stem : liText);
        if (inline) {
          q.options = inline.options.map((o) => o.text);
          const correct = inline.options.find((o) => o.correct);
          if (correct) q.correctAnswer = correct.letter;
        }
        if (currentPassageId) q.sharedPassageId = currentPassageId;
        sec.questions.push(q);
        autoQNumber = num;
      });
      applyPendingRanges(sec, pendingSharedForRange, warnings);
      continue;
    }

    // Numbered question paragraphs --------------------------------------
    // Allow zero whitespace after the marker so "1." on its own line and
    // "4.I. What is …" both match — common in theory sections where the
    // number and first sub-part are typed with no separating space.
    const qMatch = text.match(/^(?:Q\s*)?(\d{1,3})[.)\]](?!\d)\s*(.*)$/i);
    if (qMatch) {
      const stemText = qMatch[2] ?? "";
      const inline = stemText ? extractInlineOptions(el, stemText) : null;
      const num = Number(qMatch[1]);
      const q = newQuestion(num, inline ? inline.stem : stemText);
      if (inline) {
        q.options = inline.options.map((o) => o.text);
        const correct = inline.options.find((o) => o.correct);
        if (correct) q.correctAnswer = correct.letter;
      }
      if (currentPassageId) q.sharedPassageId = currentPassageId;
      sec.questions.push(q);
      autoQNumber = num;
      applyPendingRanges(sec, pendingSharedForRange, warnings);
      continue;
    }

    // Skip structural theory headers like "PART 1 (COMPULSORY)" so they
    // neither create ghost questions nor pollute the previous stem.
    if (/^(part|section)\s+[A-Z0-9IVX]+\b/i.test(text) && text.length < 120) {
      continue;
    }

    // Un-numbered paragraph with inline options -> auto-numbered MCQ ------
    // This catches the common "Word auto-numbering list" case where the visible
    // text has no "1." because Word renders it from numPr. Guarded so it does
    // NOT fire inside theory / comprehension / diagram sections, where
    // "(a) …(b) …" is sub-parts of a theory question, not MCQ options.
    const nonMcqSection = earlyType === "theory" || earlyType === "comprehension" || earlyType === "diagram";
    if (!nonMcqSection) {
      const inline = extractInlineOptions(el, text);
      if (inline && inline.options.length >= 2) {
        // If the paragraph is ONLY options (empty stem) and we already have a
        // question waiting for its options, attach to that question instead of
        // creating a ghost empty-stem question. This is the common WAEC/NECO
        // pattern where the stem is on line N and the options wrap onto N+1.
        const last = sec.questions[sec.questions.length - 1];
        if (!inline.stem && last && last.options.length === 0) {
          last.options = inline.options.map((o) => o.text);
          const correct = inline.options.find((o) => o.correct);
          if (correct) last.correctAnswer = correct.letter;
          applyPendingRanges(sec, pendingSharedForRange, warnings);
          continue;
        }
        autoQNumber += 1;
        const q = newQuestion(autoQNumber, inline.stem);
        q.options = inline.options.map((o) => o.text);
        const correct = inline.options.find((o) => o.correct);
        if (correct) q.correctAnswer = correct.letter;
        if (currentPassageId) q.sharedPassageId = currentPassageId;
        sec.questions.push(q);
        applyPendingRanges(sec, pendingSharedForRange, warnings);
        continue;
      }
    }

    // Theory / essay question detection ---------------------------------
    // Un-numbered theory questions typically start with "(a) ..." sub-parts
    // (no leading "1."). Each paragraph beginning with (a)/a) starts a new
    // question; subsequent paragraphs (including (b), (c) sub-parts and any
    // continuation lines) append to that question's stem.
    if (nonMcqSection) {
      const startsWithA = /^\(?a[.)]\s+/i.test(text);
      if (startsWithA) {
        autoQNumber += 1;
        const q = newQuestion(autoQNumber, text);
        if (currentPassageId) q.sharedPassageId = currentPassageId;
        sec.questions.push(q);
        applyPendingRanges(sec, pendingSharedForRange, warnings);
        continue;
      }
      if (sec.questions.length > 0) {
        attachToLast((q) => (q.text = q.text ? `${q.text}\n${text}` : text));
        continue;
      }
      // No question yet in this theory section — treat substantive paragraph
      // as the first question so nothing is silently dropped.
      if (text.length > 20) {
        autoQNumber += 1;
        const q = newQuestion(autoQNumber, text);
        if (currentPassageId) q.sharedPassageId = currentPassageId;
        sec.questions.push(q);
        continue;
      }
    }

    // MCQ option line following a question ------------------------------
    // Skipped in non-MCQ sections so "(a) …" theory sub-parts stay in the stem.
    const optMatch = !nonMcqSection ? text.match(/^\(?([A-Ea-e])[.)]\s*(.+)$/) : null;
    if (optMatch && sec.questions.length > 0) {
      const answer = optMatch[2].trim();
      const letter = optMatch[1].toUpperCase();
      const marks = getFormattedTexts(el);
      const correct = marks.some((b) => {
        const bl = b.toLowerCase();
        const al = answer.toLowerCase();
        return bl === al || bl.includes(al) || al.includes(bl)
          || bl === letter.toLowerCase()
          || bl === `${letter.toLowerCase()}.`
          || bl === `${letter.toLowerCase()})`
          || bl === `(${letter.toLowerCase()})`;
      });
      attachToLast((q) => {
        q.options.push(answer);
        if (correct) q.correctAnswer = letter;
      });
      continue;
    }

    // Long paragraphs before questions = candidate reading passage ------
    if (text.length > 180 && sec.questions.length === 0) {
      const passage: DetectedPassage = { id: rid(), text };
      sec.passages.push(passage);
      currentPassageId = passage.id;
      continue;
    }


    // Continuation of last question stem
    if (sec.questions.length > 0) attachToLast((q) => (q.text = q.text ? `${q.text} ${text}` : text));
  }

  for (const p of pendingSharedForRange) {
    const covered = sec.questions.some(
      (q) => q.numberInSection != null && q.numberInSection >= p.from && q.numberInSection <= p.to && p.imageIds.some((id) => q.sharedMediaIds.includes(id)),
    );
    if (!covered) warnings.push(`Shared diagram referenced questions ${p.from}–${p.to} in "${sec.headingText}" but not all were found.`);
  }

  sec.suggestedType = suggestSectionType(sec.headingText, sec.instructionText, sec.questions, earlyType);
  return sec;
}

function applyPendingRanges(sec: DetectedSection, pending: { imageIds: string[]; from: number; to: number }[], _warnings: string[]) {
  for (const p of pending) {
    for (const q of sec.questions) {
      if (q.numberInSection != null && q.numberInSection >= p.from && q.numberInSection <= p.to) {
        for (const id of p.imageIds) if (!q.sharedMediaIds.includes(id)) q.sharedMediaIds.push(id);
      }
    }
  }
}

function parseQuestionRange(text: string): { from: number; to: number } | null {
  if (!text) return null;
  const range = text.match(/questions?\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/i);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from > 0 && to >= from) return { from, to };
  }
  const list = text.match(/questions?\s*((?:\d+\s*[, ]\s*)+(?:and\s*)?\d+)/i);
  if (list) {
    const nums = list[1].match(/\d+/g)?.map(Number) ?? [];
    if (nums.length >= 2) return { from: Math.min(...nums), to: Math.max(...nums) };
  }
  return null;
}

function newQuestion(numberInSection: number, text: string): DetectedQuestion {
  return {
    id: rid(),
    numberInSection,
    text: text.replace(/\s+/g, " ").trim(),
    options: [],
    sharedMediaIds: [],
    sharedTableIds: [],
  };
}

function imgToDetected(img: HTMLImageElement): DetectedImage {
  return { id: rid(), dataUrl: img.getAttribute("src") ?? "", alt: img.getAttribute("alt") ?? undefined };
}

/** Returns all text runs marked as bold / underlined / highlighted / coloured. */
function getFormattedTexts(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll("strong, b, u, mark"))
    .map((n) => (n.textContent ?? "").trim())
    .filter((t) => t.length > 0);
}

function readTable(el: HTMLTableElement): DetectedTable {
  const rows: string[][] = [];
  for (const tr of Array.from(el.querySelectorAll("tr"))) {
    const cells = Array.from(tr.querySelectorAll("td,th")).map((c) => (c.textContent ?? "").trim());
    if (cells.length > 0) rows.push(cells);
  }
  return { id: rid(), rows };
}

function guessExamInfo(nodes: HTMLElement[]): ExamInfoGuess {
  const info: ExamInfoGuess = {};
  const setIfMissing = (key: keyof ExamInfoGuess, val: string) => {
    if (!info[key] && val) info[key] = val.trim().slice(0, 200);
  };
  for (const n of nodes) {
    const text = (n.textContent ?? "").trim();
    if (!text) continue;
    if (!info.title && /^H[1-2]$/.test(n.tagName)) setIfMissing("title", text);
    const kv = text.match(/^(title|subject|class|duration|marks|date)\s*[:\-]\s*(.+)$/i);
    if (kv) setIfMissing(kv[1].toLowerCase() as keyof ExamInfoGuess, kv[2]);
  }
  return info;
}

/** Cheap first-pass type guess used before we've seen any questions. */
function suggestSectionTypeFromContext(heading: string): WizardQuestionType | null {
  const hay = heading.toLowerCase();
  if (/multiple[-\s]?choice|objective|choose the correct|circle the correct/.test(hay)) return "mcq";
  if (/theory|essay|explain|discuss/.test(hay)) return "theory";
  if (/comprehension|passage/.test(hay)) return "comprehension";
  if (/fill\s+(in\s+)?the\s+(gap|blank)|fill[-\s]in/.test(hay)) return "fill_gap";
  if (/match(ing)?\b/.test(hay)) return "matching";
  if (/diagram|label|sketch|draw/.test(hay)) return "diagram";
  return null;
}

/**
 * Decide the section type from heading + instructions ONLY.
 * We never scan individual question stems — the whole point of section-driven import.
 */
export function suggestSectionType(
  heading: string,
  instruction: string,
  questions: DetectedQuestion[],
  earlyHint: WizardQuestionType | null = null,
): WizardQuestionType {
  const hay = `${heading} ${instruction}`.toLowerCase();
  // Strong signal first: if we actually detected MCQ shape with a marked correct
  // answer, trust the questions over vague headings like "Section A".
  const withOptions = questions.filter((q) => q.options.length >= 2);
  const withCorrect = withOptions.filter((q) => q.correctAnswer);
  if (withCorrect.length > 0 && withOptions.length / Math.max(1, questions.length) >= 0.6) return "mcq";
  if (/multiple[-\s]?choice|objective|choose the correct|circle the correct/.test(hay)) return "mcq";
  if (/fill\s+(in\s+)?the\s+(gap|blank)|fill[-\s]in|complete the (sentence|statement)/.test(hay)) return "fill_gap";
  if (/match(ing)?\b|pair( up)?|column a|column b/.test(hay)) return "matching";
  if (/comprehension|read the passage|reading passage|passage below/.test(hay)) return "comprehension";
  if (/diagram|draw(ing)?|label the|sketch/.test(hay)) return "diagram";
  if (/theory|essay|explain|discuss|describe|answer the following/.test(hay)) return "theory";
  if (earlyHint) return earlyHint;
  if (questions.length > 0 && withOptions.length / questions.length >= 0.6) return "mcq";
  return "theory";
}

// -------------------- inline-option extractor --------------------

interface InlineOption { letter: string; text: string; correct: boolean }
interface InlineResult { stem: string; options: InlineOption[] }

/**
 * Split a single paragraph like:
 *   "…stem… (a) Recorder (b) Referee (c) Umpire (d) Assistant umpire"
 * into stem + options. Uses the DOM to look inside <strong>/<u>/<mark>
 * so we can tell which option is the correct answer.
 *
 * Supported markers: (a), (A), a), A), a., A. — preceded by whitespace or start.
 */
export function extractInlineOptions(el: HTMLElement, plainText: string): InlineResult | null {
  // Marker regex: optional "(", letter A-E, ")" or "." or ")", followed by space.
  const markerRe = /(^|\s)\(?([A-Ea-e])[.)]\s+/g;
  const matches: { index: number; letter: string; lenAfterSpace: number; leadIndex: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(plainText)) !== null) {
    const leadIndex = m.index + (m[1] ? 1 : 0);
    matches.push({ index: leadIndex, letter: m[2].toUpperCase(), lenAfterSpace: m[0].length - (m[1] ? 1 : 0), leadIndex });
  }
  if (matches.length < 2) return null;

  // Enforce alphabetical order starting at A (or a).
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].letter !== "ABCDE"[i]) return null;
  }

  const stemEnd = matches[0].index;
  const stem = plainText.slice(0, stemEnd).replace(/\s+/g, " ").trim();
  const formattedRanges = getFormattedRanges(el);

  const options: InlineOption[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : plainText.length;
    const rawSlice = plainText.slice(start, end);
    const textAfterMarker = rawSlice.replace(/^\s*\(?[A-Ea-e][.)]\s+/, "").trim();
    // Any formatted run overlapping [start, end) that is NOT the entire paragraph
    // (which would just mean everything is bold — no signal).
    const overlapping = formattedRanges.some((r) => r.start < end && r.end > start);
    const wholeParagraphFormatted = formattedRanges.some((r) => r.start <= 0 && r.end >= plainText.length);
    options.push({
      letter: matches[i].letter,
      text: textAfterMarker,
      correct: overlapping && !wholeParagraphFormatted,
    });
  }

  // Guard: if EVERY option looks correct, we probably matched noise — drop signal.
  const correctCount = options.filter((o) => o.correct).length;
  if (correctCount === options.length && options.length > 1) {
    for (const o of options) o.correct = false;
  } else if (correctCount > 1) {
    // Keep only the first — teacher can override in the wizard.
    let seen = false;
    for (const o of options) {
      if (o.correct && !seen) seen = true;
      else o.correct = false;
    }
  }

  return { stem, options };
}

/** Character offsets (in the paragraph's plain text) of runs that are bold / underlined / highlighted. */
function getFormattedRanges(el: HTMLElement): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let offset = 0;
  const walk = (node: Node, insideFormatted: boolean) => {
    if (node.nodeType === 3) {
      const len = (node.textContent ?? "").length;
      if (insideFormatted && len > 0) ranges.push({ start: offset, end: offset + len });
      offset += len;
      return;
    }
    if (node.nodeType !== 1) return;
    const e = node as Element;
    const tag = e.tagName;
    const nowFormatted = insideFormatted || tag === "STRONG" || tag === "B" || tag === "U" || tag === "MARK";
    for (const child of Array.from(e.childNodes)) walk(child, nowFormatted);
  };
  for (const child of Array.from(el.childNodes)) walk(child, false);
  // Merge adjacent ranges.
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}
