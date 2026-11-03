import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { Users, GraduationCap, CalendarCheck, ClipboardList, TrendingUp, Download, Target, Plus, Save, Loader2, Trash2, FileSpreadsheet, FileText } from "lucide-react";
import { useSchoolSettings, computeTermTotal, gradeFor, pct, type SchoolSettings } from "@/lib/scoring";
import { useResolvedAssessmentStructure, useResolvedGradingScale, gradeForDynamicScale, computeDynamicTotalScore, DynamicGradingScale } from "@/lib/assessment-config";
import { softDelete } from "@/lib/soft-delete";
import { ResultImportPanel } from "@/components/results/ResultImportPanel";
import { ProcessResultsPanel } from "@/components/results/ProcessResultsPanel";
import { ProcessedResultsReviewPanel } from "@/components/results/ProcessedResultsReviewPanel";
import { ResultPublishingPanel } from "@/components/results/ResultPublishingPanel";
import { ClassBroadsheetReport } from "@/components/reports/ClassBroadsheetReport";
import { LevelSpecificReportCards } from "@/components/reports/LevelSpecificReportCards";
import { Upload, Cog, Send, Pencil } from "lucide-react";
import { SessionSelect, ALL_SESSIONS } from "@/components/SessionSelect";

function computeSubjectTotal(
  cas: { score: number; max_score: number; ca_type?: string }[],
  exam: { score: number; max_score: number } | null,
  settings: SchoolSettings,
  activeComponents?: import("@/lib/assessment-config").AssessmentComponent[] | null,
): number {
  if (activeComponents && activeComponents.length > 0) {
    const scoreMap: Record<string, number | null> = {};
    cas.forEach((c) => { scoreMap[(c.ca_type || "ca1").toUpperCase()] = c.score; });
    if (exam) scoreMap["EXAM"] = exam.score;
    const computed = computeDynamicTotalScore(activeComponents, scoreMap);
    if (computed != null) return computed;
  }
  const caScoresPct = cas.map((c) => pct(c.score, c.max_score));
  const examScorePct = exam ? pct(exam.score, exam.max_score) : null;
  return computeTermTotal(settings, { caScoresPct, examScorePct }) ?? 0;
}
function gradeLabel(avg: number, settings: SchoolSettings | undefined, dynamicScale?: DynamicGradingScale | null): string {
  if (dynamicScale?.bands && dynamicScale.bands.length > 0) {
    return gradeForDynamicScale(dynamicScale.bands, avg)?.grade ?? "—";
  }
  if (!settings) return "—";
  return gradeFor(settings, avg)?.grade ?? "—";
}

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

