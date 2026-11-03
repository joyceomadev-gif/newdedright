import { optionEntries } from "./exam-answer";
import type { BankFilters } from "./question-bank";

export interface ExportLabels {
  classes: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
}
export interface ExportSource {
  class_id: string | null;
  subject_id: string | null;
  question_text: string;
  question_type: string;
  options: unknown;
  correct_answer: string | null;
  marks: number | null;
  difficulty: string | null;
  status: string | null;
  topic: string | null;
}
const plain = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Explicit column allowlist; nothing else from the record enters the workbook. */
export function bankExportRows(rows: ExportSource[], labels: ExportLabels) {
  return rows.map((q) => {
    const opts = optionEntries(q.options as never);
    const optionText = (k: string) => plain(opts.find(([key]) => key === k)?.[1]);
    return {
      Class: labels.classes.find((c) => c.id === q.class_id)?.name ?? "",
      Subject: labels.subjects.find((s) => s.id === q.subject_id)?.name ?? "",
      Question: plain(q.question_text),
      Type: q.question_type.replaceAll("_", " "),
      "Option A": optionText("A"),
      "Option B": optionText("B"),
      "Option C": optionText("C"),
      "Option D": optionText("D"),
      "Option E": optionText("E"),
      "Correct answer": plain(q.correct_answer),
      Marks: q.marks ?? "",
      Difficulty: q.difficulty ?? "",
      Status: q.status ?? "",
      Topic: q.topic ?? "",
    };
  });
}
export function bankExportFilename(filters: BankFilters, date = new Date()) {
  const active = Object.values(filters).some(Boolean) ? "filtered" : "all";
  return `question-bank-${active}-${date.toISOString().slice(0, 10)}.xlsx`;
}
