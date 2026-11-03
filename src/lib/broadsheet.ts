import type { AssessmentComponent } from "@/lib/assessment-config";
import { rescaleStoredScore } from "@/lib/assessment-config";
import type { GradeBand } from "@/lib/scoring";

/* =================================================================================
 * Pure helpers for the broadsheet entry → report → portal pipeline.
 * These functions carry no I/O so they can be unit-tested directly and so every
 * consumer agrees on the same score-merging and scaling rules.
 * ================================================================================= */

// ---------------------------------------------------------------------------
// Column layout for the numeric entry grid (single source of truth so the
// subheader row and the cell row can never drift apart).
// ---------------------------------------------------------------------------

export type BroadSheetColumnKind = "CA1" | "CA2" | "CA3" | "SUM_CA" | "EXAM" | "TOTAL";

export interface BroadSheetColumnSpec {
  kind: BroadSheetColumnKind;
  h: string;
  w: string;
}

export function broadsheetColumns(
  showCa1: boolean,
  showCa2: boolean,
  showCa3: boolean,
  showExam: boolean
): BroadSheetColumnSpec[] {
  return [
    ...(showCa1 ? [{ kind: "CA1" as const, h: "CA1", w: "min-w-[60px]" }] : []),
    ...(showCa2 ? [{ kind: "CA2" as const, h: "CA2", w: "min-w-[60px]" }] : []),
    ...(showCa3 ? [{ kind: "CA3" as const, h: "CA3", w: "min-w-[60px]" }] : []),
    { kind: "SUM_CA" as const, h: "∑CA", w: "min-w-[56px]" },
    ...(showExam ? [{ kind: "EXAM" as const, h: "Exam", w: "min-w-[64px]" }] : []),
    { kind: "TOTAL" as const, h: "Total", w: "min-w-[60px]" },
  ];
}

// ---------------------------------------------------------------------------
// Entry validation (bounds + empty-sheet guard)
// ---------------------------------------------------------------------------

export interface BroadsheetRow {
  student_id: string;
  subject_id: string;
  ca1: number | null;
  ca2: number | null;
  ca3: number | null;
  exam_score: number | null;
}

export interface BroadsheetValidateOptions {
  showCa1: boolean;
  showCa2: boolean;
  showCa3: boolean;
  showExam: boolean;
  componentMax: (code: string) => number;
  studentName?: (studentId: string) => string;
  subjectName?: (subjectId: string) => string;
  /** Reject a sheet with no marks at all. Default true. */
  requireAnyMark?: boolean;
}

export function validateBroadsheetRows(
  rows: BroadsheetRow[],
  opts: BroadsheetValidateOptions
): string[] {
  const { showCa1, showCa2, showCa3, showExam, componentMax } = opts;
  const name = (id: string) => opts.studentName?.(id) ?? id;
  const sname = (id: string) => opts.subjectName?.(id) ?? id;

  const hasAnyMarks = rows.some((r) =>
    [
      showCa1 && r.ca1 != null,
      showCa2 && r.ca2 != null,
      showCa3 && r.ca3 != null,
      showExam && r.exam_score != null,
    ].some(Boolean)
  );
  if (opts.requireAnyMark !== false && !hasAnyMarks) {
    return ["Cannot validate an empty broadsheet. Please enter student scores first."];
  }

  const bad: string[] = [];
  for (const r of rows) {
    const maxCa1 = componentMax("CA1");
    const maxCa2 = componentMax("CA2");
    const maxCa3 = componentMax("CA3");
    const maxExam = componentMax("EXAM");

    if (showCa1 && r.ca1 != null && (r.ca1 < 0 || r.ca1 > maxCa1)) {
      bad.push(`${name(r.student_id)} · ${sname(r.subject_id)}: CA1 (${r.ca1}) must be between 0 and ${maxCa1}`);
    }
    if (showCa2 && r.ca2 != null && (r.ca2 < 0 || r.ca2 > maxCa2)) {
      bad.push(`${name(r.student_id)} · ${sname(r.subject_id)}: CA2 (${r.ca2}) must be between 0 and ${maxCa2}`);
    }
    if (showCa3 && r.ca3 != null && (r.ca3 < 0 || r.ca3 > maxCa3)) {
      bad.push(`${name(r.student_id)} · ${sname(r.subject_id)}: CA3 (${r.ca3}) must be between 0 and ${maxCa3}`);
    }
    if (showExam && r.exam_score != null && (r.exam_score < 0 || r.exam_score > maxExam)) {
      bad.push(`${name(r.student_id)} · ${sname(r.subject_id)}: Exam (${r.exam_score}) must be between 0 and ${maxExam}`);
    }
  }
  return bad;
}

