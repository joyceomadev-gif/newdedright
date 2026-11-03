export type ImportRow = Record<string, string>;
export type ExistingStudent = { id: string; admission_no: string; full_name: string; date_of_birth: string | null; deleted_at: string | null };
export type ImportClass = { id: string; name: string };
export type StudentImportEntry = {
  row: number; admission: string; name: string; gender: string;
  status: "Imported" | "Updated" | "Skipped"; reasons: string[]; flags: string[];
};
export function cleanName(value: string): string {
  return value.trim().replace(/[,.\s]+$/g, "").replace(/\s+/g, " ").toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (s) => s.toUpperCase());
}
export function splitStudentName(value: string) {
  const source = value.trim().replace(/[,.\s]+$/g, "");
  const comma = source.indexOf(",");
  const cleaned = cleanName(source);
  const words = cleaned.split(" ");
  const first_name = comma >= 0 ? cleanName(source.slice(comma + 1)) : words[0] ?? "";
  const last_name = comma >= 0 ? cleanName(source.slice(0, comma)) : words.slice(1).join(" ");
  return { first_name, last_name, full_name: [first_name, last_name].filter(Boolean).join(" ") };
}
export function normalizeGender(value: string): "male" | "female" | null {
  const v = value.trim().toLowerCase();
  return v === "male" || v === "m" ? "male" : v === "female" || v === "f" ? "female" : null;
}
function dob(value: string): string {
  if (!value.trim()) return "";
  if (/^\d+(\.\d+)?$/.test(value)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
    return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
  }
  return value.trim();
}
export function planStudentImport(rows: ImportRow[], classes: ImportClass[], existing: ExistingStudent[]) {
  const names = rows.map((r) => splitStudentName(r.full_name ?? ""));
  const admissions = rows.map((r) => (r.admission_no ?? "").trim());
  const identities = rows.map((r, i) => `${names[i]?.full_name}|${dob(r.date_of_birth ?? "")}`);
  const counts = (values: string[]) => values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>());
  const admissionCounts = counts(admissions), identityCounts = counts(identities);
  const existingAdmissions = new Map(existing.map((s) => [s.admission_no, s]));
  const existingIdentities = new Set(existing.filter((s) => !s.deleted_at).map((s) => `${splitStudentName(s.full_name).full_name}|${s.date_of_birth ?? ""}`));
  return rows.map((r, i) => {
    const name = names[i] ?? splitStudentName("");
    const admission = admissions[i] ?? "", identity = identities[i] ?? "";
    const gender = normalizeGender(r.gender ?? ""), date = dob(r.date_of_birth ?? "");
    const className = (r.class_name ?? "").trim();
    const matches = classes.filter((c) => c.name === className);
    const reasons: string[] = [], flags: string[] = [];
    if (/demo|test/i.test(className) || /demo/i.test(r.full_name ?? "")) reasons.push("Test/demo record");
    if (!admission) reasons.push("Missing admission number");
    if (!cleanName(r.full_name ?? "")) reasons.push("Missing full_name");
    if ((admissionCounts.get(admission) ?? 0) > 1) reasons.push("Exact duplicate admission number in file");
    const previous = existingAdmissions.get(admission);
    // Update-in-place only when admission number AND full name both match an active student.
    // Same admission number with a different name is an error — never overwrite.
    const isUpdate = !!previous && !previous.deleted_at && splitStudentName(previous.full_name).full_name === name.full_name;
    if (previous && !isUpdate) {
      reasons.push(previous.deleted_at
        ? "Admission number exists in Recycle Bin"
        : "Admission number belongs to a different student (name mismatch) — not overwritten");
    }
    if (!isUpdate && ((identityCounts.get(identity) ?? 0) > 1 || existingIdentities.has(identity))) reasons.push("Duplicate full name and date of birth — manual decision required");
    if (!gender) flags.push((r.gender ?? "").trim() ? "Unrecognized gender; left empty" : "Blank gender");
    if (!date) flags.push("Blank date of birth");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) reasons.push("Invalid date of birth; use YYYY-MM-DD");
    if (!className) flags.push("Blank class; unassigned");
    else if (matches.length !== 1) { reasons.push(`Unmatched or ambiguous active class: ${className}`); flags.push(`Unmatched class: ${className}`); }
    const entry: StudentImportEntry = { row: i + 2, admission, name: name.full_name, gender: gender ? cleanName(gender) : "Empty", status: "Skipped", reasons, flags };
    return { entry, payload: {
      ...(isUpdate ? { id: previous.id } : {}),
      admission_no: admission, ...name, middle_name: null, gender, date_of_birth: date || null,
      class_id: matches[0]?.id ?? null, address: r.address || null, home_phone: r.phone || null,
      email: r.student_login_email || r.email || null, contact_email_1: r.contact_email_1 || null,
      contact_email_2: r.contact_email_2 || null, contact_phone_1: r.contact_phone_1 || null,
      contact_phone_2: r.contact_phone_2 || null, nationality: r.nationality || null,
      state_of_origin: r.state_of_origin || null, lga: r.lga || null, religion: r.religion || null,
      place_of_birth: r.place_of_birth || null,
    } };
  });
}
export async function executeStudentImport(
  rows: ImportRow[], classes: ImportClass[], existing: ExistingStudent[],
  save: (payload: ReturnType<typeof planStudentImport>[number]["payload"]) => Promise<void>,
) {
  const planned = planStudentImport(rows, classes, existing);
  for (const { entry, payload } of planned) {
    if (entry.reasons.length) continue;
    try { await save(payload); entry.status = "id" in payload ? "Updated" : "Imported"; }
    catch (e) { entry.reasons.push(e instanceof Error ? e.message : String(e)); }
  }
  return planned.map((p) => p.entry);
}