interface ClassRow { id: string; name: string; level: string }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string; start_date: string; end_date: string }
interface SessionRow { id: string; name: string; is_current: boolean }
interface StudentRow { id: string; full_name: string; admission_no: string; class_id: string | null }
interface CARow { student_id: string; subject_id: string; ca_type: string; score: number; max_score: number; term_id: string | null }
interface ResultRow { student_id: string; exam_id: string; score: number }
interface ExamRow { id: string; subject_id: string; class_id: string; term_id: string; max_score: number; title: string }
interface AttendanceRow { student_id: string; class_id: string | null; date: string; status: string }
interface SubjectRow { id: string; name: string }
interface AttemptRow { exam_id: string; raw_score: number; total_marks: number; percentage: number; duration_seconds: number | null }

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
    </Card>
  );
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => {
      const v = r[h];
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================ PAGE ============================ */
function ReportsPage() {
  const { data: classes } = useQuery({
    queryKey: ["rpt-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["rpt-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms")
        .select("id,name,is_current,session_id,start_date,end_date")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: sessions } = useQuery({
    queryKey: ["rpt-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const currentTerm = (terms ?? []).find((t) => t.is_current);
  const currentSession = (sessions ?? []).find((s) => s.is_current);
  const [sessionFilter, setSessionFilter] = useState<string>(ALL_SESSIONS);
  const scopedTerms = (terms ?? []).filter(
    (t) => sessionFilter === ALL_SESSIONS || t.session_id === sessionFilter,
  );
  const scopedDefaultTerm = scopedTerms.find((t) => t.is_current)?.id ?? scopedTerms[0]?.id;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reports &amp; Analytics</h1>
        <p className="text-muted-foreground text-sm">Performance, attendance, exam statistics, and promotion analytics.</p>
      </div>
      <div className="max-w-xs">
        <SessionSelect label="Academic session" allowAll autoDefault={false} value={sessionFilter} onChange={setSessionFilter} />
      </div>
      <Tabs defaultValue="performance">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="performance"><GraduationCap className="h-3.5 w-3.5 mr-1" />Student Performance</TabsTrigger>
          <TabsTrigger value="broadsheet"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Class Broadsheet</TabsTrigger>
          <TabsTrigger value="level-reports"><FileText className="h-3.5 w-3.5 mr-1" />Level Report Cards</TabsTrigger>
          <TabsTrigger value="classes"><Users className="h-3.5 w-3.5 mr-1" />Class Comparison</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarCheck className="h-3.5 w-3.5 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="exams"><ClipboardList className="h-3.5 w-3.5 mr-1" />Exam Statistics</TabsTrigger>
          <TabsTrigger value="promotion"><TrendingUp className="h-3.5 w-3.5 mr-1" />Promotion</TabsTrigger>
          <TabsTrigger value="gap"><Target className="h-3.5 w-3.5 mr-1" />Gap Analysis</TabsTrigger>
          <TabsTrigger value="roster"><Users className="h-3.5 w-3.5 mr-1" />Student Roster</TabsTrigger>
          <TabsTrigger value="import"><Upload className="h-3.5 w-3.5 mr-1" />Result Import</TabsTrigger>
          <TabsTrigger value="process"><Cog className="h-3.5 w-3.5 mr-1" />Process Results</TabsTrigger>
          <TabsTrigger value="review"><Pencil className="h-3.5 w-3.5 mr-1" />Review & Edit</TabsTrigger>
          <TabsTrigger value="publish"><Send className="h-3.5 w-3.5 mr-1" />Approve & Publish</TabsTrigger>
        </TabsList>
        <TabsContent value="broadsheet" className="mt-4">
          <ClassBroadsheetReport />
        </TabsContent>
        <TabsContent value="level-reports" className="mt-4">
          <LevelSpecificReportCards />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ResultImportPanel />
        </TabsContent>
        <TabsContent value="process" className="mt-4">
          <ProcessResultsPanel />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <ProcessedResultsReviewPanel />
        </TabsContent>
        <TabsContent value="publish" className="mt-4">
          <ResultPublishingPanel />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <PerformanceTab key={sessionFilter} classes={classes ?? []} terms={scopedTerms} defaultTerm={scopedDefaultTerm} />
        </TabsContent>
        <TabsContent value="classes" className="mt-4">
          <ClassComparisonTab key={sessionFilter} classes={classes ?? []} terms={scopedTerms} defaultTerm={scopedDefaultTerm} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab key={sessionFilter} classes={classes ?? []} terms={scopedTerms} defaultTerm={scopedDefaultTerm} />
        </TabsContent>
        <TabsContent value="exams" className="mt-4">
          <ExamStatsTab key={sessionFilter} classes={classes ?? []} terms={scopedTerms} defaultTerm={scopedDefaultTerm} />
        </TabsContent>
        <TabsContent value="promotion" className="mt-4">
          <PromotionTab key={sessionFilter} classes={classes ?? []} sessions={sessions ?? []} terms={scopedTerms} defaultSession={sessionFilter !== ALL_SESSIONS ? sessionFilter : currentSession?.id} />
        </TabsContent>
        <TabsContent value="gap" className="mt-4">
          <GapAnalysisTab key={sessionFilter} classes={classes ?? []} terms={scopedTerms} defaultTerm={scopedDefaultTerm} defaultSession={sessionFilter} />
        </TabsContent>
        <TabsContent value="roster" className="mt-4">
          <StudentRosterTab classes={classes ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ HELPERS ============================ */
function useTermStudentScores(termId: string | undefined, classId: string | undefined) {
  return useQuery({
    queryKey: ["rpt-scores", termId, classId],
    enabled: !!termId,
    queryFn: async () => {
      const studentsQ = supabase.from("students").select("id,full_name,admission_no,class_id").eq("status", "active");
      if (classId && classId !== "all") studentsQ.eq("class_id", classId);
      const [{ data: students, error: se }, { data: cas, error: ce }, { data: exams, error: ee }, { data: subjects, error: sue }] = await Promise.all([
        studentsQ,
        supabase.from("continuous_assessments").select("student_id,subject_id,ca_type,score,max_score,term_id").eq("term_id", termId!),
        supabase.from("exams").select("id,subject_id,class_id,term_id,max_score,title").eq("term_id", termId!),
        supabase.from("subjects").select("id,name"),
      ]);
      if (se) throw se;
      if (ce) throw ce;
      if (ee) throw ee;
      if (sue) throw sue;

      const examIds = (exams ?? []).map((e) => e.id);
      let results: ResultRow[] = [];
      if (examIds.length > 0) {
        const { data: r, error: re } = await supabase.from("results").select("student_id,exam_id,score").in("exam_id", examIds);
        if (re) throw re;
        results = (r ?? []) as ResultRow[];
      }
      return {
        students: (students ?? []) as StudentRow[],
        cas: (cas ?? []) as CARow[],
        exams: (exams ?? []) as ExamRow[],
        results,
        subjects: (subjects ?? []) as SubjectRow[],
      };
    },
  });
}

/* ============================ PERFORMANCE TAB ============================ */
function PerformanceTab({ classes, terms, defaultTerm }: { classes: ClassRow[]; terms: TermRow[]; defaultTerm?: string }) {
  const [classId, setClassId] = useState<string>("all");
  const [termId, setTermId] = useState<string | undefined>(defaultTerm);
  const [studentId, setStudentId] = useState<string>("");
  const settings = useSchoolSettings();
  // Consistent resolution args across consumers: class + term + education level (I1)
  const { data: activeStructure } = useResolvedAssessmentStructure(
    classId !== "all" ? classId : undefined,
    null,
    termId,
    undefined,
    classId !== "all" ? (classes ?? []).find((c) => c.id === classId)?.level : undefined
  );
  const { data: activeGradingScale } = useResolvedGradingScale(classId !== "all" ? classId : undefined, null);
  const { data } = useTermStudentScores(termId, classId);

  const studentRows = useMemo(() => {
    if (!data || !settings.data) return [];
    const subjMap = new Map(data.subjects.map((s) => [s.id, s.name]));
    return data.students.map((stu) => {
      const subjectIds = new Set<string>([
        ...data.cas.filter((c) => c.student_id === stu.id).map((c) => c.subject_id),
        ...data.exams.filter((e) => data.results.some((r) => r.exam_id === e.id && r.student_id === stu.id)).map((e) => e.subject_id),
      ]);
      const subjectScores: { subject: string; total: number }[] = [];
      subjectIds.forEach((sid) => {
        const cas = data.cas.filter((c) => c.student_id === stu.id && c.subject_id === sid);
        const examFor = data.exams.find((e) => e.subject_id === sid);
        const examResult = examFor ? data.results.find((r) => r.exam_id === examFor.id && r.student_id === stu.id) : null;
        const total = computeSubjectTotal(
          cas,
          examResult ? { score: examResult.score, max_score: examFor!.max_score } : null,
          settings.data!,
          activeStructure?.components,
        );
        subjectScores.push({ subject: subjMap.get(sid) ?? "—", total });
      });
      const avg = subjectScores.length ? subjectScores.reduce((a, b) => a + b.total, 0) / subjectScores.length : 0;
      return { id: stu.id, name: stu.full_name, admission: stu.admission_no, subjects: subjectScores, average: avg };
    }).sort((a, b) => b.average - a.average);
  }, [data, settings.data, activeStructure]);

  const ranked = studentRows.map((r, i) => ({ ...r, position: i + 1 }));
  const selected = ranked.find((r) => r.id === studentId) ?? ranked[0];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Student">
            <Select value={studentId || (selected?.id ?? "")} onValueChange={setStudentId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Top of list" /></SelectTrigger>
              <SelectContent>
                {ranked.map((r) => <SelectItem key={r.id} value={r.id}>#{r.position} {r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`performance-${termId}.csv`,
            ranked.map((r) => ({ position: r.position, admission: r.admission, name: r.name, average: r.average.toFixed(2), grade: gradeLabel(r.average, settings.data, activeGradingScale) })))}>
            <Download className="h-3.5 w-3.5 mr-1" />Export
          </Button>
        </div>
      </Card>

      {selected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Average" value={`${selected.average.toFixed(1)}%`}
            hint={`Grade ${gradeLabel(selected.average, settings.data, activeGradingScale)}`} />
          <StatCard icon={<GraduationCap className="h-4 w-4" />} label="Position" value={`#${selected.position}`} hint={`of ${ranked.length}`} />
          <StatCard icon={<ClipboardList className="h-4 w-4" />} label="Subjects" value={selected.subjects.length} />
        </div>
      )}

      {selected && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">{selected.name} — subject breakdown</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={selected.subjects}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Class ranking</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Admission</TableHead><TableHead>Name</TableHead>
              <TableHead className="text-center">Subjects</TableHead>
              <TableHead className="text-center">Average</TableHead>
              <TableHead className="text-center">Grade</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {ranked.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data for this selection.</TableCell></TableRow>
              ) : ranked.map((r) => (
                <TableRow key={r.id} className={r.id === selected?.id ? "bg-muted/40" : ""}>
                  <TableCell>{r.position}</TableCell>
                  <TableCell>{r.admission}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center">{r.subjects.length}</TableCell>
                  <TableCell className="text-center">{r.average.toFixed(1)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{gradeLabel(r.average, settings.data, activeGradingScale)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/* ============================ CLASS COMPARISON TAB ============================ */
function ClassComparisonTab({ classes, terms, defaultTerm }: { classes: ClassRow[]; terms: TermRow[]; defaultTerm?: string }) {
  const [termId, setTermId] = useState<string | undefined>(defaultTerm);
  const settings = useSchoolSettings();
  const { data: activeStructure } = useResolvedAssessmentStructure(undefined, null, termId);
  const { data } = useTermStudentScores(termId, "all");

  const classStats = useMemo(() => {
    if (!data || !settings.data) return [];
    const byClass = new Map<string, number[]>();
    data.students.forEach((stu) => {
      const subjectIds = new Set<string>([
        ...data.cas.filter((c) => c.student_id === stu.id).map((c) => c.subject_id),
      ]);
      const totals: number[] = [];
      subjectIds.forEach((sid) => {
        const cas = data.cas.filter((c) => c.student_id === stu.id && c.subject_id === sid);
        const examFor = data.exams.find((e) => e.subject_id === sid);
        const examResult = examFor ? data.results.find((r) => r.exam_id === examFor.id && r.student_id === stu.id) : null;
        totals.push(computeSubjectTotal(
          cas,
          examResult ? { score: examResult.score, max_score: examFor!.max_score } : null,
          settings.data!,
          activeStructure?.components,
        ));
      });
      const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
      const cid = stu.class_id ?? "unassigned";
      if (!byClass.has(cid)) byClass.set(cid, []);
      byClass.get(cid)!.push(avg);
    });
    const out = Array.from(byClass.entries()).map(([cid, arr]) => {
      const cls = classes.find((c) => c.id === cid);
      const sorted = [...arr].sort((a, b) => a - b);
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const pass = arr.filter((v) => v >= (settings.data?.promotion_min_average ?? 50)).length;
      return {
        class: cls?.name ?? "Unassigned",
        students: arr.length,
        average: mean,
        median,
        passRate: arr.length ? (pass / arr.length) * 100 : 0,
      };
    }).sort((a, b) => b.average - a.average);
    return out;
  }, [data, settings.data, classes]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`class-comparison-${termId}.csv`,
            classStats.map((c) => ({ class: c.class, students: c.students, average: c.average.toFixed(2), median: c.median.toFixed(2), pass_rate: c.passRate.toFixed(1) })))}>
            <Download className="h-3.5 w-3.5 mr-1" />Export
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Average score by class</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={classStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="class" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="average" name="Average %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="passRate" name="Pass rate %" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Class table</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Class</TableHead>
              <TableHead className="text-center">Students</TableHead>
              <TableHead className="text-center">Average</TableHead>
              <TableHead className="text-center">Median</TableHead>
              <TableHead className="text-center">Pass rate</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {classStats.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No data.</TableCell></TableRow>
              ) : classStats.map((c) => (
                <TableRow key={c.class}>
                  <TableCell className="font-medium">{c.class}</TableCell>
                  <TableCell className="text-center">{c.students}</TableCell>
                  <TableCell className="text-center">{c.average.toFixed(1)}</TableCell>
                  <TableCell className="text-center">{c.median.toFixed(1)}</TableCell>
                  <TableCell className="text-center">{c.passRate.toFixed(0)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/* ============================ ATTENDANCE TAB ============================ */
function AttendanceTab({ classes, terms, defaultTerm }: { classes: ClassRow[]; terms: TermRow[]; defaultTerm?: string }) {
  const [termId, setTermId] = useState<string | undefined>(defaultTerm);
  const [classId, setClassId] = useState<string>("all");
  const term = terms.find((t) => t.id === termId);

  const { data } = useQuery({
    queryKey: ["rpt-attendance", termId, classId],
    enabled: !!term,
    queryFn: async () => {
      let q = supabase.from("attendance")
        .select("student_id,class_id,date,status")
        .gte("date", term!.start_date).lte("date", term!.end_date);
      if (classId !== "all") q = q.eq("class_id", classId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  const totals = useMemo(() => {
    const t = { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
    (data ?? []).forEach((r) => {
      t.total++;
      if (r.status === "present") t.present++;
      else if (r.status === "late") t.late++;
      else if (r.status === "absent") t.absent++;
      else t.excused++;
    });
    return t;
  }, [data]);

  const byClass = useMemo(() => {
    const m = new Map<string, { present: number; late: number; absent: number; total: number }>();
    (data ?? []).forEach((r) => {
      const cid = r.class_id ?? "unassigned";
      if (!m.has(cid)) m.set(cid, { present: 0, late: 0, absent: 0, total: 0 });
      const x = m.get(cid)!;
      x.total++;
      if (r.status === "present") x.present++;
      else if (r.status === "late") x.late++;
      else if (r.status === "absent") x.absent++;
    });
    return Array.from(m.entries()).map(([cid, v]) => ({
      class: classes.find((c) => c.id === cid)?.name ?? "Unassigned",
      ...v,
      rate: v.total ? ((v.present + v.late) / v.total) * 100 : 0,
    })).sort((a, b) => b.rate - a.rate);
  }, [data, classes]);

  const trend = useMemo(() => {
    const m = new Map<string, { present: number; total: number }>();
    (data ?? []).forEach((r) => {
      if (!m.has(r.date)) m.set(r.date, { present: 0, total: 0 });
      const x = m.get(r.date)!;
      x.total++;
      if (r.status === "present" || r.status === "late") x.present++;
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, rate: v.total ? (v.present / v.total) * 100 : 0 }));
  }, [data]);

  const pieData = [
    { name: "Present", value: totals.present, color: "#22c55e" },
    { name: "Late", value: totals.late, color: "#f59e0b" },
    { name: "Absent", value: totals.absent, color: "#ef4444" },
    { name: "Excused", value: totals.excused, color: "#94a3b8" },
  ].filter((d) => d.value > 0);

  const overallRate = totals.total ? ((totals.present + totals.late) / totals.total) * 100 : 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`attendance-${termId}.csv`, byClass)}>
            <Download className="h-3.5 w-3.5 mr-1" />Export
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<CalendarCheck className="h-4 w-4" />} label="Records" value={totals.total} />
        <StatCard icon={<CalendarCheck className="h-4 w-4 text-green-600" />} label="Present" value={totals.present} />
        <StatCard icon={<CalendarCheck className="h-4 w-4 text-amber-600" />} label="Late" value={totals.late} />
        <StatCard icon={<CalendarCheck className="h-4 w-4 text-red-600" />} label="Attendance rate" value={`${overallRate.toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Status mix</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Daily attendance rate</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="rate" stroke="#3b82f6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">By class</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Class</TableHead>
              <TableHead className="text-center">Records</TableHead>
              <TableHead className="text-center">Present</TableHead>
              <TableHead className="text-center">Late</TableHead>
              <TableHead className="text-center">Absent</TableHead>
              <TableHead className="text-center">Rate</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {byClass.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No attendance recorded.</TableCell></TableRow>
              ) : byClass.map((c) => (
                <TableRow key={c.class}>
                  <TableCell className="font-medium">{c.class}</TableCell>
                  <TableCell className="text-center">{c.total}</TableCell>
                  <TableCell className="text-center">{c.present}</TableCell>
                  <TableCell className="text-center">{c.late}</TableCell>
                  <TableCell className="text-center">{c.absent}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={c.rate >= 75 ? "default" : "destructive"}>{c.rate.toFixed(0)}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/* ============================ EXAM STATS TAB ============================ */
function ExamStatsTab({ classes, terms, defaultTerm }: { classes: ClassRow[]; terms: TermRow[]; defaultTerm?: string }) {
  const [termId, setTermId] = useState<string | undefined>(defaultTerm);
  const [classId, setClassId] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["rpt-exam-stats", termId, classId],
    enabled: !!termId,
    queryFn: async () => {
      let eq = supabase.from("exams").select("id,subject_id,class_id,term_id,max_score,title").eq("term_id", termId!);
      if (classId !== "all") eq = eq.eq("class_id", classId);
      const { data: exams, error: ee } = await eq;
      if (ee) throw ee;
      const examIds = (exams ?? []).map((e) => e.id);
      let results: ResultRow[] = [];
      let attempts: AttemptRow[] = [];
      if (examIds.length > 0) {
        const [{ data: r }, { data: a }] = await Promise.all([
          supabase.from("results").select("student_id,exam_id,score").in("exam_id", examIds),
          supabase.from("exam_attempts").select("exam_id,raw_score,total_marks,percentage,duration_seconds").in("exam_id", examIds),
        ]);
        results = (r ?? []) as ResultRow[];
        attempts = (a ?? []) as AttemptRow[];
      }
      const { data: subjects } = await supabase.from("subjects").select("id,name");
      return { exams: (exams ?? []) as ExamRow[], results, attempts, subjects: (subjects ?? []) as SubjectRow[] };
    },
  });

  const stats = useMemo(() => {
    if (!data) return [];
    const subjMap = new Map(data.subjects.map((s) => [s.id, s.name]));
    return data.exams.map((e) => {
      const rs = data.results.filter((r) => r.exam_id === e.id);
      const ats = data.attempts.filter((a) => a.exam_id === e.id);
      const allPct = [
        ...rs.map((r) => pct(r.score, e.max_score)),
        ...ats.map((a) => a.percentage),
      ];
      const n = allPct.length;
      const mean = n ? allPct.reduce((a, b) => a + b, 0) / n : 0;
      const max = n ? Math.max(...allPct) : 0;
      const min = n ? Math.min(...allPct) : 0;
      const pass = allPct.filter((p) => p >= 50).length;
      const avgDur = ats.length ? ats.reduce((a, b) => a + (b.duration_seconds ?? 0), 0) / ats.length : 0;
      return {
        title: e.title,
        subject: subjMap.get(e.subject_id) ?? "—",
        attempts: n,
        mean, max, min,
        passRate: n ? (pass / n) * 100 : 0,
        avgDur,
      };
    }).sort((a, b) => b.attempts - a.attempts);
  }, [data]);

  const totalAttempts = stats.reduce((a, b) => a + b.attempts, 0);
  const overallMean = totalAttempts ? stats.reduce((a, b) => a + b.mean * b.attempts, 0) / totalAttempts : 0;
  const overallPass = totalAttempts ? stats.reduce((a, b) => a + b.passRate * b.attempts, 0) / totalAttempts : 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`exam-stats-${termId}.csv`,
            stats.map((s) => ({ exam: s.title, subject: s.subject, attempts: s.attempts, mean: s.mean.toFixed(1), pass_rate: s.passRate.toFixed(1) })))}>
            <Download className="h-3.5 w-3.5 mr-1" />Export
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<ClipboardList className="h-4 w-4" />} label="Exams" value={stats.length} />
        <StatCard icon={<ClipboardList className="h-4 w-4" />} label="Attempts" value={totalAttempts} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Mean score" value={`${overallMean.toFixed(1)}%`} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Pass rate" value={`${overallPass.toFixed(0)}%`} />
      </div>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Mean score by exam</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="title" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="mean" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Per-exam breakdown</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Exam</TableHead><TableHead>Subject</TableHead>
              <TableHead className="text-center">Attempts</TableHead>
              <TableHead className="text-center">Mean</TableHead>
              <TableHead className="text-center">High</TableHead>
              <TableHead className="text-center">Low</TableHead>
              <TableHead className="text-center">Pass rate</TableHead>
              <TableHead className="text-center">Avg time</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {stats.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No exams in this selection.</TableCell></TableRow>
              ) : stats.map((s) => (
                <TableRow key={s.title}>
                  <TableCell className="font-medium">{s.title}</TableCell>
                  <TableCell>{s.subject}</TableCell>
                  <TableCell className="text-center">{s.attempts}</TableCell>
                  <TableCell className="text-center">{s.mean.toFixed(1)}</TableCell>
                  <TableCell className="text-center">{s.max.toFixed(1)}</TableCell>
                  <TableCell className="text-center">{s.min.toFixed(1)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={s.passRate >= 60 ? "default" : "destructive"}>{s.passRate.toFixed(0)}%</Badge>
                  </TableCell>
                  <TableCell className="text-center">{s.avgDur ? `${Math.round(s.avgDur / 60)}m` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

/* ============================ PROMOTION TAB ============================ */
function PromotionTab({ classes, sessions, terms, defaultSession }: {
  classes: ClassRow[]; sessions: SessionRow[]; terms: TermRow[]; defaultSession?: string;
}) {
  const [sessionId, setSessionId] = useState<string | undefined>(defaultSession);
  const [classId, setClassId] = useState<string>("all");
  const settings = useSchoolSettings();
  const { data: activeStructure } = useResolvedAssessmentStructure(classId !== "all" ? classId : undefined);
  const sessionTerms = useMemo(() => terms.filter((t) => t.session_id === sessionId), [terms, sessionId]);

  const { data } = useQuery({
    queryKey: ["rpt-promotion", sessionId, classId],
    enabled: !!sessionId && sessionTerms.length > 0,
    queryFn: async () => {
      const studentsQ = supabase.from("students").select("id,full_name,admission_no,class_id").eq("status", "active");
      if (classId !== "all") studentsQ.eq("class_id", classId);
      const termIds = sessionTerms.map((t) => t.id);
      const [{ data: students }, { data: cas }, { data: exams }, { data: subjects }, { data: attendance }] = await Promise.all([
        studentsQ,
        supabase.from("continuous_assessments").select("student_id,subject_id,ca_type,score,max_score,term_id").in("term_id", termIds),
        supabase.from("exams").select("id,subject_id,class_id,term_id,max_score,title").in("term_id", termIds),
        supabase.from("subjects").select("id,name"),
        supabase.from("attendance").select("student_id,class_id,date,status")
          .gte("date", sessionTerms.reduce((a, b) => a < b.start_date ? a : b.start_date, sessionTerms[0].start_date))
          .lte("date", sessionTerms.reduce((a, b) => a > b.end_date ? a : b.end_date, sessionTerms[0].end_date)),
      ]);
      const examIds = (exams ?? []).map((e) => e.id);
      let results: ResultRow[] = [];
      if (examIds.length > 0) {
        const { data: r } = await supabase.from("results").select("student_id,exam_id,score").in("exam_id", examIds);
        results = (r ?? []) as ResultRow[];
      }
      return {
        students: (students ?? []) as StudentRow[],
        cas: (cas ?? []) as CARow[],
        exams: (exams ?? []) as ExamRow[],
        subjects: (subjects ?? []) as SubjectRow[],
        results,
        attendance: (attendance ?? []) as AttendanceRow[],
        termIds,
      };
    },
  });

  const rows = useMemo(() => {
    if (!data || !settings.data) return [];
    const minAvg = settings.data.promotion_min_average ?? 50;
    return data.students.map((stu) => {
      const termAvgs: number[] = [];
      data.termIds.forEach((tid) => {
        const subjectIds = new Set<string>(
          data.cas.filter((c) => c.student_id === stu.id && c.term_id === tid).map((c) => c.subject_id)
        );
        const totals: number[] = [];
        subjectIds.forEach((sid) => {
          const cas = data.cas.filter((c) => c.student_id === stu.id && c.subject_id === sid && c.term_id === tid);
          const examFor = data.exams.find((e) => e.subject_id === sid && e.term_id === tid);
          const examResult = examFor ? data.results.find((r) => r.exam_id === examFor.id && r.student_id === stu.id) : null;
          totals.push(computeSubjectTotal(
            cas,
            examResult ? { score: examResult.score, max_score: examFor!.max_score } : null,
            settings.data!,
            activeStructure?.components,
          ));
        });
        if (totals.length) termAvgs.push(totals.reduce((a, b) => a + b, 0) / totals.length);
      });
      const sessionAvg = termAvgs.length ? termAvgs.reduce((a, b) => a + b, 0) / termAvgs.length : 0;

      const att = data.attendance.filter((a) => a.student_id === stu.id);
      const present = att.filter((a) => a.status === "present" || a.status === "late").length;
      const attRate = att.length ? (present / att.length) * 100 : 0;

      let recommendation: "promote" | "repeat" | "review" = "promote";
      if (sessionAvg < minAvg) recommendation = "repeat";
      else if (attRate < 60 || sessionAvg < minAvg + 5) recommendation = "review";

      return {
        id: stu.id,
        admission: stu.admission_no,
        name: stu.full_name,
        class: classes.find((c) => c.id === stu.class_id)?.name ?? "—",
        average: sessionAvg,
        attendance: attRate,
        recommendation,
      };
    }).sort((a, b) => b.average - a.average);
  }, [data, settings.data, classes]);

  const summary = useMemo(() => {
    const s = { promote: 0, review: 0, repeat: 0 };
    rows.forEach((r) => { s[r.recommendation]++; });
    return s;
  }, [rows]);

  const pieData = [
    { name: "Promote", value: summary.promote, color: "#22c55e" },
    { name: "Review", value: summary.review, color: "#f59e0b" },
    { name: "Repeat", value: summary.repeat, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Session">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`promotion-${sessionId}.csv`,
            rows.map((r) => ({ admission: r.admission, name: r.name, class: r.class, average: r.average.toFixed(2), attendance: r.attendance.toFixed(1), recommendation: r.recommendation })))}>
            <Download className="h-3.5 w-3.5 mr-1" />Export
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Students" value={rows.length} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-green-600" />} label="Promote" value={summary.promote} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-amber-600" />} label="Review" value={summary.review} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-red-600" />} label="Repeat" value={summary.repeat} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Recommendation mix</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2 space-y-2">
          <h3 className="font-semibold">Decision support</h3>
          <p className="text-xs text-muted-foreground">
            Auto-recommendation uses session average against the school's minimum
            ({settings.data?.promotion_min_average ?? 50}%) and attendance rate.
            Borderline averages or attendance under 60% are flagged for review.
          </p>
          <div className="rounded-md border overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Admission</TableHead><TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-center">Average</TableHead>
                <TableHead className="text-center">Attendance</TableHead>
                <TableHead className="text-center">Recommendation</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.admission}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.class}</TableCell>
                    <TableCell className="text-center">{r.average.toFixed(1)}</TableCell>
                    <TableCell className="text-center">{r.attendance.toFixed(0)}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.recommendation === "promote" ? "default" : r.recommendation === "repeat" ? "destructive" : "secondary"} className="capitalize">
                        {r.recommendation}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================ GAP ANALYSIS ============================ */

interface AQ {
  id: string; class_id: string; subject_id: string; purpose: string;
  term_id: string | null; title: string | null; question_text: string | null;
  max_score: number; position: number | null;
}
interface AQScore { id: string; student_id: string; assessment_question_id: string; score: number }
interface SubjectOpt { id: string; name: string }
interface StudentOpt { id: string; full_name: string; admission_no: string | null; class_id: string | null }

function GapAnalysisTab({ classes, terms, defaultTerm, defaultSession }: { classes: ClassRow[]; terms: TermRow[]; defaultTerm?: string; defaultSession?: string }) {
  const qc = useQueryClient();
  const [classId, setClassId] = useState<string>(classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("exam");
  const [termId, setTermId] = useState<string>(defaultTerm ?? "");
  const [sessionId, setSessionId] = useState<string>(defaultSession ?? ALL_SESSIONS);
  const [addOpen, setAddOpen] = useState(false);
  const [newQ, setNewQ] = useState({ title: "", question_text: "", max_score: "10" });

  const { data: subjects = [] } = useQuery({
    queryKey: ["gap-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as SubjectOpt[];
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["gap-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, class_id")
        .eq("class_id", classId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentOpt[];
    },
  });

  const { data: questions = [], refetch: refetchQ } = useQuery({
    queryKey: ["gap-questions", classId, subjectId, purpose, termId, sessionId],
    enabled: !!classId && !!subjectId,
    queryFn: async () => {
      let q = supabase
        .from("assessment_questions")
        .select("*")
        .eq("class_id", classId)
        .eq("subject_id", subjectId)
        .eq("purpose", purpose)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (termId) q = q.eq("term_id", termId);
      if (sessionId && sessionId !== ALL_SESSIONS) q = q.eq("session_id", sessionId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AQ[];
    },
  });

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const { data: scoresData, refetch: refetchScores } = useQuery({
    queryKey: ["gap-scores", questionIds.join(",")],
    enabled: questionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_question_scores")
        .select("id, student_id, assessment_question_id, score")
        .in("assessment_question_id", questionIds);
      if (error) throw error;
      return (data ?? []) as AQScore[];
    },
  });
  const EMPTY_SCORES = useMemo<AQScore[]>(() => [], []);
  const scores = scoresData ?? EMPTY_SCORES;

  // grid[studentId][questionId] = score string
  const [grid, setGrid] = useState<Record<string, Record<string, string>>>({});
  // Hydrate grid when scores arrive
  useEffect(() => {
    const g: Record<string, Record<string, string>> = {};
    for (const s of scores) {
      g[s.student_id] = g[s.student_id] ?? {};
      g[s.student_id][s.assessment_question_id] = String(s.score);
    }
    setGrid(g);
  }, [scores]);

  const addQ = useMutation({
    mutationFn: async () => {
      if (!classId || !subjectId) throw new Error("Select class and subject first");
      const max = Number(newQ.max_score);
      if (!(max > 0)) throw new Error("Max score must be > 0");
      const { error } = await supabase.from("assessment_questions").insert({
        class_id: classId, subject_id: subjectId, purpose,
        term_id: termId || null,
        session_id: sessionId && sessionId !== ALL_SESSIONS ? sessionId : null,
        title: newQ.title || null,
        question_text: newQ.question_text || null,
        max_score: max,
        position: (questions[questions.length - 1]?.position ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question added");
      setAddOpen(false);
      setNewQ({ title: "", question_text: "", max_score: "10" });
      qc.invalidateQueries({ queryKey: ["gap-questions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeQ = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("assessment_questions", id);
    },
    onSuccess: () => { toast.success("Removed"); refetchQ(); refetchScores(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      const rows: { student_id: string; assessment_question_id: string; score: number }[] = [];
      for (const stu of students) {
        for (const q of questions) {
          const v = grid[stu.id]?.[q.id];
          if (v === undefined || v === "") continue;
          const n = Number(v);
          if (Number.isNaN(n)) continue;
          rows.push({ student_id: stu.id, assessment_question_id: q.id, score: Math.min(n, q.max_score) });
        }
      }
      if (rows.length === 0) return 0;
      const { error } = await supabase
        .from("assessment_question_scores")
        .upsert(rows, { onConflict: "student_id,assessment_question_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => { toast.success(`Saved ${n} score${n === 1 ? "" : "s"}`); refetchScores(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Aggregate: avg % per question
  const aggregate = useMemo(() => {
    return questions.map((q) => {
      const qs = scores.filter((s) => s.assessment_question_id === q.id);
      const avgPct = qs.length === 0 ? 0 : (qs.reduce((a, s) => a + (s.score / Math.max(q.max_score, 1)) * 100, 0) / qs.length);
      return { label: q.title || q.question_text?.slice(0, 28) || `Q${q.position ?? ""}`, avg: Math.round(avgPct * 10) / 10, n: qs.length, max: q.max_score };
    });
  }, [questions, scores]);

  const weakest = [...aggregate].sort((a, b) => a.avg - b.avg).slice(0, 5);

  return (
    <Card className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SessionSelect label="Session" allowAll autoDefault={false} value={sessionId} onChange={setSessionId} />
        <Field label="Class">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Subject">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
            <SelectContent className="max-h-72">{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Purpose">
          <Select value={purpose} onValueChange={setPurpose}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ca1">CA1</SelectItem>
              <SelectItem value="ca2">CA2</SelectItem>
              <SelectItem value="ca3">CA3</SelectItem>
              <SelectItem value="exam">Exam</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Term (optional)">
          <Select value={termId || "_any"} onValueChange={(v) => setTermId(v === "_any" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_any">Any</SelectItem>
              {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {!subjectId ? (
        <p className="text-sm text-muted-foreground">Select a subject to manage questions and view gap analysis.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              {questions.length} question{questions.length === 1 ? "" : "s"} · {students.length} student{students.length === 1 ? "" : "s"}
            </div>
            <div className="flex gap-2">
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1.5" />Add question</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New question</DialogTitle>
                    <DialogDescription>Adds a gradable question for {purpose.toUpperCase()} in this subject &amp; class.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Title / number</Label>
                      <Input value={newQ.title} onChange={(e) => setNewQ({ ...newQ, title: e.target.value })} placeholder="e.g. Q1, Section A.2" />
                    </div>
                    <div className="space-y-1">
                      <Label>Question text (optional)</Label>
                      <Input value={newQ.question_text} onChange={(e) => setNewQ({ ...newQ, question_text: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Max score</Label>
                      <Input type="number" min="1" value={newQ.max_score} onChange={(e) => setNewQ({ ...newQ, max_score: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => addQ.mutate()} disabled={addQ.isPending}>
                      {addQ.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Add
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button size="sm" onClick={() => saveAll.mutate()} disabled={saveAll.isPending || questions.length === 0}>
                {saveAll.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Save scores
              </Button>
              <Button size="sm" variant="outline" disabled={aggregate.length === 0} onClick={() => downloadCsv(`gap-${purpose}.csv`, aggregate.map((a) => ({ question: a.label, avg_percent: a.avg, students_scored: a.n, max_score: a.max })))}>
                <Download className="h-4 w-4 mr-1.5" />Export
              </Button>
            </div>
          </div>

          {questions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2 p-3">
                <p className="text-sm font-medium mb-2">Average % per question</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={aggregate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="avg" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card className="p-3">
                <p className="text-sm font-medium mb-2">Weakest questions</p>
                <ul className="space-y-1.5 text-sm">
                  {weakest.length === 0 && <li className="text-muted-foreground">No scores yet.</li>}
                  {weakest.map((w) => (
                    <li key={w.label} className="flex justify-between gap-2">
                      <span className="truncate">{w.label}</span>
                      <Badge variant={w.avg < 50 ? "destructive" : "secondary"}>{w.avg}%</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {questions.length > 0 && students.length > 0 && (
            <div className="overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background min-w-[180px]">Student</TableHead>
                    {questions.map((q) => (
                      <TableHead key={q.id} className="text-center min-w-[88px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs">{q.title || `Q${q.position ?? ""}`} <span className="text-muted-foreground">/{q.max_score}</span></span>
                          <button onClick={() => removeQ.mutate(q.id)} className="text-muted-foreground hover:text-destructive" title="Remove">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="text-center">Total %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((stu) => {
                    let total = 0, maxTotal = 0, count = 0;
                    for (const q of questions) {
                      const v = grid[stu.id]?.[q.id];
                      if (v !== undefined && v !== "") {
                        const n = Number(v);
                        if (!Number.isNaN(n)) { total += Math.min(n, q.max_score); maxTotal += q.max_score; count++; }
                      }
                    }
                    const pctVal = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : null;
                    return (
                      <TableRow key={stu.id}>
                        <TableCell className="sticky left-0 bg-background font-medium">{stu.full_name}</TableCell>
                        {questions.map((q) => (
                          <TableCell key={q.id} className="p-1">
                            <Input
                              type="number" min="0" max={q.max_score} step="0.5"
                              className="h-8 w-20 text-center mx-auto"
                              value={grid[stu.id]?.[q.id] ?? ""}
                              onChange={(e) => setGrid((g) => ({ ...g, [stu.id]: { ...(g[stu.id] ?? {}), [q.id]: e.target.value } }))}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          {pctVal == null ? "—" : <Badge variant={pctVal < 50 ? "destructive" : "secondary"}>{pctVal}%{count < questions.length ? " *" : ""}</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ============================================================
// Student Roster: list students by class, filterable by status
// ============================================================
type StudentStatus = "active" | "graduated" | "withdrawn" | "suspended";
const STUDENT_STATUSES: StudentStatus[] = ["active", "graduated", "withdrawn", "suspended"];

interface RosterStudent {
  id: string;
  full_name: string;
  admission_no: string | null;
  gender: string | null;
  status: StudentStatus;
  class_id: string | null;
  enrollment_date: string | null;
  graduated_at: string | null;
  email: string | null;
  home_phone: string | null;
}

function StudentRosterTab({ classes }: { classes: ClassRow[] }) {
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "all">("active");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: students, isLoading } = useQuery({
    queryKey: ["roster-students", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id,full_name,admission_no,gender,status,class_id,enrollment_date,graduated_at,email,home_phone")
        .order("full_name", { ascending: true })
        .limit(5000);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RosterStudent[];
    },
  });

  const classMap = useMemo(() => {
    const m = new Map<string, ClassRow>();
    for (const c of classes) m.set(c.id, c);
    return m;
  }, [classes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students ?? []).filter((s) => {
      if (classFilter !== "all" && s.class_id !== classFilter) return false;
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        (s.admission_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [students, classFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, RosterStudent[]>();
    for (const s of filtered) {
      const key = s.class_id ?? "__unassigned__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries())
      .map(([classId, list]) => ({
        classId,
        className:
          classId === "__unassigned__"
            ? "Unassigned"
            : classMap.get(classId)?.name ?? "Unknown class",
        level:
          classId === "__unassigned__"
            ? ""
            : classMap.get(classId)?.level ?? "",
        list,
      }))
      .sort((a, b) => a.className.localeCompare(b.className));
  }, [filtered, classMap]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { active: 0, graduated: 0, withdrawn: 0, suspended: 0 };
    for (const s of students ?? []) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [students]);

  function exportCsv() {
    const rows: string[] = [
      ["Class", "Level", "Admission No", "Full Name", "Gender", "Status", "Enrollment Date", "Graduated At", "Email", "Phone"].join(","),
    ];
    for (const g of grouped) {
      for (const s of g.list) {
        rows.push(
          [
            g.className,
            g.level,
            s.admission_no ?? "",
            s.full_name,
            s.gender ?? "",
            s.status,
            s.enrollment_date ?? "",
            s.graduated_at ?? "",
            s.email ?? "",
            s.home_phone ?? "",
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${statusFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function statusBadge(s: StudentStatus) {
    const variant =
      s === "active" ? "default" : s === "graduated" ? "secondary" : "outline";
    return <Badge variant={variant as any}>{s}</Badge>;
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STUDENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s} ({statusCounts[s] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Class</Label>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label>Search</Label>
          <Input
            placeholder="Name or admission no"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!grouped.length}>
          <Download className="h-4 w-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline">Total shown: {filtered.length}</Badge>
        {STUDENT_STATUSES.map((s) => (
          <Badge key={s} variant="outline">{s}: {statusCounts[s] ?? 0}</Badge>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : grouped.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          No students match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.classId} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{g.className}</h3>
                {g.level && <Badge variant="secondary">{g.level}</Badge>}
                <Badge variant="outline">{g.list.length} student{g.list.length === 1 ? "" : "s"}</Badge>
              </div>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Admission No</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enrolled</TableHead>
                      <TableHead>Graduated</TableHead>
                      <TableHead>Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.list.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.admission_no ?? "—"}</TableCell>
                        <TableCell className="font-medium">{s.full_name}</TableCell>
                        <TableCell>{s.gender ?? "—"}</TableCell>
                        <TableCell>{statusBadge(s.status)}</TableCell>
                        <TableCell className="text-sm">{s.enrollment_date ?? "—"}</TableCell>
                        <TableCell className="text-sm">{s.graduated_at ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.email || s.home_phone || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
