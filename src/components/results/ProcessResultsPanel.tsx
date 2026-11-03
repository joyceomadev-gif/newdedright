import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Cog, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useSchoolSettings, computeTermTotal, gradeFor, pct, type SchoolSettings,
} from "@/lib/scoring";
import {
  useResolvedAssessmentStructure,
  useResolvedGradingScale,
  gradeForDynamicScale,
  computeDynamicTotalScore,
} from "@/lib/assessment-config";
import { dedupeCaRows, buildCaScoreMap, resolveExamFallback } from "@/lib/broadsheet";

interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; session_id: string; is_current: boolean }
interface SessionRow { id: string; name: string; is_current: boolean }
interface StudentRow { id: string; full_name: string; class_id: string | null }
interface SubjectRow { id: string; name: string; class_id: string | null }
interface CARow { student_id: string; subject_id: string; ca_type: string; score: number; max_score: number }
interface ExamRow { id: string; subject_id: string; class_id: string; term_id: string; max_score: number }
interface ResultRow { student_id: string; exam_id: string; score: number }
interface RunRow {
  id: string; class_id: string; term_id: string; session_id: string; exam_type: string;
  students_processed: number; subjects_processed: number; rows_written: number;
  duration_ms: number | null; created_at: string; is_reprocess: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

export function ProcessResultsPanel() {
  const qc = useQueryClient();
  const { data: settings } = useSchoolSettings();

  const { data: sessions } = useQuery({
    queryKey: ["proc-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["proc-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,session_id,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: classes } = useQuery({
    queryKey: ["proc-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const currentSession = (sessions ?? []).find((s) => s.is_current);
  const currentTerm = (terms ?? []).find((t) => t.is_current);

  const [sessionId, setSessionId] = useState<string | undefined>(currentSession?.id);
  const [termId, setTermId] = useState<string | undefined>(currentTerm?.id);
  const [classId, setClassId] = useState<string | undefined>();
  const [examType, setExamType] = useState<string>("combined");

  const effSession = sessionId ?? currentSession?.id;
  const effTerm = termId ?? currentTerm?.id;

  const termsForSession = useMemo(
    () => (terms ?? []).filter((t) => !effSession || t.session_id === effSession),
    [terms, effSession],
  );

  const { data: selectedClassObj } = useQuery({
    queryKey: ["proc-class-obj", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").eq("id", classId!).single();
      if (error) throw error;
      return data;
    },
  });

  // Resolve dynamic assessment structure & grading scale by class level (e.g. primary)
  const { data: activeStructure } = useResolvedAssessmentStructure(classId, null, effTerm, effSession, selectedClassObj?.level);
  const { data: activeGradingScale } = useResolvedGradingScale(classId, null, selectedClassObj?.level);

  const { data: runs, refetch: refetchRuns } = useQuery({
    queryKey: ["proc-runs", effSession, effTerm, classId, examType],
    enabled: !!effSession && !!effTerm && !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("result_processing_runs")
        .select("id,class_id,term_id,session_id,exam_type,students_processed,subjects_processed,rows_written,duration_ms,created_at,is_reprocess")
        .eq("session_id", effSession!).eq("term_id", effTerm!).eq("class_id", classId!).eq("exam_type", examType)
        .order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const process = useMutation({
    mutationFn: async () => {
      if (!effSession || !effTerm || !classId) throw new Error("Select session, term and class");
      if (!settings) throw new Error("School settings not loaded");
      const started = performance.now();

      // Load raw data in parallel (CAs, Exams, CBT Results, and Broadsheets)
      const [studentsRes, subjectsRes, casRes, examsRes, broadsheetsRes, existingRes] = await Promise.all([
        supabase.from("students").select("id,full_name,class_id").eq("class_id", classId).eq("status", "active"),
        supabase.from("subjects").select("id,name,class_id"),
        supabase.from("continuous_assessments").select("student_id,subject_id,ca_type,score,max_score,title,created_at").eq("term_id", effTerm),
        supabase.from("exams").select("id,subject_id,class_id,term_id,max_score").eq("term_id", effTerm).eq("class_id", classId),
        supabase.from("broadsheets").select("student_id,subject_id,ca1,ca2,ca3,exam_score").eq("session_id", effSession).eq("term_id", effTerm).eq("class_id", classId),
        supabase.from("processed_results").select("id").eq("session_id", effSession).eq("term_id", effTerm).eq("class_id", classId).eq("exam_type", examType),
      ]);
      for (const r of [studentsRes, subjectsRes, casRes, examsRes, broadsheetsRes, existingRes]) if (r.error) throw r.error;
      const students = (studentsRes.data ?? []) as StudentRow[];
      const allSubjects = (subjectsRes.data ?? []) as SubjectRow[];
      const cas = (casRes.data ?? []) as CARow[];
      const exams = (examsRes.data ?? []) as ExamRow[];
      const broadsheets = (broadsheetsRes.data ?? []) as { student_id: string; subject_id: string; ca1: number | null; ca2: number | null; ca3: number | null; exam_score: number | null }[];
      const isReprocess = (existingRes.data ?? []).length > 0;

      if (students.length === 0) throw new Error("No active students in this class");

      // Determine subjects: those with any CA, exam, or broadsheet score for these students
      const subjectIdsSet = new Set<string>();
      for (const c of cas) if (students.some((s) => s.id === c.student_id)) subjectIdsSet.add(c.subject_id);
      for (const e of exams) subjectIdsSet.add(e.subject_id);
      for (const b of broadsheets) if (students.some((s) => s.id === b.student_id)) subjectIdsSet.add(b.subject_id);
      const subjects = allSubjects.filter((s) => subjectIdsSet.has(s.id));
      if (subjects.length === 0) throw new Error("No subjects with scores found for this term/class");

      // Fetch results for exams
      const examIds = exams.map((e) => e.id);
      let results: ResultRow[] = [];
      if (examIds.length > 0) {
        const { data, error } = await supabase.from("results").select("student_id,exam_id,score").in("exam_id", examIds);
        if (error) throw error;
        results = (data ?? []) as ResultRow[];
      }

      // Index CAs, CBT results, and broadsheets per (student, subject)
      const caIx = new Map<string, CARow[]>();
      for (const c of cas) {
        const k = `${c.student_id}__${c.subject_id}`;
        (caIx.get(k) ?? caIx.set(k, []).get(k)!).push(c);
      }
      const examBySubject = new Map<string, ExamRow>();
      for (const e of exams) if (!examBySubject.has(e.subject_id)) examBySubject.set(e.subject_id, e);
      const resultsByExam = new Map<string, ResultRow[]>();
      for (const r of results) {
        (resultsByExam.get(r.exam_id) ?? resultsByExam.set(r.exam_id, []).get(r.exam_id)!).push(r);
      }
      const bsMap = new Map<string, { ca1: number | null; ca2: number | null; ca3: number | null; exam_score: number | null }>();
      for (const b of broadsheets) {
        bsMap.set(`${b.student_id}__${b.subject_id}`, b);
      }

      // Per-student-subject computed row
      type Row = {
        student_id: string; subject_id: string;
        ca1: number | null; ca2: number | null; ca3: number | null;
        ca_total: number | null; exam_score: number | null; total: number;
        grade: string | null; remark: string | null;
      };
      const rows: Row[] = [];
      const useDynamic = !!(activeStructure?.components && activeStructure.components.length > 0);

      for (const st of students) {
        for (const sub of subjects) {
          const key = `${st.id}__${sub.id}`;
          const allStCAs = caIx.get(key) ?? [];
          // Exam rows never contaminate CA averages; dedupe per ca_type (I5).
          const stCAs = dedupeCaRows(allStCAs.filter((c) => c.ca_type.toLowerCase() !== "exam"));
          const caPcts = stCAs.map((c) => pct(c.score, c.max_score));
          const bs = bsMap.get(key);

          // Helper: resolve max_score for a component code from the active structure
          // Falls back to sensible defaults when no structure is configured.
          const componentMax = (code: string): number => {
            const comp = activeStructure?.components?.find(
              (c) => c.code.toUpperCase() === code.toUpperCase()
            );
            return comp?.max_score ?? (code.toUpperCase().startsWith('EXAM') ? 70 : 15);
          };

          if (bs) {
            if (caPcts.length === 0) {
              // Broadsheet raw scores are on the component scale (e.g. 12/15).
              // Normalise to 0-100% before pushing into caPcts.
              if (bs.ca1 != null) caPcts.push(pct(bs.ca1, componentMax('CA1')));
              if (bs.ca2 != null) caPcts.push(pct(bs.ca2, componentMax('CA2')));
              if (bs.ca3 != null) caPcts.push(pct(bs.ca3, componentMax('CA3')));
            }
          }

          const ex = examBySubject.get(sub.id);
          const exResult = ex
            ? (resultsByExam.get(ex.id) ?? []).find((x) => x.student_id === st.id) ?? null
            : null;
          // CBT/published result → synced exam CA row → broadsheet raw exam (I5)
          const { examRawScore, examMax } = resolveExamFallback({
            result: exResult,
            examMaxFromExam: ex?.max_score,
            examCARows: allStCAs.filter((c) => c.ca_type.toLowerCase() === "exam"),
            bsExam: bs?.exam_score ?? null,
            componentMaxExam: componentMax("EXAM"),
          });
          // Normalise to 0-100% for the non-dynamic weighted path
          const examPct = examRawScore != null && examMax > 0
            ? pct(examRawScore, examMax)
            : null;

          let total: number | null = null;
          let band: { grade: string; remark: string } | null = null;

          if (useDynamic) {
            const scoreMap = buildCaScoreMap(stCAs, componentMax);
            if (bs) {
              if (bs.ca1 != null) scoreMap["CA1"] = bs.ca1;
              if (bs.ca2 != null) scoreMap["CA2"] = bs.ca2;
              if (bs.ca3 != null) scoreMap["CA3"] = bs.ca3;
            }
            // Use the raw exam score (not the normalised pct)
            // because computeDynamicTotalScore normalises internally.
            if (scoreMap["EXAM"] == null && examRawScore != null) scoreMap["EXAM"] = examRawScore;

            total = computeDynamicTotalScore(activeStructure.components, scoreMap);
            if (activeGradingScale?.bands) {
              band = gradeForDynamicScale(activeGradingScale.bands, total);
            }
          }

          if (total == null) {
            total = computeTermTotal(settings as SchoolSettings, { caScoresPct: caPcts, examScorePct: examPct });
            if (!band) band = gradeFor(settings as SchoolSettings, total);
          }

          if (total == null && caPcts.length === 0 && examPct == null) continue;

          const ca1 = caPcts[0] ?? null;
          const ca2 = caPcts[1] ?? null;
          const ca3 = caPcts[2] ?? null;
          const caTotal = caPcts.length ? caPcts.reduce((a, b) => a + b, 0) / caPcts.length : null;
          rows.push({
            student_id: st.id, subject_id: sub.id,
            ca1, ca2, ca3, ca_total: caTotal, exam_score: examPct,
            total: total ?? 0, grade: band?.grade ?? null, remark: band?.remark ?? null,
          });
        }
      }

      // Per-subject highest/lowest + subject_position within class
      const bySubject = new Map<string, Row[]>();
      for (const r of rows) (bySubject.get(r.subject_id) ?? bySubject.set(r.subject_id, []).get(r.subject_id)!).push(r);
      const subjHigh = new Map<string, number>();
      const subjLow = new Map<string, number>();
      const subjPos = new Map<string, number>(); // key student_id__subject_id
      for (const [sid, list] of bySubject) {
        subjHigh.set(sid, Math.max(...list.map((r) => r.total)));
        subjLow.set(sid, Math.min(...list.map((r) => r.total)));
        const sorted = [...list].sort((a, b) => b.total - a.total);
        let rank = 0; let prev = Number.NaN; let sameCount = 0;
        for (const r of sorted) {
          sameCount++;
          if (r.total !== prev) { rank = sameCount; prev = r.total; }
          subjPos.set(`${r.student_id}__${sid}`, rank);
        }
      }

      // Per-student totals & averages
      const byStudent = new Map<string, Row[]>();
      for (const r of rows) (byStudent.get(r.student_id) ?? byStudent.set(r.student_id, []).get(r.student_id)!).push(r);
      const studentTotals = new Map<string, { total: number; count: number; avg: number }>();
      for (const [sid, list] of byStudent) {
        const total = list.reduce((a, b) => a + b.total, 0);
        const count = list.length;
        const avg = count ? total / count : 0;
        studentTotals.set(sid, { total, count, avg });
      }
      const classAverage = studentTotals.size
        ? Array.from(studentTotals.values()).reduce((a, b) => a + b.avg, 0) / studentTotals.size
        : 0;

      // Class position by average
      const classSorted = Array.from(studentTotals.entries()).sort((a, b) => b[1].avg - a[1].avg);
      const classPos = new Map<string, number>();
      { let rank = 0, seen = 0, prev = Number.NaN;
        for (const [sid, v] of classSorted) {
          seen++;
          if (v.avg !== prev) { rank = seen; prev = v.avg; }
          classPos.set(sid, rank);
        } }

      // Build upsert payload
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const payload = rows.map((r) => {
        const st = studentTotals.get(r.student_id)!;
        return {
          session_id: effSession, term_id: effTerm, class_id: classId, exam_type: examType,
          student_id: r.student_id, subject_id: r.subject_id,
          ca1_score: r.ca1 != null ? round2(r.ca1) : null,
          ca2_score: r.ca2 != null ? round2(r.ca2) : null,
          ca3_score: r.ca3 != null ? round2(r.ca3) : null,
          ca_total: r.ca_total != null ? round2(r.ca_total) : null,
          exam_score: r.exam_score != null ? round2(r.exam_score) : null,
          total_score: round2(r.total),
          grade: r.grade, remark: r.remark,
          subject_position: subjPos.get(`${r.student_id}__${r.subject_id}`) ?? null,
          subject_highest: round2(subjHigh.get(r.subject_id) ?? 0),
          subject_lowest: round2(subjLow.get(r.subject_id) ?? 0),
          student_total_marks: round2(st.total),
          student_average: round2(st.avg),
          subjects_count: st.count,
          class_position: classPos.get(r.student_id) ?? null,
          class_average: round2(classAverage),
        };
      });

      // Replace existing then insert (avoids depending on a specific unique constraint)
      const del = await supabase.from("processed_results").delete()
        .eq("session_id", effSession).eq("term_id", effTerm).eq("class_id", classId).eq("exam_type", examType);
      if (del.error) throw del.error;
      // insert in chunks
      const chunk = 500;
      for (let i = 0; i < payload.length; i += chunk) {
        const slice = payload.slice(i, i + chunk);
        const { data: insertedRows, error } = await supabase
          .from("processed_results")
          .insert(slice)
          .select("id, student_id, subject_id");
        if (error) throw error;

        // C2: Write normalized component score rows to result_component_scores table
        if (insertedRows && insertedRows.length > 0 && useDynamic && activeStructure?.components) {
          const compScoresPayload: any[] = [];
          for (const pr of insertedRows) {
            const stCAs = (caIx.get(`${pr.student_id}__${pr.subject_id}`) ?? []);
            for (const c of activeStructure.components) {
              const matchingCA = stCAs.find((ca) => ca.ca_type.toUpperCase() === c.code.toUpperCase());
              if (matchingCA) {
                compScoresPayload.push({
                  result_id: pr.id,
                  component_id: c.id,
                  component_code: c.code,
                  component_name: c.name,
                  score: matchingCA.score,
                  max_score: c.max_score,
                  weight_percentage: c.weight_percentage,
                });
              }
            }
          }
          if (compScoresPayload.length > 0) {
            await supabase.from("result_component_scores").insert(compScoresPayload);
          }
        }
      }

      const duration = Math.round(performance.now() - started);
      const runIns = await supabase.from("result_processing_runs").insert({
        session_id: effSession, term_id: effTerm, class_id: classId, exam_type: examType,
        students_processed: students.length, subjects_processed: subjects.length,
        rows_written: payload.length, duration_ms: duration, is_reprocess: isReprocess,
      });
      if (runIns.error) throw runIns.error;

      return { rows: payload.length, students: students.length, subjects: subjects.length, duration, isReprocess };
    },
    onSuccess: (r) => {
      toast.success(`${r.isReprocess ? "Reprocessed" : "Processed"}: ${r.rows} rows • ${r.students} students • ${r.subjects} subjects (${r.duration}ms)`);
      qc.invalidateQueries({ queryKey: ["proc-runs"] });
      qc.invalidateQueries({ queryKey: ["result-published"] });
      refetchRuns();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Processing failed"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Process Results</h2>
            <p className="text-sm text-muted-foreground">Compute totals, grades, positions and class stats from imported CA / Exam scores.</p>
          </div>
          <Button onClick={() => process.mutate()} disabled={process.isPending || !classId}>
            {process.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Cog className="h-4 w-4 mr-2" />}
            {process.isPending ? "Processing…" : "Process now"}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Session">
            <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setTermId(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>{(sessions ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>{termsForSession.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Exam type">
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="combined">Combined (CA + Exam)</SelectItem>
                <SelectItem value="cbt">CBT only</SelectItem>
                <SelectItem value="written">Written only</SelectItem>
                <SelectItem value="practical">Practical only</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Processing history</h3>
          <Button variant="ghost" size="sm" onClick={() => refetchRuns()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Kind</TableHead>
              <TableHead className="text-right">Students</TableHead>
              <TableHead className="text-right">Subjects</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(runs ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No runs yet for this scope.</TableCell></TableRow>
              )}
              {(runs ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={r.is_reprocess ? "secondary" : "default"}>{r.is_reprocess ? "Reprocess" : "Initial"}</Badge></TableCell>
                  <TableCell className="text-right">{r.students_processed}</TableCell>
                  <TableCell className="text-right">{r.subjects_processed}</TableCell>
                  <TableCell className="text-right">{r.rows_written}</TableCell>
                  <TableCell className="text-right">{r.duration_ms ?? "—"} ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
