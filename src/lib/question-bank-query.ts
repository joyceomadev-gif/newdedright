import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  bankGroupCounts,
  bankPageRange,
  bankSearchPattern,
  type BankFilters,
} from "./question-bank";

export interface BankLabel {
  id: string;
  name: string;
}
export interface BankSubject extends BankLabel {
  class_id: string | null;
}
export interface BankClassSummary extends BankLabel {
  count: number;
  subjects: Array<BankLabel & { count: number }>;
}
export interface BankCatalog {
  classes: BankLabel[];
  subjects: BankSubject[];
  groups: BankClassSummary[];
  count: number;
}
export function filteredBankQuery(filters: BankFilters, head = false) {
  let query = supabase
    .from("question_bank")
    .select(
      "id,class_id,subject_id,question_text,question_type,options,correct_answer,marks,difficulty,status,topic,section_label,section_instruction,question_number,media,stimulus_id",
      { count: "exact", head },
    )
    .is("deleted_at", null);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (
    filters.difficulty === "easy" ||
    filters.difficulty === "medium" ||
    filters.difficulty === "hard"
  )
    query = query.eq("difficulty", filters.difficulty);
  if (filters.status === "draft" || filters.status === "approved" || filters.status === "archived")
    query = query.eq("status", filters.status);
  if (filters.search) query = query.ilike("question_text", bankSearchPattern(filters.search));
  return query;
}
async function countBank(filters: BankFilters) {
  const { count, error } = await filteredBankQuery(filters, true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
async function labels() {
  const classes: BankLabel[] = [];
  const subjects: BankSubject[] = [];
  for (let from = 0; ; from += 1000) {
    const [c, s] = await Promise.all([
      supabase
        .from("classes")
        .select("id,name")
        .is("deleted_at", null)
        .order("name")
        .order("id")
        .range(from, from + 999),
      supabase
        .from("subjects")
        .select("id,name,class_id")
        .is("deleted_at", null)
        .order("name")
        .order("id")
        .range(from, from + 999),
    ]);
    if (c.error) throw new Error(c.error.message);
    if (s.error) throw new Error(s.error.message);
    classes.push(...(c.data ?? []));
    subjects.push(...(s.data ?? []));
    if ((c.data?.length ?? 0) < 1000 && (s.data?.length ?? 0) < 1000) break;
  }
  return { classes, subjects };
}
// Read only grouping keys, under the same filters/RLS, rather than issuing a
// count request for every possible class/subject combination.
async function groupCounts(filters: BankFilters) {
  const rows: Array<{ class_id: string | null; subject_id: string | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filteredBankQuery(filters)
      .select("id,class_id,subject_id")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return bankGroupCounts(rows);
}
export function bankCatalogOptions(userId: string, filters: BankFilters) {
  return queryOptions({
    queryKey: ["standalone-question-bank", userId, "catalog", filters],
    staleTime: 30_000,
    queryFn: async (): Promise<BankCatalog> => {
      const [catalog, count, counts] = await Promise.all([
        labels(),
        countBank(filters),
        groupCounts(filters),
      ]);
      const candidates = catalog.classes.filter(
        (c) => !filters.classId || c.id === filters.classId,
      );
      const groups = candidates.map((c) => {
        const group = counts.get(c.id);
        if (!group) return null;
        const subjects = catalog.subjects.flatMap((s) => {
          const subjectCount = group.subjects.get(s.id) ?? 0;
          return subjectCount ? [{ id: s.id, name: s.name, count: subjectCount }] : [];
        });
        return { ...c, count: group.count, subjects };
      });
      return { ...catalog, count, groups: groups.filter((g) => g !== null) };
    },
  });
}
export function bankRowsOptions(userId: string, filters: BankFilters, page: number) {
  return queryOptions({
    queryKey: ["standalone-question-bank", userId, "rows", filters, page],
    staleTime: 30_000,
    queryFn: async () => {
      const range = bankPageRange(page);
      const { data, count, error } = await filteredBankQuery(filters)
        .order("section_order", { nullsFirst: false })
        .order("question_number", { nullsFirst: false })
        .order("id")
        .range(range.from, range.to);
      if (error) throw new Error(error.message);
      const ids = [
        ...new Set((data ?? []).flatMap((row) => (row.stimulus_id ? [row.stimulus_id] : []))),
      ];
      const passages = ids.length
        ? await supabase.from("question_stimuli").select("*").in("id", ids).is("deleted_at", null)
        : { data: [], error: null };
      if (passages.error) throw passages.error;
      return { rows: data ?? [], count: count ?? 0, passages: passages.data ?? [] };
    },
  });
}
