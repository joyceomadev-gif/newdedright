import { compactMcq } from "./exam-answer";
import type { Json } from "@/integrations/supabase/types";

export const BANK_TYPES = [
  "mcq",
  "fill_gap",
  "short_answer",
  "theory",
  "drawing",
  "coloring",
  "chart",
] as const;
export interface BankDraft {
  class_id: string;
  subject_id: string;
  purpose: string;
  question_type: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  sub_topic: string;
  explanation: string;
  tags: string;
  section_label: string;
  section_instruction: string;
  stimulus_id?: string;
  media?: Json[];
}
export function bankActionAllowed(staff: boolean, parent: boolean, submodule: boolean) {
  return staff && parent && submodule;
}
export function bankDraftPayload(draft: BankDraft) {
  if (!draft.class_id || !draft.subject_id) throw new Error("Choose a class and subject.");
  if (!draft.question_text.replace(/<[^>]*>/g, "").trim()) throw new Error("Enter question text.");
  if (!BANK_TYPES.some((type) => type === draft.question_type))
    throw new Error("Unsupported question type.");
  if (!["exam", "ca1", "ca2", "ca3"].includes(draft.purpose))
    throw new Error("Choose a valid purpose.");
  if (!["easy", "medium", "hard"].includes(draft.difficulty))
    throw new Error("Choose a valid difficulty.");
  if (!Number.isFinite(draft.marks) || draft.marks <= 0)
    throw new Error("Marks must be greater than zero.");
  const mcq = compactMcq(draft.options, draft.correct_answer);
  if (draft.question_type === "mcq" && (mcq.options.length < 2 || !mcq.correct))
    throw new Error("Provide at least two options and select the correct answer.");
  if (["fill_gap", "short_answer"].includes(draft.question_type) && !draft.correct_answer.trim())
    throw new Error("Enter the expected answer.");
  return {
    class_id: draft.class_id,
    subject_id: draft.subject_id,
    purpose: draft.purpose,
    question_type: draft.question_type,
    question_text: draft.question_text.trim(),
    options: draft.question_type === "mcq" ? mcq.options : null,
    correct_answer:
      draft.question_type === "mcq" ? mcq.correct : draft.correct_answer.trim() || null,
    marks: draft.marks,
    difficulty: draft.difficulty,
    topic: draft.topic.trim() || null,
    sub_topic: draft.sub_topic.trim() || null,
    explanation: draft.explanation.trim() || null,
    tags: [
      ...new Set(
        draft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
    section_label: draft.section_label.trim() || null,
    section_instruction: draft.section_instruction.trim() || null,
    ...(draft.stimulus_id !== undefined ? { stimulus_id: draft.stimulus_id || null } : {}),
    ...(draft.media !== undefined ? { media: draft.media } : {}),
    // New copies and edited content always require fresh approval.
    status: "draft" as const,
    approved_by: null,
    approved_at: null,
  };
}
