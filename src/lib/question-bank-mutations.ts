import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { softDelete } from "./soft-delete";
import { bankDraftPayload, type BankDraft } from "./question-bank-editor";
import { verifyBankStimulus } from "./question-bank-stimuli";

export type BankRecord = Database["public"]["Tables"]["question_bank"]["Row"];
export async function loadBankRecord(id: string): Promise<BankRecord> {
  const { data, error } = await supabase
    .from("question_bank")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}
export async function saveBankQuestion(
  draft: BankDraft,
  userId: string,
  source: BankRecord | null,
  duplicate: boolean,
) {
  const payload = bankDraftPayload(draft);
  const stimulusId = draft.stimulus_id === undefined ? source?.stimulus_id : draft.stimulus_id;
  if (stimulusId) await verifyBankStimulus(stimulusId, draft.class_id, draft.subject_id);
  if (source && !duplicate) {
    // Save the pre-edit snapshot before changing content; a denied revision aborts the edit.
    const current = await loadBankRecord(source.id);
    if (current.updated_at !== source.updated_at)
      throw new Error("This question changed. Reopen it before editing.");
    const revision = await supabase.from("question_bank_revisions").insert({
      question_id: current.id,
      editor_user_id: userId,
      snapshot: current,
    });
    if (revision.error) throw revision.error;
    const { data, error } = await supabase
      .from("question_bank")
      .update({ ...payload, updated_by: userId })
      .eq("id", source.id)
      .eq("updated_at", source.updated_at)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Question changed; reopen and retry.");
  } else {
    const retained = source
      ? {
          media: source.media,
          stimulus_id: source.stimulus_id,
          correct_answers: source.correct_answers,
          section_order: source.section_order,
          question_number: source.question_number,
          session_id: source.session_id,
          term_id: source.term_id,
          time_suggestion_seconds: source.time_suggestion_seconds,
        }
      : {};
    const { error } = await supabase
      .from("question_bank")
      .insert({ ...retained, ...payload, created_by: userId, updated_by: userId });
    if (error) throw error;
  }
}
export async function removeBankQuestion(id: string) {
  await softDelete("question_bank", id, "Removed from standalone Question Bank");
}