// ---------------------------------------------------------------------------
// Duplicate-row policy (I5): when several continuous_assessments rows share a
// (subject, ca_type), the authoritative synced "[broadsheet]" row wins;
// otherwise the most recently recorded row wins.
// ---------------------------------------------------------------------------

export const BROADSHEET_TITLE_PREFIX = "[broadsheet]";

export function pickPreferredRow<T extends { title?: string | null; created_at?: string | null }>(
  rows: T[]
): T | undefined {
  if (!rows || rows.length === 0) return undefined;
  const synced = rows.find((r) => r.title?.startsWith(BROADSHEET_TITLE_PREFIX));
  if (synced) return synced;
  return [...rows].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  )[0];
}

/** Collapse a list of CA rows to at most one per (subject_id, ca_type). */
export function dedupeCaRows<T extends { subject_id: string; ca_type: string; title?: string | null; created_at?: string | null }>(
  rows: T[]
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = `${r.subject_id}::${(r.ca_type || "").toUpperCase()}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const out: T[] = [];
  for (const list of groups.values()) {
    const picked = pickPreferredRow(list);
    if (picked) out.push(picked);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Score matrix (Class Broadsheet Report): processed_results (0–100, rescaled
// back to component scale) → continuous_assessments → raw broadsheet rows
// (authoritative). Rows are deduped per the I5 policy.
// ---------------------------------------------------------------------------

export interface ProcessedScoreRow {
  student_id: string;
  subject_id: string;
  ca1_score: number | null;
  ca2_score: number | null;
  ca3_score: number | null;
  exam_score: number | null;
}

export interface CAScoreRow {
  student_id: string;
  subject_id: string;
  ca_type: string;
  score: number;
  max_score?: number | null;
  title?: string | null;
  created_at?: string | null;
}

export interface BroadSheetScoreRow {
  student_id: string;
  subject_id: string;
  ca1: number | null;
  ca2: number | null;
  ca3: number | null;
  exam_score: number | null;
}

export function buildScoreMatrix(
  processedRows: ProcessedScoreRow[],
  assessmentScores: CAScoreRow[],
  broadsheetRows: BroadSheetScoreRow[],
  compMax: (code: string) => number
): Record<string, Record<string, Record<string, number>>> {
  const map: Record<string, Record<string, Record<string, number>>> = {};
  const setScore = (stId: string, subId: string, compCode: string, val: number | null | undefined) => {
    if (val == null || Number.isNaN(Number(val))) return;
    if (!map[stId]) map[stId] = {};
    if (!map[stId][subId]) map[stId][subId] = {};
    map[stId][subId][compCode.toUpperCase()] = Number(val);
  };

  // 1. Processed results as fallback (0–100% converted back to component scale)
  for (const r of processedRows || []) {
    if (r.ca1_score != null) setScore(r.student_id, r.subject_id, "CA1", (Number(r.ca1_score) / 100) * compMax("CA1"));
    if (r.ca2_score != null) setScore(r.student_id, r.subject_id, "CA2", (Number(r.ca2_score) / 100) * compMax("CA2"));
    if (r.ca3_score != null) setScore(r.student_id, r.subject_id, "CA3", (Number(r.ca3_score) / 100) * compMax("CA3"));
    if (r.exam_score != null) setScore(r.student_id, r.subject_id, "EXAM", (Number(r.exam_score) / 100) * compMax("EXAM"));
  }

  // 2. Direct continuous assessments (deduped; legacy max=100 rows rescaled)
  const deduped = dedupeCaRows(assessmentScores || []);
  for (const r of deduped) {
    const code = (r.ca_type || "").toUpperCase();
    const compMaxForCode = compMax(code);
    setScore(
      r.student_id,
      r.subject_id,
      code,
      rescaleStoredScore(Number(r.score) || 0, r.max_score, compMaxForCode)
    );
  }

  // 3. Broadsheet rows (authoritative raw marks)
  for (const r of broadsheetRows || []) {
    if (r.ca1 != null) setScore(r.student_id, r.subject_id, "CA1", r.ca1);
    if (r.ca2 != null) setScore(r.student_id, r.subject_id, "CA2", r.ca2);
    if (r.ca3 != null) setScore(r.student_id, r.subject_id, "CA3", r.ca3);
    if (r.exam_score != null) setScore(r.student_id, r.subject_id, "EXAM", r.exam_score);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Report card subject map (LevelSpecificReportCards): CA rows deduped and
// legacy max=100 rows rescaled to the component scale.
// ---------------------------------------------------------------------------

export function buildSubjectScoreMap(
  caRows: Array<
    Pick<CAScoreRow, "subject_id" | "ca_type" | "score" | "max_score" | "title" | "created_at">
  >,
  components: AssessmentComponent[]
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {};
  const groups = new Map<string, Array<Pick<CAScoreRow, "subject_id" | "ca_type" | "score" | "max_score" | "title" | "created_at">>>();
  for (const r of caRows || []) {
    const code = (r.ca_type || "").toUpperCase();
    const key = `${r.subject_id}::${code}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    const [subjectId, code] = key.split("::");
    const picked = pickPreferredRow(list);
    if (!picked) continue;
    const comp = components.find((c) => c.code.toUpperCase() === code);
    const effectiveScore = rescaleStoredScore(
      Number(picked.score) || 0,
      picked.max_score,
      comp?.max_score
    );
    if (!map[subjectId]) map[subjectId] = {};
    map[subjectId][code] = effectiveScore;
  }
  return map;
}

