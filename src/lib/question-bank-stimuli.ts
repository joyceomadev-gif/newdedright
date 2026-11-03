import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertBankStimulusScope, bankPassagePayload } from "./question-bank-media";
import type { Database, Json } from "@/integrations/supabase/types";

export type BankStimulus = Database["public"]["Tables"]["question_stimuli"]["Row"];
export function bankStimuliOptions(userId: string, classId: string, subjectId: string) {
  return queryOptions({
    queryKey: ["standalone-question-bank", userId, "stimuli", classId, subjectId],
    enabled: !!classId && !!subjectId,
    queryFn: async () => {
      const rows: BankStimulus[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("question_stimuli")
          .select("*")
          .eq("class_id", classId)
          .eq("subject_id", subjectId)
          .is("deleted_at", null)
          .order("title")
          .order("id")
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      return rows;
    },
  });
}
export async function verifyBankStimulus(id: string, classId: string, subjectId: string) {
  const { data, error } = await supabase
    .from("question_stimuli")
    .select("class_id,subject_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error || !data) throw new Error("Passage unavailable. Choose another passage or unlink it.");
  assertBankStimulusScope(data, classId, subjectId);
}
export async function createBankStimulus(
  userId: string,
  classId: string,
  subjectId: string,
  title: string,
  html: string,
  media: Json[],
) {
  if (!classId || !subjectId) throw new Error("Choose a class and subject first.");
  const { data, error } = await supabase
    .from("question_stimuli")
    .insert({
      ...bankPassagePayload(title, html),
      class_id: classId,
      subject_id: subjectId,
      created_by: userId,
      media,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
