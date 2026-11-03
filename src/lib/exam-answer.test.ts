import { describe, expect, it } from "vitest";
import { answersMatch, normalizeMcqAnswer, compactMcq, equivalentAnswer } from "./exam-answer";

const options = ["5", "9", "8", "11"];
describe("Canonical exam answer identity", () => {
  it("awards the correct option C", () => expect(answersMatch("C", "8", options)).toBe(true));
  it("rejects a wrong answer", () => expect(answersMatch("B", "C", options)).toBe(false));
  it("trims and ignores case", () => expect(answersMatch(" c ", " C ", options)).toBe(true));
  it("accepts legacy C. 8 and C) 8 labels", () => {
    expect(normalizeMcqAnswer("C. 8", options)).toBe("C");
    expect(answersMatch("8", "c) 8", options)).toBe(true);
  });
  it("accepts numeric equivalents without changing option identity", () => expect(answersMatch("8.0", "C", options)).toBe(true));
  it("does not award unanswered questions", () => expect(answersMatch("", "C", options)).toBe(false));
  it("keeps the selected option when a blank slot is compacted", () => expect(compactMcq(["5", "", "8", "11"], "C")).toEqual({ options: ["5", "8", "11"], correct: "B" }));
  it("does not guess between duplicate numeric options", () => expect(normalizeMcqAnswer("8.00", ["8", "8.0"])).toBeNull());
  it("does not strip prefixes from free-form short answers", () => {
    expect(equivalentAnswer(" A. sentence ", "a. sentence")).toBe(true);
    expect(equivalentAnswer("A. sentence", "sentence")).toBe(false);
  });
});