/** Merge authoritative broadsheet raw marks into a subject score map. */
export function mergeBroadsheetScores(
  map: Record<string, Record<string, number>>,
  bsRows: BroadSheetScoreRow[]
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = { ...map };
  for (const b of bsRows || []) {
    if (!out[b.subject_id]) out[b.subject_id] = {};
    if (b.ca1 != null) out[b.subject_id]["CA1"] = Number(b.ca1);
    if (b.ca2 != null) out[b.subject_id]["CA2"] = Number(b.ca2);
    if (b.ca3 != null) out[b.subject_id]["CA3"] = Number(b.ca3);
    if (b.exam_score != null) out[b.subject_id]["EXAM"] = Number(b.exam_score);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Student portal results card rows (student.tsx ResultsCardTab)
// ---------------------------------------------------------------------------

export interface PortalCaRow {
  score: number;
  max_score: number;
  ca_type: string;
  title?: string | null;
  created_at?: string | null;
  subject: { id: string; name: string } | null;
}

export interface PortalExamRow {
  score: number;
  grade: string | null;
  remark: string | null;
  exam: { max_score: number; subject: { id: string; name: string } | null } | null;
}

export interface ResultsCardRow {
  subject: string;
  ca1: number | null;
  ca2: number | null;
  exam: number | null;
  exam_max: number;
  total: number;
  grade: string | null;
  remark: string | null;
}

export interface BuildResultsCardRowsArgs {
  caRows: PortalCaRow[];
  examRows: PortalExamRow[];
  bsRows: BroadSheetScoreRow[];
  allSubjects: Array<{ id: string; name: string }>;
  settings?: { ca1_weight?: number; ca2_weight?: number; exam_weight?: number; grading_scale?: unknown } | null;
  structure?: { components?: AssessmentComponent[] } | null;
  gradingBands?: (GradeBand & { grade_point?: number })[] | null;
}

export function buildResultsCardRows(args: BuildResultsCardRowsArgs): ResultsCardRow[] {
  const { caRows, examRows, bsRows, allSubjects, settings, structure, gradingBands } = args;
  const subjectNameMap = new Map<string, string>();
  (allSubjects || []).forEach((s) => subjectNameMap.set(s.id, s.name));

  const comps = structure?.components ?? [];
  const ca1Comp = comps.find((c) => c.code.toUpperCase() === "CA1");
  const ca2Comp = comps.find((c) => c.code.toUpperCase() === "CA2");
  const examComp = comps.find((c) => c.code.toUpperCase() === "EXAM");

  // I6: prefer the resolved structure's weights/maxes, fall back to settings.
  const ca1W = Number(ca1Comp?.weight_percentage ?? settings?.ca1_weight ?? 15);
  const ca2W = Number(ca2Comp?.weight_percentage ?? settings?.ca2_weight ?? 15);
  const exW = Number(examComp?.weight_percentage ?? settings?.exam_weight ?? 70);
  const ca1Max = Number(ca1Comp?.max_score ?? settings?.ca1_weight ?? 15);
  const ca2Max = Number(ca2Comp?.max_score ?? settings?.ca2_weight ?? 15);
  const examMax = Number(examComp?.max_score ?? settings?.exam_weight ?? 70);
  const settingsBands = (settings?.grading_scale ?? []) as GradeBand[];

  const byKey = new Map<string, ResultsCardRow>();
  const get = (name: string): ResultsCardRow => {
    const ex = byKey.get(name);
    if (ex) return ex;
    const row: ResultsCardRow = {
      subject: name, ca1: null, ca2: null, exam: null, exam_max: 100,
      total: 0, grade: null, remark: null,
    };
    byKey.set(name, row);
    return row;
  };

  // CA rows (deduped per subject + ca_type, synced rows preferred)
  const caBySubject = new Map<string, PortalCaRow[]>();
  for (const c of caRows || []) {
    if (!c.subject) continue;
    const list = caBySubject.get(c.subject.name) ?? [];
    list.push(c);
    caBySubject.set(c.subject.name, list);
  }
  for (const [subjectName, list] of caBySubject) {
    const r = get(subjectName);
    const ca1Row = pickPreferredRow(list.filter((c) => (c.ca_type || "").toLowerCase() === "ca1"));
    const ca2Row = pickPreferredRow(list.filter((c) => (c.ca_type || "").toLowerCase() === "ca2"));
    const examRow = pickPreferredRow(list.filter((c) => (c.ca_type || "").toLowerCase() === "exam"));
    if (ca1Row) r.ca1 = Math.round(((Number(ca1Row.score) / Number(ca1Row.max_score || 1)) * 10) * 10) / 10;
    if (ca2Row) r.ca2 = Math.round(((Number(ca2Row.score) / Number(ca2Row.max_score || 1)) * 10) * 10) / 10;
    if (examRow) {
      r.exam = Number(examRow.score);
      r.exam_max = Number(examRow.max_score) || 70;
    }
  }

  // CBT / published exam results override the synced exam row
  for (const e of examRows || []) {
    if (!e.exam?.subject) continue;
    const r = get(e.exam.subject.name);
    r.exam = Number(e.score);
    r.exam_max = Number(e.exam.max_score) || 100;
    r.grade = e.grade;
    r.remark = e.remark;
  }

  // Broadsheet backfill (only when the CA/exam sources left a gap)
  for (const b of bsRows || []) {
    const subName = subjectNameMap.get(b.subject_id);
    if (!subName) continue;
    const r = get(subName);
    if (b.ca1 != null && r.ca1 == null) r.ca1 = Math.round((Number(b.ca1) / ca1Max) * 10 * 10) / 10;
    if (b.ca2 != null && r.ca2 == null) r.ca2 = Math.round((Number(b.ca2) / ca2Max) * 10 * 10) / 10;
    if (b.exam_score != null && r.exam == null) {
      r.exam = Number(b.exam_score);
      r.exam_max = examMax;
    }
  }

  return Array.from(byKey.values()).map((r) => {
    const ca1Pts = ((r.ca1 ?? 0) / 10) * ca1W;
    const ca2Pts = ((r.ca2 ?? 0) / 10) * ca2W;
    const examPts = r.exam != null ? (r.exam / r.exam_max) * exW : 0;
    const total = Math.round((ca1Pts + ca2Pts + examPts) * 10) / 10;
    const dynamicGrade = gradingBands?.length ? bandsGrade(gradingBands, total) : null;
    const band = settingsBands.find((b) => total >= b.min && total <= b.max);
    return {
      ...r,
      total,
      grade: dynamicGrade?.grade ?? band?.grade ?? r.grade ?? null,
      remark: dynamicGrade?.remark ?? band?.remark ?? r.remark ?? null,
    };
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}

// ---------------------------------------------------------------------------
// ProcessResultsPanel helpers
// ---------------------------------------------------------------------------

/** Dynamic-path score map from CA rows (exam rows excluded by the caller). */
export function buildCaScoreMap(
  caRows: CAScoreRow[],
  componentMax: (code: string) => number
): Record<string, number | null> {
  const scoreMap: Record<string, number | null> = {};
  for (const c of dedupeCaRows(caRows || [])) {
    const code = (c.ca_type || "").toUpperCase();
    const cMax = componentMax(code);
    scoreMap[code] =
      c.max_score === 100 && cMax !== 100 ? (Number(c.score) / 100) * cMax : Number(c.score);
  }
  return scoreMap;
}

export interface ResolveExamFallbackArgs {
  result?: { score: number } | null;
  examMaxFromExam?: number;
  examCARows: CAScoreRow[];
  bsExam?: number | null;
  componentMaxExam: number;
}

/** Exam score precedence: CBT/published result → synced exam CA row → broadsheet raw. */
export function resolveExamFallback(args: ResolveExamFallbackArgs): { examRawScore: number | null; examMax: number } {
  if (args.result != null) {
    return { examRawScore: Number(args.result.score), examMax: args.examMaxFromExam ?? 0 };
  }
  const syncedExam = pickPreferredRow(args.examCARows || []);
  if (syncedExam) {
    return {
      examRawScore: Number(syncedExam.score),
      examMax: Number(syncedExam.max_score) || args.componentMaxExam,
    };
  }
  if (args.bsExam != null) {
    return { examRawScore: Number(args.bsExam), examMax: args.componentMaxExam };
  }
  return { examRawScore: null, examMax: 0 };
}

// ---------------------------------------------------------------------------
// Publish / unpublish orchestration (I3/I4): flip header status, copy comments
// into report_cards, and open/close the student & parent portal gate.
// ---------------------------------------------------------------------------

export interface DbLike {
  from: (table: string) => any;
  rpc: (fn: string, args?: any) => Promise<{ data?: any; error?: any }>;
}

export interface PublishScope {
  headerId: string;
  sessionId: string;
  termId: string;
  classId: string;
  publishedBy?: string | null;
}

export async function publishBroadsheetAndOpenPortal(db: DbLike, scope: PublishScope) {
  // All fallible side-effects run BEFORE the header-status commit so a failure in
  // any of them never leaves the sheet half-published (status flipped, gate closed).

  // 1. Copy teacher/principal comments into report_cards so report cards & portal see them.
  const { data: comments, error: cErr } = await db
    .from("broadsheet_student_comments")
    .select("student_id,teacher_comment,principal_comment")
    .eq("header_id", scope.headerId);
  if (cErr) throw cErr;
  if (comments && comments.length > 0) {
    const payload = (comments as Array<{ student_id: string; teacher_comment: string | null; principal_comment: string | null }>).map(
      (c) => ({
        student_id: c.student_id,
        term_id: scope.termId,
        class_id: scope.classId,
        teacher_comment: c.teacher_comment || null,
        principal_comment: c.principal_comment || null,
      })
    );
    const { error: rErr } = await db.from("report_cards").upsert(payload, { onConflict: "student_id,term_id" });
    if (rErr) throw rErr;
  }

  // 2. Open the student/parent portal gate (same RPC the Academics "Publish all" uses).
  const { error: pErr } = await db.rpc("publish_results", {
    _session_id: scope.sessionId,
    _term_id: scope.termId,
    _class_id: scope.classId,
    _exam_type: "combined",
  });
  if (pErr) throw pErr;

  // 3. Commit point: flip the header status LAST (fires the sync trigger inside the
  //    same DB transaction). On failure, compensate by closing the gate again so
  //    students never see results for a sheet that is still marked draft/validated.
  const { error: hErr } = await db
    .from("broadsheet_headers")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: scope.publishedBy ?? null,
    })
    .eq("id", scope.headerId);
  if (hErr) {
    await db
      .rpc("unpublish_results", {
        _session_id: scope.sessionId,
        _term_id: scope.termId,
        _class_id: scope.classId,
        _exam_type: "combined",
      })
      .then(() => null, () => null); // best-effort compensation; the original error wins
    throw hErr;
  }
}

export async function unpublishBroadsheetAndClosePortal(db: DbLike, scope: PublishScope) {
  // Close the gate FIRST, then flip the header to draft as the commit point.
  // If the gate close fails nothing has changed and the teacher can retry; if the
  // header flip then fails the sheet stays published but results are already hidden
  // (safe direction — no student sees marks while a teacher is mid-edit).
  const { error: pErr } = await db.rpc("unpublish_results", {
    _session_id: scope.sessionId,
    _term_id: scope.termId,
    _class_id: scope.classId,
    _exam_type: "combined",
  });
  if (pErr) throw pErr;

  const { error: hErr } = await db
    .from("broadsheet_headers")
    .update({ status: "draft", validated_at: null, published_at: null })
    .eq("id", scope.headerId);
  if (hErr) throw hErr;
}

// ---------------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------------

function bandsGrade(
  bands: (GradeBand & { grade_point?: number })[],
  score: number
): (GradeBand & { grade_point?: number }) | null {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => score >= b.min) ?? null;
}

// ---------------------------------------------------------------------------
// Auto-population: Pull CBT exam results and CAs into Broadsheet
// ---------------------------------------------------------------------------

export interface PopulateScope {
  headerId: string;
  sessionId: string;
  termId: string;
  classId: string;
}

export interface PopulateOptions {
  componentMax?: (code: string) => number;
  /** If true, write changes directly to broadsheets table in db. Defaults to true. */
  persistToDb?: boolean;
}

export interface PopulateResult {
  populatedCount: number;
  matchedStudents: number;
  caScoresCount: number;
  examScoresCount: number;
  patches: Record<
    string,
    {
      student_id: string;
      subject_id: string;
      ca1?: number | null;
      ca2?: number | null;
      ca3?: number | null;
      exam_score?: number | null;
    }
  >;
}

/**
 * Queries continuous_assessments and CBT exam results for a given class/term,
 * normalises the marks according to component scale, and populates the broadsheet.
 * If no CBT exams or CAs exist, returns populatedCount: 0 cleanly without errors.
 */
export async function populateBroadsheetFromCbtAndCas(
  db: any,
  scope: PopulateScope,
  options?: PopulateOptions
): Promise<PopulateResult> {
  const compMax =
    options?.componentMax ??
    ((code: string) => (code.toUpperCase().startsWith("EXAM") ? 70 : 15));
  const persist = options?.persistToDb ?? true;

  // 1. Fetch active students & subjects for this class
  const [studentsRes, subjectsRes, casRes, examsRes] = await Promise.all([
    db
      .from("students")
      .select("id")
      .eq("class_id", scope.classId)
      .eq("status", "active"),
    db.from("subjects").select("id").eq("class_id", scope.classId),
    db
      .from("continuous_assessments")
      .select("id,student_id,subject_id,ca_type,score,max_score,title,created_at")
      .eq("class_id", scope.classId)
      .eq("term_id", scope.termId),
    db
      .from("exams")
      .select("id,subject_id,max_score")
      .eq("class_id", scope.classId)
      .eq("term_id", scope.termId),
  ]);

  if (studentsRes.error) throw studentsRes.error;
  if (subjectsRes.error) throw subjectsRes.error;
  if (casRes.error) throw casRes.error;
  if (examsRes.error) throw examsRes.error;

  const students = (studentsRes.data ?? []) as Array<{ id: string }>;
  const subjects = (subjectsRes.data ?? []) as Array<{ id: string }>;
  const studentIds = new Set(students.map((s) => s.id));
  const subjectIds = new Set(subjects.map((s) => s.id));

  // Exclude previously synced broadsheet rows to avoid circular feedback loops
  const rawCas = (
    (casRes.data ?? []) as Array<{
      id: string;
      student_id: string;
      subject_id: string;
      ca_type: string;
      score: number;
      max_score?: number | null;
      title?: string | null;
      created_at?: string | null;
    }>
  ).filter(
    (c) =>
      studentIds.has(c.student_id) &&
      subjectIds.has(c.subject_id) &&
      (!c.title || !c.title.startsWith(BROADSHEET_TITLE_PREFIX))
  );

  const exams = (examsRes.data ?? []) as Array<{
    id: string;
    subject_id: string;
    max_score: number;
  }>;
  const examIds = exams.map((e) => e.id);

  // 2. Fetch CBT results if exams exist
  let results: Array<{ student_id: string; exam_id: string; score: number }> = [];
  if (examIds.length > 0) {
    const { data: resData, error: resErr } = await db
      .from("results")
      .select("student_id,exam_id,score")
      .in("exam_id", examIds);
    if (resErr) throw resErr;
    results = (resData ?? []) as Array<{
      student_id: string;
      exam_id: string;
      score: number;
    }>;
  }

  // Index exams by subject_id -> exam
  const examBySubject = new Map<
    string,
    { id: string; subject_id: string; max_score: number }
  >();
  for (const e of exams) {
    if (!examBySubject.has(e.subject_id)) examBySubject.set(e.subject_id, e);
  }

  const resultsByExamAndStudent = new Map<string, number>();
  for (const r of results) {
    resultsByExamAndStudent.set(`${r.exam_id}__${r.student_id}`, Number(r.score));
  }

  // Index CAs per (student, subject)
  const caMap = new Map<string, Array<(typeof rawCas)[0]>>();
  for (const c of rawCas) {
    const k = `${c.student_id}__${c.subject_id}`;
    const list = caMap.get(k) ?? [];
    list.push(c);
    caMap.set(k, list);
  }

  const patches: PopulateResult["patches"] = {};
  const matchedStudentSet = new Set<string>();
  let caScoresCount = 0;
  let examScoresCount = 0;

  for (const st of students) {
    for (const sub of subjects) {
      const key = `${st.id}__${sub.id}`;
      const stCas = caMap.get(key) ?? [];
      const ex = examBySubject.get(sub.id);
      const cbtScore = ex
        ? resultsByExamAndStudent.get(`${ex.id}__${st.id}`)
        : undefined;

      let ca1: number | null = null;
      let ca2: number | null = null;
      let ca3: number | null = null;
      let examScore: number | null = null;

      // Match CAs
      const ca1Row = pickPreferredRow(
        stCas.filter(
          (c) =>
            (c.ca_type || "").toLowerCase() === "ca1" ||
            (c.title || "").toLowerCase().includes("ca1")
        )
      );
      if (ca1Row && ca1Row.score != null) {
        ca1 = rescaleStoredScore(
          Number(ca1Row.score),
          ca1Row.max_score,
          compMax("CA1")
        );
        caScoresCount++;
      }

      const ca2Row = pickPreferredRow(
        stCas.filter(
          (c) =>
            (c.ca_type || "").toLowerCase() === "ca2" ||
            (c.title || "").toLowerCase().includes("ca2")
        )
      );
      if (ca2Row && ca2Row.score != null) {
        ca2 = rescaleStoredScore(
          Number(ca2Row.score),
          ca2Row.max_score,
          compMax("CA2")
        );
        caScoresCount++;
      }

      const ca3Row = pickPreferredRow(
        stCas.filter(
          (c) =>
            (c.ca_type || "").toLowerCase() === "ca3" ||
            (c.title || "").toLowerCase().includes("ca3")
        )
      );
      if (ca3Row && ca3Row.score != null) {
        ca3 = rescaleStoredScore(
          Number(ca3Row.score),
          ca3Row.max_score,
          compMax("CA3")
        );
        caScoresCount++;
      }

      // Match Exam: published CBT result first, then direct CA of ca_type 'exam'
      if (cbtScore != null) {
        examScore = rescaleStoredScore(
          cbtScore,
          ex?.max_score,
          compMax("EXAM")
        );
        examScoresCount++;
      } else {
        const examCaRow = pickPreferredRow(
          stCas.filter((c) => (c.ca_type || "").toLowerCase() === "exam")
        );
        if (examCaRow && examCaRow.score != null) {
          examScore = rescaleStoredScore(
            Number(examCaRow.score),
            examCaRow.max_score,
            compMax("EXAM")
          );
          examScoresCount++;
        }
      }

      if (ca1 != null || ca2 != null || ca3 != null || examScore != null) {
        matchedStudentSet.add(st.id);
        const patchKey = `${st.id}|${sub.id}`;
        patches[patchKey] = {
          student_id: st.id,
          subject_id: sub.id,
          ca1,
          ca2,
          ca3,
          exam_score: examScore,
        };
      }
    }
  }

  const populatedCount = caScoresCount + examScoresCount;

  // 3. Persist to DB if requested and records found
  if (persist && Object.keys(patches).length > 0) {
    const payload = Object.values(patches).map((p) => ({
      header_id: scope.headerId,
      session_id: scope.sessionId,
      term_id: scope.termId,
      class_id: scope.classId,
      student_id: p.student_id,
      subject_id: p.subject_id,
      ca1: p.ca1 ?? null,
      ca2: p.ca2 ?? null,
      ca3: p.ca3 ?? null,
      exam_score: p.exam_score ?? null,
    }));
    const { error: upsertErr } = await db.from("broadsheets").upsert(payload, {
      onConflict: "session_id,term_id,class_id,student_id,subject_id",
    });
    if (upsertErr) throw upsertErr;
  }

  return {
    populatedCount,
    matchedStudents: matchedStudentSet.size,
    caScoresCount,
    examScoresCount,
    patches,
  };
}