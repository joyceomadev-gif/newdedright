import { describe, expect, it } from "vitest";
import {
  assertBankStimulusScope,
  bankMediaEntries,
  bankMediaInfo,
  bankPassagePayload,
  bankPassageChoice,
  setBankMediaText,
  validateBankImage,
} from "./question-bank-media";
import { bankDraftPayload, type BankDraft } from "./question-bank-editor";

describe("Question Bank shared resources", () => {
  it("ignores empty dropdown refresh events and only explicitly unlinks passages", () => {
    expect(bankPassageChoice("")).toBeUndefined();
    expect(bankPassageChoice("none")).toBe("");
    expect(bankPassageChoice("passage-1")).toBe("passage-1");
  });
  it("accepts only the question's class and subject", () => {
    expect(() =>
      assertBankStimulusScope({ class_id: "a", subject_id: "b" }, "a", "b"),
    ).not.toThrow();
    expect(() => assertBankStimulusScope({ class_id: "a", subject_id: "b" }, "x", "b")).toThrow();
    expect(() => assertBankStimulusScope({ class_id: "a", subject_id: "b" }, "a", "x")).toThrow();
  });
  it("preserves unknown legacy media keys when captions change", () => {
    const original = [{ url: "old/path", unknown: { keep: true } }, "legacy-value"];
    const updated = setBankMediaText(bankMediaEntries(original), 0, "caption", "Figure 1");
    expect(updated).toEqual([{ ...(original[0] as object), caption: "Figure 1" }, "legacy-value"]);
    expect(bankMediaInfo(updated[0])?.path).toBe("old/path");
    expect(original[0]).not.toHaveProperty("caption");
  });
  it("rejects SVG and oversized or empty image files", () => {
    expect(() => validateBankImage({ type: "image/png", size: 5 * 1024 * 1024 })).not.toThrow();
    expect(() => validateBankImage({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toThrow();
    expect(() => validateBankImage({ type: "image/svg+xml", size: 100 })).toThrow();
    expect(() => validateBankImage({ type: "image/jpeg", size: 0 })).toThrow();
  });
  it("creates a fresh builder-compatible passage without mutating the prior resource", () => {
    const original = bankPassagePayload("Old", "Original text");
    const next = bankPassagePayload(" New ", "Changed text");
    expect(original.content_json[0].html).toBe("Original text");
    expect(next).toEqual({
      title: "New",
      content_json: [{ id: "passage", kind: "passage", html: "Changed text" }],
    });
    expect(() => bankPassagePayload("", "text")).toThrow();
    expect(() => bankPassagePayload("title", "<p></p>")).toThrow();
  });
  it("carries optional passage and image references through draft saves and copies", () => {
    const draft: BankDraft = {
      class_id: "a",
      subject_id: "b",
      purpose: "exam",
      question_type: "theory",
      question_text: "Question",
      options: [],
      correct_answer: "",
      marks: 1,
      difficulty: "medium",
      topic: "",
      sub_topic: "",
      explanation: "",
      tags: "",
      section_label: "",
      section_instruction: "",
      stimulus_id: "passage-1",
      media: [{ bucket: "question-media", path: "original.png", caption: "Label" }],
    };
    expect(bankDraftPayload(draft)).toMatchObject({
      stimulus_id: "passage-1",
      media: draft.media,
      status: "draft",
    });
    expect(bankDraftPayload({ ...draft, stimulus_id: "" }).stimulus_id).toBeNull();
    expect(draft.stimulus_id).toBe("passage-1");
  });
});
