import { describe, expect, it } from "vitest";
import { bankActionAllowed, bankDraftPayload, type BankDraft } from "./question-bank-editor";
const draft: BankDraft = {
  class_id: "class",
  subject_id: "subject",
  purpose: "exam",
  question_type: "mcq",
  question_text: "How many planets?",
  options: ["5", "9", "8", "11"],
  correct_answer: "C. 8",
  marks: 1,
  difficulty: "medium",
  topic: "",
  sub_topic: "",
  explanation: "",
  tags: "",
  section_label: "",
  section_instruction: "",
};
describe("standalone bank authoring", () => {
  it("stores the planets answer as canonical C", () =>
    expect(bankDraftPayload(draft).correct_answer).toBe("C"));
  it("preserves identity when blank options compact", () =>
    expect(bankDraftPayload({ ...draft, options: ["5", "", "8", "11"] }).correct_answer).toBe("B"));
  it("requires at least two options", () =>
    expect(() => bankDraftPayload({ ...draft, options: ["8"], correct_answer: "A" })).toThrow());
  it("requires an expected short answer", () =>
    expect(() =>
      bankDraftPayload({ ...draft, question_type: "short_answer", correct_answer: "" }),
    ).toThrow());
  it("rejects non-positive marks", () =>
    expect(() => bankDraftPayload({ ...draft, marks: 0 })).toThrow());
  it("defers unsupported matching types", () =>
    expect(() => bankDraftPayload({ ...draft, question_type: "matching" })).toThrow());
  it("copies and edits never inherit approval", () =>
    expect(bankDraftPayload(draft)).toMatchObject({
      status: "draft",
      approved_by: null,
      approved_at: null,
    }));
  it("requires staff and both action permissions", () => {
    expect(bankActionAllowed(true, true, true)).toBe(true);
    expect(bankActionAllowed(false, true, true)).toBe(false);
    expect(bankActionAllowed(true, false, true)).toBe(false);
    expect(bankActionAllowed(true, true, false)).toBe(false);
  });
});
