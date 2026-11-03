// Types for the block-based Question Builder.
// The whole document is stored per row in questions.content_json,
// and its flattened HTML is mirrored into questions.question_text for backward compat.

export type SharedKind =
  | "instruction"
  | "passage"
  | "image"
  | "table"
  | "diagram"
  | "formula"
  | "chart";

export type BuilderQType = "mcq" | "theory" | "short_answer" | "fill_gap";

export interface SharedResource {
  id: string;
  kind: SharedKind;
  html: string;
  caption?: string;
}

export interface SubQuestion {
  id: string;
  html: string;
  marks: number;
  modelAnswer?: string;
  markingGuide?: string;
}

export interface BuilderQuestion {
  id: string;
  html: string;
  marks: number;
  qType: BuilderQType;
  options?: string[];
  correctAnswer?: string;
  subQuestions: SubQuestion[];
}

export interface BuilderGroup {
  id: string;
  shared: SharedResource[];
  questions: BuilderQuestion[];
}

export type BuilderItem =
  | { id: string; kind: "question"; question: BuilderQuestion }
  | { id: string; kind: "group"; group: BuilderGroup };

export interface BuilderDoc {
  version: 1;
  items: BuilderItem[];
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyQuestion(qType: BuilderQType = "theory"): BuilderQuestion {
  return {
    id: uid(),
    html: "",
    marks: 1,
    qType,
    options: qType === "mcq" ? ["", "", "", "", ""] : undefined,
    correctAnswer: "",
    subQuestions: [],
  };
}

export function emptyGroup(): BuilderGroup {
  return {
    id: uid(),
    shared: [{ id: uid(), kind: "instruction", html: "" }],
    questions: [emptyQuestion("theory")],
  };
}

export function newDoc(): BuilderDoc {
  return {
    version: 1,
    items: [{ id: uid(), kind: "question", question: emptyQuestion("theory") }],
  };
}

/** Strip HTML down to a plain-text snippet for legacy question_text mirroring. */
export function htmlToPlain(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Produce the flattened HTML that will be written to questions.question_text.
 * Renders group shared content + numbered questions + sub-questions (a, b, c…).
 */
export function flattenItemHtml(item: BuilderItem): string {
  const parts: string[] = [];
  if (item.kind === "question") {
    parts.push(renderQuestion(item.question, null));
  } else {
    for (const s of item.group.shared) parts.push(renderShared(s));
    item.group.questions.forEach((q, i) => parts.push(renderQuestion(q, i + 1)));
  }
  return parts.join("\n");
}

function renderShared(s: SharedResource): string {
  const label =
    s.kind === "instruction"
      ? ""
      : `<div class="text-xs uppercase tracking-wide opacity-70 mb-1">${s.kind}</div>`;
  return `<div class="qb-shared qb-shared-${s.kind}">${label}${s.html}${
    s.caption ? `<div class="text-xs italic mt-1">${s.caption}</div>` : ""
  }</div>`;
}

function renderQuestion(q: BuilderQuestion, number: number | null): string {
  const head = number != null ? `<strong>${number}. </strong>` : "";
  // Options are stored in the separate 'options' field, not in question_text.
  // Including them here caused duplicate display (options appearing twice).
  const subs =
    q.subQuestions.length > 0
      ? `<ol type="a" class="qb-subs">${q.subQuestions
          .map(
            (s) =>
              `<li>${s.html}${
                s.marks ? ` <em>(${s.marks} mk)</em>` : ""
              }</li>`,
          )
          .join("")}</ol>`
      : "";
  return `<div class="qb-question">${head}${q.html}${subs}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Compute total marks for an item (question + sub-question marks, or all questions in a group). */
export function itemTotalMarks(item: BuilderItem): number {
  if (item.kind === "question") return questionMarks(item.question);
  return item.group.questions.reduce((a, q) => a + questionMarks(q), 0);
}
function questionMarks(q: BuilderQuestion): number {
  const sub = q.subQuestions.reduce((a, s) => a + (Number(s.marks) || 0), 0);
  return sub > 0 ? sub : Number(q.marks) || 0;
}

/** Adapt an existing legacy question row into a BuilderItem for editing. */
export function legacyToItem(row: {
  question_text: string | null;
  options: unknown;
  correct_answer: string | null;
  marks: number | null;
  question_type: string | null;
}): BuilderItem {
  const opts = Array.isArray(row.options)
    ? (row.options as unknown[]).map(String)
    : undefined;
  const q: BuilderQuestion = {
    id: uid(),
    html: row.question_text ?? "",
    marks: Number(row.marks ?? 1),
    qType: ((row.question_type as BuilderQType) ?? "theory") as BuilderQType,
    options: opts,
    correctAnswer: row.correct_answer ?? "",
    subQuestions: [],
  };
  return { id: uid(), kind: "question", question: q };
}
