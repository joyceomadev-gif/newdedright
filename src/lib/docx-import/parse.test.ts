import { describe, it, expect } from "vitest";
import { parseHtml, extractInlineOptions } from "./parse";

describe("parseHtml (section-driven)", () => {
  it("splits into sections by heading and decides type from heading", () => {
    const html = `
      <h1>Basic Science — First Term Exam</h1>
      <p>Section A – Multiple Choice Questions</p>
      <p>Instructions: Answer all questions.</p>
      <p>1. What is H2O?</p>
      <p>2. The sun is a ____.</p>
      <p>Section B – Theory Questions</p>
      <p>Answer any three.</p>
      <p>1. Explain photosynthesis.</p>
      <p>2. Describe the water cycle.</p>
    `;
    const parsed = parseHtml(html);
    const named = parsed.sections.filter((s) => /section/i.test(s.headingText));
    expect(named).toHaveLength(2);
    const [a, b] = named;
    expect(a.suggestedType).toBe("mcq");
    expect(b.suggestedType).toBe("theory");
    expect(a.instructionText).toMatch(/answer all/i);
    expect(a.questions).toHaveLength(2);
    expect(b.questions).toHaveLength(2);
    expect(a.questions[0].numberInSection).toBe(1);
    expect(b.questions[0].numberInSection).toBe(1);
    expect(parsed.warnings.some((w) => /duplicate/i.test(w))).toBe(false);
  });

  it("attaches a shared diagram to a question range without duplicating the image", () => {
    const html = `
      <p>Section A – Multiple Choice Questions</p>
      <p><img src="data:image/png;base64,AAAA" alt="chart"/> Use the diagram below to answer questions 5–7.</p>
      <p>5. What is X?</p>
      <p>6. What is Y?</p>
      <p>7. What is Z?</p>
      <p>8. Unrelated question.</p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section a/i.test(s.headingText))!;
    expect(sec.media).toHaveLength(1);
    const imgId = sec.media[0].id;
    const q5 = sec.questions.find((q) => q.numberInSection === 5)!;
    const q6 = sec.questions.find((q) => q.numberInSection === 6)!;
    const q7 = sec.questions.find((q) => q.numberInSection === 7)!;
    const q8 = sec.questions.find((q) => q.numberInSection === 8)!;
    expect(q5.sharedMediaIds).toContain(imgId);
    expect(q6.sharedMediaIds).toContain(imgId);
    expect(q7.sharedMediaIds).toContain(imgId);
    expect(q8.sharedMediaIds).not.toContain(imgId);
  });

  it("associates a passage with every question until the next section", () => {
    const html = `
      <p>Section C – Reading Comprehension</p>
      <p>Passage: ${"The village of Odogbolu is quiet at dawn. ".repeat(10)}</p>
      <p>1. Where is Odogbolu?</p>
      <p>2. What time of day is described?</p>
      <p>3. Give one adjective from the passage.</p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section c/i.test(s.headingText))!;
    expect(sec.suggestedType).toBe("comprehension");
    expect(sec.passages).toHaveLength(1);
    const pid = sec.passages[0].id;
    for (const q of sec.questions) expect(q.sharedPassageId).toBe(pid);
  });

  it("does not assume a fixed structure — synthesises a section when none exists", () => {
    const html = `<ol><li>First question?</li><li>Second question?</li></ol>`;
    const parsed = parseHtml(html);
    expect(parsed.sections.length).toBeGreaterThanOrEqual(1);
    const total = parsed.sections.reduce((n, s) => n + s.questions.length, 0);
    expect(total).toBe(2);
  });
});

describe("inline MCQ extractor (Word-formatted correct answer)", () => {
  it("splits inline options and marks the bolded option correct (auto-numbered)", () => {
    // Mirrors the YEAR_8_PE.docx layout: no visible number, options inline, (b) bolded.
    const html = `
      <p>Section A – Multiple Choice Questions</p>
      <p>…assign duties to the other officials in table tennis. (a) Recorder <strong>(b) Referee</strong> (c) Umpire (d) Assistant umpire</p>
      <p>Table tennis officials include all these people, except ……. (a) Umpire (b) Linesman (c) Referee <strong>(d) Assistant umpire</strong></p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section a/i.test(s.headingText))!;
    expect(sec.suggestedType).toBe("mcq");
    expect(sec.questions).toHaveLength(2);
    const q1 = sec.questions[0];
    expect(q1.numberInSection).toBe(1);
    expect(q1.options).toEqual(["Recorder", "Referee", "Umpire", "Assistant umpire"]);
    expect(q1.correctAnswer).toBe("B");
    const q2 = sec.questions[1];
    expect(q2.correctAnswer).toBe("D");
  });

  it("respects underline as a correct-answer marker", () => {
    const html = `
      <p>Section A – Objective</p>
      <p>1. Water is (A) solid (B) liquid <u>(C) H2O</u> (D) fire</p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section a/i.test(s.headingText))!;
    expect(sec.questions[0].correctAnswer).toBe("C");
  });

  it("respects highlight (via <mark>) as a correct-answer marker", () => {
    const html = `
      <p>Section A – Multiple Choice</p>
      <p>1. Capital of France? (a) Rome (b) <mark data-fmt="H">Paris</mark> (c) Berlin (d) Madrid</p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section a/i.test(s.headingText))!;
    expect(sec.questions[0].correctAnswer).toBe("B");
  });

  it("back-fills correct answer from an explicit 'Answer: B' line", () => {
    const html = `
      <p>Section A – Multiple Choice</p>
      <p>1. Water is (A) solid (B) liquid (C) gas (D) plasma</p>
      <p>Answer: B</p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section a/i.test(s.headingText))!;
    expect(sec.questions[0].correctAnswer).toBe("B");
  });

  it("does not mark all options correct when the whole paragraph is bold", () => {
    const html = `
      <p>Section A – Multiple Choice</p>
      <p><strong>1. Colour of the sky (a) red (b) blue (c) green (d) black</strong></p>
    `;
    const parsed = parseHtml(html);
    const sec = parsed.sections.find((s) => /section a/i.test(s.headingText))!;
    // We should still extract 4 options; correct answer left unset for teacher.
    expect(sec.questions[0].options).toHaveLength(4);
    expect(sec.questions[0].correctAnswer).toBeUndefined();
  });
});

describe("extractInlineOptions (unit)", () => {
  it("returns null when there is no valid option sequence", () => {
    const el = document.createElement("p");
    el.textContent = "This is just a sentence with no options.";
    expect(extractInlineOptions(el, el.textContent!)).toBeNull();
  });
});
