export const BANK_PAGE_SIZE = 50;
export const BANK_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const BANK_STATUSES = ["draft", "approved", "archived"] as const;
export interface BankFilters {
  search: string;
  classId: string;
  subjectId: string;
  difficulty: string;
  status: string;
}
export interface BankSearch extends BankFilters {
  view: "class" | "list";
  page: number;
}
export const EMPTY_BANK_FILTERS: BankFilters = {
  search: "",
  classId: "",
  subjectId: "",
  difficulty: "",
  status: "",
};
const id = (value: unknown) =>
  typeof value === "string" && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)
    ? value
    : "";
export function parseBankSearch(raw: Record<string, unknown>): BankSearch {
  const page = Number(raw.page);
  return {
    search: typeof raw.search === "string" ? raw.search.trim().slice(0, 200) : "",
    classId: id(raw.classId),
    subjectId: id(raw.subjectId),
    difficulty: BANK_DIFFICULTIES.some((v) => v === raw.difficulty) ? String(raw.difficulty) : "",
    status: BANK_STATUSES.some((v) => v === raw.status) ? String(raw.status) : "",
    view: raw.view === "list" ? "list" : "class",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function bankPageRange(page: number) {
  const safe = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return { from: (safe - 1) * BANK_PAGE_SIZE, to: safe * BANK_PAGE_SIZE - 1 };
}
export function bankReadAllowed(isStaff: boolean, parentRead: boolean, submoduleRead: boolean) {
  return isStaff && parentRead && submoduleRead;
}
// Escape LIKE metacharacters: search is literal text, not a wildcard query.
export function bankSearchPattern(search: string) {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

export function bankGroupCounts(
  rows: Array<{ class_id: string | null; subject_id: string | null }>,
) {
  const counts = new Map<string, { count: number; subjects: Map<string, number> }>();
  for (const row of rows) {
    if (!row.class_id) continue;
    const group = counts.get(row.class_id) ?? { count: 0, subjects: new Map<string, number>() };
    group.count += 1;
    if (row.subject_id)
      group.subjects.set(row.subject_id, (group.subjects.get(row.subject_id) ?? 0) + 1);
    counts.set(row.class_id, group);
  }
  return counts;
}
