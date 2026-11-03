import { describe, expect, it } from "vitest";
import { bankExportFilename, bankExportRows } from "./question-bank-export";
import { EMPTY_BANK_FILTERS } from "./question-bank";

const labels = { classes: [{ id: "c1", name: "JSS ONE" }], subjects: [{ id: "s1", name: "Maths" }] };
const row = {
  class_id: "c1",
  subject_id: "s1",
  question_text: "<p>How many planets?</p>",
  question_type: "mcq",
  options: ["5", "9", "8", "11"],
  correct_answer: "8",
  marks: 2,
  difficulty: "easy",
  status: "draft",
  topic: null,
};

describe("question bank export", () => {
  it("exports only allowlisted columns with names and plain text", () => {
    const [out] = bankExportRows([{ ...row, secret: "x" } as typeof row], labels);
    expect(out.Class).toBe("JSS ONE");
    expect(out.Subject).toBe("Maths");
    expect(out.Question).toBe("How many planets?");
    expect(out["Option C"]).toBe("8");
    expect(Object.keys(out)).not.toContain("secret");
  });
  it("names files by filter state", () => {
    const d = new Date("2026-10-24T00:00:00Z");
    expect(bankExportFilename(EMPTY_BANK_FILTERS, d)).toBe("question-bank-all-2026-10-24.xlsx");
    expect(bankExportFilename({ ...EMPTY_BANK_FILTERS, status: "draft" }, d)).toBe(
      "question-bank-filtered-2026-10-24.xlsx",
    );
  });
});
