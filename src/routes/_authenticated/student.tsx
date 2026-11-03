import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { RichView } from "@/components/rich/RichView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import {
  BookOpen, ClipboardList, Library, GraduationCap, Trophy, CalendarCheck,
  FileText, Loader2, Download, Award, Star, Flame, Target, CheckCircle2, Printer,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RATING_COLUMNS, useStudentTraitGroups } from "@/lib/traits";
import {
  StudentQuestionView,
  parseContentJson,
  itemGradeableUnits,
  ansKey,
} from "@/components/question-builder/StudentQuestionView";
import { PublishedExamsPanel } from "@/components/exams/PublishedExamsPanel";
import { ResilientCBTRunner } from "@/components/exams/ResilientCBTRunner";
import { ExamPaperView } from "@/components/exams/ExamPaperView";
import { useExamServiceWorker } from "@/hooks/useExamServiceWorker";
import { useResultsPublished, ResultsNotPublishedNotice } from "@/lib/result-publication";
import { useResolvedGradingScale, useResolvedAssessmentStructure } from "@/lib/assessment-config";
import { formatTermName } from "@/lib/scoring";
import { buildResultsCardRows } from "@/lib/broadsheet";
import { useAutoSyncOnRecovery } from "@/lib/offline-exam-sync";
import { getInProgressAttemptsForStudent, getSubmittedNotSyncedExamIds, cleanupStaleAttempts } from "@/lib/offline-exam-db";


function StudentPublishGate({ classId, termId, children }: { classId: string | null; termId?: string; children: React.ReactNode }) {
  const { data: term, isLoading: termLoading } = useQuery({
    queryKey: ["student-pgate-term", termId],
    queryFn: async () => {
      if (termId) {
        const { data } = await supabase.from("terms").select("id,session_id,is_current").eq("id", termId).maybeSingle();
        if (data) return data as { id: string; session_id: string };
      }
      const { data: currentTerm } = await supabase.from("terms").select("id,session_id,is_current").eq("is_current", true).maybeSingle();
      if (currentTerm) return currentTerm as { id: string; session_id: string };

      const { data: fallbackTerm } = await supabase.from("terms").select("id,session_id,is_current").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return fallbackTerm as { id: string; session_id: string } | null;
    },
  });
  const { data: published, isLoading: pubLoading } = useResultsPublished({
    session_id: term?.session_id, term_id: term?.id ?? termId, class_id: classId, exam_type: "combined",
  });
  const isLoading = termLoading || pubLoading || (!term && !termLoading && !!classId);
  if (!classId) return <ResultsNotPublishedNotice />;
  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Checking publication status…</Card>;
  if (!published) return <ResultsNotPublishedNotice />;
  return <>{children}</>;
}


export const Route = createFileRoute("/_authenticated/student")({
  component: StudentPortal,
});

type StudentRow = {
  id: string;
  full_name: string;
  admission_no: string;
  photo_url: string | null;
  class_id: string | null;
  classes?: { name: string | null } | null;
};

type Term = { id: string; name: string; session_id: string; start_date: string; end_date: string; is_current: boolean };

function StudentPortal() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: student, isLoading: loadingStudent } = useQuery({
    queryKey: ["student", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, photo_url, class_id, classes:class_id(name)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as StudentRow | null;
    },
  });

  const { data: terms } = useQuery({
    queryKey: ["student", "terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id, name, start_date, end_date, is_current")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Term[];
    },
  });

  const currentTerm = useMemo(() => terms?.find((t) => t.is_current) ?? terms?.[0] ?? null, [terms]);
  const [termId, setTermId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("overview");
  useEffect(() => { if (!termId && currentTerm) setTermId(currentTerm.id); }, [currentTerm, termId]);

  if (loadingStudent) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!student) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Student Portal</h1>
        <Card className="p-6 text-sm text-muted-foreground">
          No student profile is linked to your account yet. Please contact the school admin.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {student.photo_url ? (
            <SignedImage bucket="student-photos" src={student.photo_url} alt={student.full_name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
              {student.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-semibold">Welcome, {student.full_name.split(" ")[0]}</h1>
            <p className="text-xs text-muted-foreground">
              {student.admission_no} · {student.classes?.name ?? "Unassigned class"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Term</Label>
          <Select value={termId ?? undefined} onValueChange={(v) => setTermId(v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select term" /></SelectTrigger>
            <SelectContent>
              {terms?.map((t) => (
                <SelectItem key={t.id} value={t.id}>{formatTermName(t.name)} {t.is_current ? "· current" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <PublishedExamsPanel onOpenCbt={() => {
        setTab("cbt");
        setTimeout(() => document.getElementById("student-exam-area")?.scrollIntoView({ behavior: "smooth" }), 50);
      }} />

      <Tabs value={tab} onValueChange={setTab} className="w-full" id="student-exam-area">

        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview"><Trophy className="mr-1 h-4 w-4" />Progress</TabsTrigger>
          <TabsTrigger value="lessons"><BookOpen className="mr-1 h-4 w-4" />Lessons</TabsTrigger>
          <TabsTrigger value="assignments"><ClipboardList className="mr-1 h-4 w-4" />Assignments</TabsTrigger>
          <TabsTrigger value="resources"><Library className="mr-1 h-4 w-4" />Resources</TabsTrigger>
          <TabsTrigger value="cbt"><GraduationCap className="mr-1 h-4 w-4" />CBT</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarCheck className="mr-1 h-4 w-4" />Attendance</TabsTrigger>
          <TabsTrigger value="results"><Award className="mr-1 h-4 w-4" />Results Card</TabsTrigger>
          <TabsTrigger value="report"><FileText className="mr-1 h-4 w-4" />Report Card</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ProgressTab student={student} termId={termId} />
        </TabsContent>
        <TabsContent value="lessons" className="mt-4">
          <LessonsTab student={student} termId={termId} />
        </TabsContent>
        <TabsContent value="assignments" className="mt-4">
          <AssignmentsTab student={student} qc={qc} />
        </TabsContent>
        <TabsContent value="resources" className="mt-4">
          <ResourcesTab student={student} />
        </TabsContent>
        <TabsContent value="cbt" className="mt-4">
          <CBTTab student={student} termId={termId} qc={qc} userId={user!.id} terms={terms ?? []} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab student={student} termId={termId} terms={terms ?? []} />
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          <StudentPublishGate classId={student?.class_id ?? null} termId={termId ?? undefined}>
            <ResultsCardTab student={student} terms={terms ?? []} selectedTermId={termId} />
          </StudentPublishGate>
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <StudentPublishGate classId={student?.class_id ?? null} termId={termId ?? undefined}>
            <ReportCardTab student={student} terms={terms ?? []} selectedTermId={termId} />
          </StudentPublishGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------- Progress / Gamification ---------------------- */

const BADGES = [
  { id: "first_steps", label: "First Steps", icon: Star, condition: "Submit your first assignment", check: (s: any) => s.submissions >= 1 },
  { id: "scholar", label: "Scholar", icon: GraduationCap, condition: "Score 70%+ average", check: (s: any) => s.avg >= 70 },
  { id: "perfect_attend", label: "Perfect Attendance", icon: CalendarCheck, condition: "100% attendance this term", check: (s: any) => s.attendanceRate >= 100 },
  { id: "consistent", label: "Consistent", icon: Flame, condition: "90%+ attendance", check: (s: any) => s.attendanceRate >= 90 },
  { id: "ace", label: "Top Performer", icon: Trophy, condition: "Average above 85%", check: (s: any) => s.avg >= 85 },
  { id: "marksman", label: "Marksman", icon: Target, condition: "5+ exam results recorded", check: (s: any) => s.examCount >= 5 },
];

function levelFromXp(xp: number) {
  // 100 XP per level, scaling
  let level = 1;
  let needed = 100;
  let acc = 0;
  while (xp >= acc + needed) { acc += needed; level += 1; needed = 100 + (level - 1) * 50; }
  return { level, current: xp - acc, needed, total: xp };
}

function ProgressTab({ student, termId }: { student: StudentRow; termId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student", "progress", student.id, termId],
    enabled: !!student.id,
    queryFn: async () => {
      const [att, results, subs] = await Promise.all([
        supabase.from("attendance").select("status").eq("student_id", student.id),
        supabase.from("results").select("score, exams:exam_id(max_score, term_id)").eq("student_id", student.id),
        supabase.from("assignment_submissions").select("id, score, status").eq("student_id", student.id),
      ]);
      if (att.error) throw att.error;
      if (results.error) throw results.error;
      if (subs.error) throw subs.error;

      const attendance = att.data ?? [];
      const present = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = attendance.length ? (present / attendance.length) * 100 : 0;

      const filteredResults = (results.data ?? []).filter((r: any) => !termId || r.exams?.term_id === termId);
      const percents = filteredResults
        .map((r: any) => r.exams?.max_score ? (Number(r.score) / Number(r.exams.max_score)) * 100 : null)
        .filter((v): v is number => v !== null);
      const avg = percents.length ? percents.reduce((a, b) => a + b, 0) / percents.length : 0;

      const submissions = (subs.data ?? []).length;
      // XP: 5 per attendance present, 10 per submission, 1 per percent of avg
      const xp = Math.round(present * 5 + submissions * 10 + avg * 2);

      return {
        attendanceRate: Math.round(attendanceRate),
        avg: Math.round(avg),
        examCount: percents.length,
        submissions,
        xp,
      };
    },
  });

  if (isLoading || !data) {
    return <Card className="p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading progress…</Card>;
  }

  const lvl = levelFromXp(data.xp);
  const earned = BADGES.filter((b) => b.check(data));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard icon={Trophy} label="Level" value={`Lv. ${lvl.level}`} sub={`${lvl.current}/${lvl.needed} XP`} />
        <StatCard icon={Star} label="Total XP" value={String(data.xp)} sub="Keep going!" />
        <StatCard icon={CalendarCheck} label="Attendance" value={`${data.attendanceRate}%`} sub="All-time" />
        <StatCard icon={GraduationCap} label="Average" value={`${data.avg}%`} sub={`${data.examCount} exams`} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Level Progress</p>
          <Badge variant="secondary">Lv. {lvl.level}</Badge>
        </div>
        <Progress value={(lvl.current / lvl.needed) * 100} />
        <p className="text-xs text-muted-foreground mt-1">{lvl.needed - lvl.current} XP to level {lvl.level + 1}</p>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-medium mb-3">Badges</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {BADGES.map((b) => {
            const got = earned.some((e) => e.id === b.id);
            const Icon = b.icon;
            return (
              <div key={b.id} className={`rounded-lg border p-3 text-center ${got ? "bg-primary/5 border-primary/30" : "opacity-50"}`}>
                <Icon className={`h-7 w-7 mx-auto ${got ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-xs font-medium mt-1">{b.label}</p>
                <p className="text-[10px] text-muted-foreground">{b.condition}</p>
                {got && <Badge variant="default" className="mt-1 text-[10px]">Earned</Badge>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

/** Render text and turn any http(s) URL into a clickable download link. */
function Linkify({ text }: { text?: string | null }) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1 mx-0.5">
            <Download className="h-3 w-3" />{p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

/** Extract URLs from one or more text fields and render as download buttons. */
function extractUrls(...texts: Array<string | null | undefined>): string[] {
  const urls = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    const matches = t.match(/https?:\/\/[^\s)]+/g);
    if (matches) matches.forEach((u) => urls.add(u));
  }
  return Array.from(urls);
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.hostname;
  } catch { return url; }
}

function Attachments({ urls, label = "Attachments" }: { urls: string[]; label?: string }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {urls.map((u) => (
          <Button key={u} size="sm" variant="outline" asChild className="h-7 text-xs">
            <a href={u} target="_blank" rel="noreferrer" download>
              <Download className="h-3 w-3 mr-1" />{fileNameFromUrl(u)}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- Lessons ---------------------- */

function LessonsTab({ student, termId }: { student: StudentRow; termId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student", "lessons", student.class_id, termId],
    enabled: !!student.class_id,
    queryFn: async () => {
      let q = supabase
        .from("lesson_plans")
        .select("id, topic, objectives, materials, activities, evaluation, week_number, lesson_date, subjects:subject_id(name), term_id")
        .eq("class_id", student.class_id!)
        .order("lesson_date", { ascending: false });
      if (termId) q = q.eq("term_id", termId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <Card className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading lessons…</Card>;
  if (!data || data.length === 0) return <Card className="p-6 text-sm text-muted-foreground">No lesson plans available for this term yet.</Card>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map((l: any) => (
        <Card key={l.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{l.topic}</p>
              <p className="text-xs text-muted-foreground">
                {l.subjects?.name ?? "Subject"} {l.week_number ? `· Week ${l.week_number}` : ""} {l.lesson_date ? `· ${l.lesson_date}` : ""}
              </p>
            </div>
          </div>
          {l.objectives && <p className="text-xs mt-2"><strong>Objectives:</strong> <Linkify text={l.objectives} /></p>}
          {l.materials && <p className="text-xs mt-1"><strong>Materials:</strong> <Linkify text={l.materials} /></p>}
          {l.activities && <p className="text-xs mt-1"><strong>Activities:</strong> <Linkify text={l.activities} /></p>}
          {l.evaluation && <p className="text-xs mt-1"><strong>Evaluation:</strong> <Linkify text={l.evaluation} /></p>}
          <Attachments urls={extractUrls(l.objectives, l.materials, l.activities, l.evaluation)} label="Lesson files" />
        </Card>
      ))}
    </div>
  );
}

/* ---------------------- Assignments ---------------------- */

function AssignmentsTab({ student, qc }: { student: StudentRow; qc: ReturnType<typeof useQueryClient> }) {
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["student", "assignments", student.class_id],
    enabled: !!student.class_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, title, instructions, due_date, max_score, attachment_url, academic_session_id, subjects:subject_id(name)")
        .eq("class_id", student.class_id!)
        .eq("status", "published")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["student", "submissions", student.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("id, assignment_id, status, score, feedback, submitted_at, content")
        .eq("student_id", student.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [content, setContent] = useState("");

  const submit = useMutation({
    mutationFn: async ({ assignmentId, content }: { assignmentId: string; content: string }) => {
      const assignment = (assignments ?? []).find((a: any) => a.id === assignmentId);
      if (!assignment?.academic_session_id) throw new Error("Assignment academic session not found.");
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignmentId, student_id: student.id, content, status: "submitted" as any,
        academic_session_id: assignment.academic_session_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment submitted");
      qc.invalidateQueries({ queryKey: ["student", "submissions", student.id] });
      qc.invalidateQueries({ queryKey: ["student", "progress", student.id] });
      setOpenId(null); setContent("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to submit"),
  });

  if (isLoading) return <Card className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading assignments…</Card>;
  if (!assignments?.length) return <Card className="p-6 text-sm text-muted-foreground">No published assignments.</Card>;

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Max</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((a: any) => {
            const sub = submissions?.find((s) => s.assignment_id === a.id);
            return (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.title}</TableCell>
                <TableCell>{a.subjects?.name ?? "—"}</TableCell>
                <TableCell>{a.due_date ?? "—"}</TableCell>
                <TableCell>{a.max_score}</TableCell>
                <TableCell>
                  {sub ? (
                    <Badge variant={sub.status === "graded" ? "default" : "secondary"}>
                      {sub.status}{sub.score != null ? ` · ${sub.score}/${a.max_score}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not submitted</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {a.attachment_url && (
                    <Button size="sm" variant="ghost" asChild title="Assignment attachment">
                      <a href={a.attachment_url} target="_blank" rel="noreferrer"><Download className="h-3 w-3" /></a>
                    </Button>
                  )}
                  {sub ? (
                    <Button size="sm" variant="outline" onClick={() => setViewId(a.id)}>View</Button>
                  ) : (
                    <Button size="sm" onClick={() => { setOpenId(a.id); setContent(""); }}>Submit</Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit Assignment</DialogTitle></DialogHeader>
          {(() => {
            const a: any = assignments.find((x: any) => x.id === openId);
            if (!a) return null;
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{a.title}</p>
                {a.instructions && <p className="text-xs whitespace-pre-wrap">{a.instructions}</p>}
                <div>
                  <Label>Your response</Label>
                  <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Type your answer or notes…" />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenId(null)}>Cancel</Button>
            <Button
              disabled={!content.trim() || submit.isPending}
              onClick={() => openId && submit.mutate({ assignmentId: openId, content })}
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Assignment Details</DialogTitle></DialogHeader>
          {(() => {
            const a: any = assignments.find((x: any) => x.id === viewId);
            const sub: any = submissions?.find((s) => s.assignment_id === viewId);
            if (!a) return null;
            const pct = sub?.score != null && a.max_score ? Math.round((Number(sub.score) / Number(a.max_score)) * 100) : null;

            const downloadAssignmentPdf = () => {
              const doc = new jsPDF();
              doc.setFontSize(16); doc.text("Assignment Report", 105, 18, { align: "center" });
              doc.setFontSize(10);
              doc.text(`Student: ${student.full_name}`, 14, 30);
              doc.text(`Admission No: ${student.admission_no}`, 14, 36);
              doc.text(`Class: ${student.classes?.name ?? "—"}`, 14, 42);
              doc.text(`Assignment: ${a.title}`, 14, 50);
              doc.text(`Subject: ${a.subjects?.name ?? "—"}`, 14, 56);
              doc.text(`Due: ${a.due_date ?? "—"}   Max: ${a.max_score}`, 14, 62);

              autoTable(doc, {
                startY: 70,
                head: [["Field", "Value"]],
                body: [
                  ["Status", sub?.status ?? "Not submitted"],
                  ["Score", sub?.score != null ? `${sub.score} / ${a.max_score}${pct != null ? ` (${pct}%)` : ""}` : "—"],
                  ["Submitted", sub?.submitted_at ? new Date(sub.submitted_at).toLocaleString() : "—"],
                ],
              });

              let y = (doc as any).lastAutoTable?.finalY ?? 90;
              const block = (label: string, body: string) => {
                y += 8;
                doc.setFont(undefined as any, "bold"); doc.text(label, 14, y);
                doc.setFont(undefined as any, "normal");
                const lines = doc.splitTextToSize(body || "—", 180);
                y += 6; doc.text(lines, 14, y); y += lines.length * 5;
              };
              if (a.instructions) block("Instructions:", a.instructions);
              if (sub?.content) block("Your Response:", sub.content);
              if (sub?.feedback) block("Teacher Feedback:", sub.feedback);
              if (sub?.attachment_url) block("Submission file:", sub.attachment_url);
              if (a.attachment_url) block("Assignment file:", a.attachment_url);

              doc.save(`assignment-${student.admission_no}-${a.title.replace(/\s+/g, "_")}.pdf`);
            };

            return (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.subjects?.name ?? ""} · Due {a.due_date ?? "—"} · Max {a.max_score}
                  </p>
                </div>
                {a.instructions && (
                  <div>
                    <Label className="text-xs">Instructions</Label>
                    <p className="text-xs"><Linkify text={a.instructions} /></p>
                  </div>
                )}
                {a.attachment_url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={a.attachment_url} target="_blank" rel="noreferrer" download><Download className="h-3 w-3 mr-1" />Assignment file</a>
                  </Button>
                )}
                {sub && (
                  <div className="border rounded p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-xs">Your submission</p>
                      <Badge variant={sub.status === "graded" ? "default" : "secondary"}>
                        {sub.status}{sub.score != null ? ` · ${sub.score}/${a.max_score}${pct != null ? ` (${pct}%)` : ""}` : ""}
                      </Badge>
                    </div>
                    {sub.submitted_at && (
                      <p className="text-[11px] text-muted-foreground">Submitted {new Date(sub.submitted_at).toLocaleString()}</p>
                    )}
                    {sub.content && (
                      <div>
                        <Label className="text-xs">Your response</Label>
                        <p className="text-xs whitespace-pre-wrap"><Linkify text={sub.content} /></p>
                      </div>
                    )}
                    {sub.attachment_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={sub.attachment_url} target="_blank" rel="noreferrer" download><Download className="h-3 w-3 mr-1" />Download submission</a>
                      </Button>
                    )}
                    {sub.feedback && (
                      <div>
                        <Label className="text-xs">Teacher feedback</Label>
                        <p className="text-xs whitespace-pre-wrap"><Linkify text={sub.feedback} /></p>
                      </div>
                    )}
                    {sub.status !== "graded" && (
                      <p className="text-[11px] text-muted-foreground italic">Awaiting grading by your teacher.</p>
                    )}
                  </div>
                )}
                <DialogFooter className="!mt-4">
                  <Button variant="outline" onClick={() => setViewId(null)}>Close</Button>
                  <Button onClick={downloadAssignmentPdf}>
                    <Download className="h-4 w-4 mr-1" />Export PDF
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------------- Resources ---------------------- */

function ResourcesTab({ student }: { student: StudentRow }) {
  const { data: curriculum } = useQuery({
    queryKey: ["student", "curriculum"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum")
        .select("id, title, description, learning_outcomes, resources, topics, subjects:subject_id(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: books } = useQuery({
    queryKey: ["student", "books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("library_books")
        .select("id, title, author, category, available_copies, total_copies")
        .order("title")
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-4">
        <p className="font-medium mb-2">Curriculum & Resources</p>
        {!curriculum?.length ? (
          <p className="text-sm text-muted-foreground">No curriculum entries yet.</p>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-auto">
            {curriculum.map((c: any) => (
              <div key={c.id} className="border rounded p-3">
                <p className="font-medium text-sm">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.subjects?.name ?? ""}</p>
                {c.description && <p className="text-xs mt-1"><Linkify text={c.description} /></p>}
                {c.learning_outcomes && <p className="text-xs mt-1"><strong>Outcomes:</strong> <Linkify text={c.learning_outcomes} /></p>}
                {c.resources && <p className="text-xs mt-1"><strong>Resources:</strong> <Linkify text={c.resources} /></p>}
                {Array.isArray(c.topics) && c.topics.length > 0 && (
                  <div className="text-xs mt-1"><strong>Topics:</strong>
                    <ul className="list-disc ml-5 mt-1">
                      {c.topics.map((t: any, i: number) => (
                        <li key={i}><Linkify text={typeof t === "string" ? t : (t?.title ?? JSON.stringify(t))} /></li>
                      ))}
                    </ul>
                  </div>
                )}
                <Attachments
                  urls={extractUrls(
                    c.description, c.learning_outcomes, c.resources,
                    ...(Array.isArray(c.topics) ? c.topics.map((t: any) => typeof t === "string" ? t : JSON.stringify(t)) : []),
                  )}
                  label="Downloads"
                />
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card className="p-4">
        <p className="font-medium mb-2">Library Catalog</p>
        {!books?.length ? (
          <p className="text-sm text-muted-foreground">No books available.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Title</TableHead><TableHead>Author</TableHead><TableHead>Available</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {books.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell className="text-xs">{b.author ?? "—"}</TableCell>
                    <TableCell><Badge variant={b.available_copies > 0 ? "secondary" : "outline"}>{b.available_copies}/{b.total_copies}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------------- CBT Exams ---------------------- */

function CBTTab({ student, termId, qc, userId, terms }: { student: StudentRow; termId: string | null; qc: ReturnType<typeof useQueryClient>; userId: string; terms: Term[] }) {
  useExamServiceWorker();
  useAutoSyncOnRecovery({
    onSyncComplete: ({ synced, failed }) => {
      if (synced > 0) {
        toast.success("Synced " + synced + " exam submission(s) successfully!");
        // Refresh attempt history and submitted-offline badge after successful sync
        qc.invalidateQueries({ queryKey: ["student", "attempts", student.id] });
        qc.invalidateQueries({ queryKey: ["student", "myResults", student.id] });
        getSubmittedNotSyncedExamIds(student.id).then(setSubmittedOfflineIds);
      }
      if (failed > 0) toast.error("Failed to sync " + failed + " submission(s). Will retry.");
    },
  });
  // Show every published exam for the student's class. Exams are not filtered by
  // the selected term: a published exam may belong to another term but still be
  // inside its access window.
  const { data: exams, isLoading } = useQuery({
    queryKey: ["student", "exams", student.class_id],
    enabled: !!student.class_id,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, type, exam_date, opens_at, closes_at, duration_minutes, max_score, term_id, subject_id, class_id, purpose, question_source, num_questions, subjects:subject_id(name)")
        .eq("class_id", student.class_id!)
        .eq("published", true)
        .order("exam_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["student", "myResults", student.id],
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, exam_id, score, grade, remark, exams:exam_id(published)")
        .eq("student_id", student.id);
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.exams?.published);
    },
  });

  const { data: attempts } = useQuery({
    queryKey: ["student", "attempts", student.id],
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, started_at, submitted_at, duration_seconds, raw_score, total_marks, percentage, answers, exams:exam_id(title, max_score, term_id, subjects:subject_id(name))")
        .eq("student_id", student.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });


  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [paperExamId, setPaperExamId] = useState<string | null>(null);


  const [reviewAttemptId, setReviewAttemptId] = useState<string | null>(null);
  const [historyExamFilter, setHistoryExamFilter] = useState<string>("all");
  const [historyTermFilter, setHistoryTermFilter] = useState<string>("all");
  const [historyPageSize, setHistoryPageSize] = useState<number>(10);
  const [inProgressIds, setInProgressIds] = useState<Set<string>>(new Set());
  const [submittedOfflineIds, setSubmittedOfflineIds] = useState<Set<string>>(new Set());

  // Load in-progress and submitted-not-synced exam attempts from IndexedDB
  useEffect(() => {
    getInProgressAttemptsForStudent(student.id).then(items => {
      setInProgressIds(new Set(items.map(i => i.exam_id)));
    });
    getSubmittedNotSyncedExamIds(student.id).then(ids => {
      setSubmittedOfflineIds(ids);
    });
  }, [student.id]);

  // Reconcile local IndexedDB state with server after retake resets
  // When admin resets attempts, server deletes records but local IndexedDB retains them.
  // This cleans up stale local records so the student can retake.
  useEffect(() => {
    if (!attempts || !results) return;
    const serverExamIds = new Set<string>();
    for (const a of attempts) serverExamIds.add(a.exam_id);
    for (const r of results) serverExamIds.add(r.exam_id);
    // Check if any locally-submitted or in-progress exams are gone from server
    const hasStale = [...submittedOfflineIds].some(id => !serverExamIds.has(id))
      || [...inProgressIds].some(id => !serverExamIds.has(id));
    if (!hasStale) return;
    // Clean up local state
    setSubmittedOfflineIds(prev => {
      const next = new Set(prev);
      for (const id of next) { if (!serverExamIds.has(id)) next.delete(id); }
      return next;
    });
    setInProgressIds(prev => {
      const next = new Set(prev);
      for (const id of next) { if (!serverExamIds.has(id)) next.delete(id); }
      return next;
    });
    // Clean up IndexedDB records
    cleanupStaleAttempts(student.id, serverExamIds).catch(() => {});
  }, [attempts, results, submittedOfflineIds, inProgressIds, student.id]);


  if (isLoading) return <Card className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</Card>;

  if (activeExamId) {
    const exam = exams?.find((e: any) => e.id === activeExamId);
    if (!exam) return <Card className="p-6 text-sm text-muted-foreground">Exam not found.</Card>;
    return <ResilientCBTRunner exam={exam} studentId={student.id} studentName={student.full_name} onDone={() => {
      setInProgressIds(prev => { const next = new Set(prev); next.delete(activeExamId!); return next; });
      setActiveExamId(null);
      qc.invalidateQueries({ queryKey: ["student", "myResults", student.id] });
      qc.invalidateQueries({ queryKey: ["student", "attempts", student.id] });
      qc.invalidateQueries({ queryKey: ["student", "progress", student.id] });
      getSubmittedNotSyncedExamIds(student.id).then(setSubmittedOfflineIds);
    }} />;
  }

  if (paperExamId) {
    const exam = exams?.find((e: any) => e.id === paperExamId);
    if (!exam) return <Card className="p-6 text-sm text-muted-foreground">Exam not found.</Card>;
    return <ExamPaperView exam={exam} onDone={() => setPaperExamId(null)} />;
  }

  const reviewAttempt: any = attempts?.find((a: any) => a.id === reviewAttemptId);

  return (
    <div className="space-y-4">
            {!exams?.length ? (
        <Card className="p-6 text-sm text-muted-foreground">No published examinations for your class yet.</Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {exams.map((e: any) => {
            const result = results?.find((r) => r.exam_id === e.id);
            const attempt: any = attempts?.find((a: any) => a.exam_id === e.id);
            const attempted = !!attempt;
            const isCBT = e.type === "cbt" || e.type === "online";
            const nowMs = Date.now();
            const opens = e.opens_at ? new Date(e.opens_at).getTime() : null;
            const closes = e.closes_at ? new Date(e.closes_at).getTime() : null;
            const notYet = opens != null && nowMs < opens;
            const closed = closes != null && nowMs > closes;
            const withinWindow = !notYet && !closed;
            const done = !!result || attempted || submittedOfflineIds.has(e.id);
            return (
              <Card key={e.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.subjects?.name ?? ""} · {String(e.type).toUpperCase()} · {e.exam_date ?? "TBD"}</p>
                    <p className="text-xs text-muted-foreground">Max {e.max_score} · {e.duration_minutes ?? "—"} min</p>
                  </div>
                  {result ? (
                    <Badge variant="default" className="whitespace-nowrap">
                      Taken · {result.score}/{e.max_score}
                    </Badge>
                  ) : attempted ? (
                    <Badge variant="secondary" className="whitespace-nowrap">
                      Submitted
                    </Badge>
                  ) : submittedOfflineIds.has(e.id) ? (
                    <Badge variant="secondary" className="whitespace-nowrap">Taken · syncing</Badge>
                  ) : inProgressIds.has(e.id) ? (
                    <Badge variant="destructive" className="whitespace-nowrap">In Progress</Badge>
                  ) : notYet ? (
                    <Badge variant="outline" className="whitespace-nowrap">Upcoming</Badge>
                  ) : closed ? (
                    <Badge variant="outline" className="whitespace-nowrap">Closed</Badge>
                  ) : (
                    <Badge variant="outline" className="whitespace-nowrap border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      Not yet taken
                    </Badge>
                  )}
                </div>
                {done && (
                  <p className="text-[11px] text-muted-foreground">
                    {result
                      ? `Score released${result.remark ? ` · ${result.remark}` : ""}`
                      : attempt?.submitted_at
                        ? `Submitted on ${new Date(attempt.submitted_at).toLocaleString()} · Official results will be published at the end of the term.`
                        : "Your submission has been recorded. Official results will be published at the end of the term."}
                  </p>
                )}
                {!done && isCBT && withinWindow && (
                  <Button size="sm" onClick={() => setActiveExamId(e.id)}>{inProgressIds.has(e.id) ? "Resume Exam" : "Start Exam"}</Button>
                )}
                {!isCBT && withinWindow && (
                  <Button size="sm" variant="outline" onClick={() => setPaperExamId(e.id)}>
                    View Question Paper
                  </Button>
                )}
                {!isCBT && withinWindow && (
                  <p className="text-[11px] text-muted-foreground">Write your answers in your answer booklet.</p>
                )}
                {!done && notYet && (
                  <p className="text-[11px] text-muted-foreground">Opens {new Date(e.opens_at).toLocaleString()}</p>
                )}

              </Card>
            );
          })}
        </div>
      )}

<Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="font-medium">Attempt History</p>
          {!!attempts?.length && (
            <div className="flex flex-wrap gap-2">
              <Select value={historyExamFilter} onValueChange={(v) => { setHistoryExamFilter(v); setHistoryPageSize(10); }}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All exams" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All exams</SelectItem>
                  {Array.from(new Map(attempts.map((a: any) => [a.exam_id, a.exams?.title ?? "—"])).entries()).map(([id, title]) => (
                    <SelectItem key={id as string} value={id as string}>{title as string}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={historyTermFilter} onValueChange={(v) => { setHistoryTermFilter(v); setHistoryPageSize(10); }}>
                <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="All terms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All terms</SelectItem>
                  {Array.from(new Set(attempts.map((a: any) => a.exams?.term_id).filter(Boolean))).map((tid) => {
                    const t = terms.find((x) => x.id === tid);
                    return <SelectItem key={tid as string} value={tid as string}>{t?.name ?? "Term"}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {!attempts?.length ? (
          <p className="text-sm text-muted-foreground">No CBT attempts yet.</p>
        ) : (() => {
          const filtered = attempts.filter((a: any) =>
            (historyExamFilter === "all" || a.exam_id === historyExamFilter) &&
            (historyTermFilter === "all" || a.exams?.term_id === historyTermFilter || a.exams?.term_id == null),
          );
          const visible = filtered.slice(0, historyPageSize);
          return (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exam</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((a: any) => {
                      const dur = a.duration_seconds ?? 0;
                      const m = Math.floor(dur / 60), s = dur % 60;
                      const res = (results ?? []).find((r: any) => r.exam_id === a.exam_id);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.exams?.title ?? "—"}</TableCell>
                          <TableCell className="text-xs">{a.exams?.subjects?.name ?? "—"}</TableCell>
                          <TableCell className="text-xs">{new Date(a.submitted_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs">{m}m {s}s</TableCell>
                          <TableCell>
                            {res ? (
                              <Badge variant="default">{res.score}/{a.exams?.max_score ?? a.total_marks}</Badge>
                            ) : (
                              <Badge variant="secondary">Awaiting grading</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => setReviewAttemptId(a.id)}>Review</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>Showing {visible.length} of {filtered.length}</span>
                {visible.length < filtered.length && (
                  <Button size="sm" variant="outline" onClick={() => setHistoryPageSize((n) => n + 10)}>Load more</Button>
                )}
              </div>
            </>
          );
        })()}
      </Card>

      <Dialog open={!!reviewAttemptId} onOpenChange={(o) => !o && setReviewAttemptId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reviewAttempt?.exams?.title ?? "Attempt Review"}</DialogTitle>
          </DialogHeader>
          {reviewAttempt && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {(() => {
                  const res = (results ?? []).find((r: any) => r.exam_id === reviewAttempt.exam_id);
                  return res ? (
                    <Badge variant="secondary">{res.score}/{reviewAttempt.exams?.max_score ?? reviewAttempt.total_marks} marks</Badge>
                  ) : (
                    <Badge variant="secondary">Awaiting grading</Badge>
                  );
                })()}
                <Badge variant="outline">
                  {Math.floor((reviewAttempt.duration_seconds ?? 0) / 60)}m {(reviewAttempt.duration_seconds ?? 0) % 60}s
                </Badge>
                <span>Submitted {new Date(reviewAttempt.submitted_at).toLocaleString()}</span>
              </div>
              {(reviewAttempt.answers as any[]).filter((ans: any) => !ans?.__meta).map((ans, i) => {
                const opts: any = ans.options;
                const optionEntries: Array<[string, string]> = Array.isArray(opts)
                  ? opts.map((o: any, idx: number) => [String.fromCharCode(65 + idx), String(o)])
                  : opts && typeof opts === "object"
                    ? Object.entries(opts).map(([k, v]) => [k, String(v)])
                    : [];
                return (
                  <Card key={i} className={`p-3 border-l-4 ${ans.is_correct ? "border-l-green-500" : "border-l-destructive"}`}>
                    <div className="flex justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0 flex-1"><span className="font-semibold text-foreground whitespace-nowrap">{i + 1}.</span><RichView content={ans.question_text} className="flex-1 min-w-0 text-sm font-medium" /></div>
                      <Badge variant={ans.is_correct ? "default" : "destructive"}>
                        {ans.is_correct ? "Correct" : "Wrong"} · {ans.marks} mk
                      </Badge>
                    </div>
                    {optionEntries.length > 0 ? (
                      <ul className="text-xs mt-2 space-y-1">
                        {optionEntries.map(([k, v]) => {
                          const isCorrect = k === ans.correct_answer;
                          const isPicked = k === ans.student_answer;
                          const cls = isCorrect && isPicked
                            ? "border-green-600 bg-green-500/10 text-green-700 dark:text-green-400"
                            : isCorrect
                              ? "border-green-600 bg-green-500/5 text-green-700 dark:text-green-400"
                              : isPicked
                                ? "border-destructive bg-destructive/10 text-destructive"
                                : "border-border";
                          return (
                            <li key={k} className={`flex items-start gap-2 rounded border p-2 ${cls}`}>
                              <span className="font-semibold w-5">{k}.</span>
                              <span className="flex-1">{v}</span>
                              <span className="flex flex-col items-end gap-0.5">
                                {isPicked && <Badge variant={isCorrect ? "default" : "destructive"} className="text-[10px] h-4 px-1.5">Your answer</Badge>}
                                {isCorrect && <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-green-600 hover:bg-green-600">Correct</Badge>}
                              </span>
                            </li>
                          );
                        })}
                        {!ans.student_answer && (
                          <li className="text-[11px] italic text-muted-foreground">You did not answer this question.</li>
                        )}
                      </ul>
                    ) : (
                      <div className="text-xs mt-2 space-y-1">
                        <p>Your answer: <span className={`font-medium ${ans.is_correct ? "text-green-600" : "text-destructive"}`}>{ans.student_answer ?? "(blank)"}</span></p>
                        <p>Correct answer: <span className="font-medium text-green-600">{ans.correct_answer}</span></p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewAttemptId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------------- Attendance ---------------------- */

const ATTENDANCE_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--secondary))"];

function AttendanceTab({ student, termId, terms }: { student: StudentRow; termId: string | null; terms: Term[] }) {
  const term = terms.find((t) => t.id === termId);
  const { data, isLoading } = useQuery({
    queryKey: ["student", "attendance", student.id, termId],
    queryFn: async () => {
      let q = supabase.from("attendance").select("date, status, remark").eq("student_id", student.id).order("date", { ascending: false });
      if (term) q = q.gte("date", term.start_date).lte("date", term.end_date);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data]);

  if (isLoading) return <Card className="p-6 text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading attendance…</Card>;

  const total = (data ?? []).length;
  const countOf = (s: string) => (data ?? []).filter((r) => r.status === s).length;
  const present = countOf("present");
  const late = countOf("late");
  const absent = countOf("absent");
  const excused = countOf("excused");
  const rate = total ? Math.round(((present + late) / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <StatCard icon={CalendarCheck} label="Total Days" value={String(total)} sub={formatTermName(term?.name) ?? "All time"} />
        <StatCard icon={CheckCircle2} label="Present" value={String(present)} sub={`${total ? Math.round((present / total) * 100) : 0}%`} />
        <StatCard icon={Flame} label="Late" value={String(late)} sub={`${total ? Math.round((late / total) * 100) : 0}%`} />
        <StatCard icon={Target} label="Absent" value={String(absent)} sub={`${total ? Math.round((absent / total) * 100) : 0}%`} />
        <StatCard icon={Award} label="Attendance Rate" value={`${rate}%`} sub={excused ? `${excused} excused` : "Present + late"} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-1">
          <p className="font-medium mb-2">Distribution</p>
          {summary.length === 0 ? <p className="text-sm text-muted-foreground">No records.</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={summary} dataKey="value" nameKey="name" outerRadius={80} label>
                  {summary.map((_, i) => <Cell key={i} fill={ATTENDANCE_COLORS[i % ATTENDANCE_COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card className="p-4 md:col-span-2 overflow-auto max-h-[480px]">
          <p className="font-medium mb-2">Day-by-day Record</p>
          {!data?.length ? (
            <p className="text-sm text-muted-foreground">No attendance records for this term.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>Status</TableHead><TableHead>Remark</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r, i) => {
                  const d = new Date(r.date as string);
                  const dayName = isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { weekday: "short" });
                  return (
                    <TableRow key={i}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="text-xs">{dayName}</TableCell>
                      <TableCell><Badge variant={r.status === "present" ? "default" : r.status === "absent" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.remark ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---------------------- Report Card ---------------------- */

function ReportCardTab({ student, terms, selectedTermId }: { student: StudentRow; terms: Term[]; selectedTermId?: string | null }) {
  const termId = selectedTermId ?? terms.find((t) => t.is_current)?.id ?? terms[0]?.id ?? null;

  const { data: card } = useQuery({
    queryKey: ["student", "report", student.id, termId],
    enabled: !!termId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_cards")
        .select("id, total_score, average, position, overall_grade, teacher_comment, principal_comment, published")
        .eq("student_id", student.id)
        .eq("term_id", termId!)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: results } = useQuery({
    queryKey: ["student", "reportResults", student.id, termId],
    enabled: !!termId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("score, grade, remark, exams:exam_id(title, max_score, term_id, published, subjects:subject_id(name))")
        .eq("student_id", student.id);
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.exams?.term_id === termId && r.exams?.published);
    },
  });

  const { data: traitGroups, isFetching: traitsFetching } = useStudentTraitGroups(student.id, termId);
  const traitsLoading = !!termId && (traitsFetching || traitGroups === undefined);

  function downloadPdf() {
    if (!card) return;
    const term = terms.find((t) => t.id === termId);
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Student Report Card", 105, 18, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Name: ${student.full_name}`, 14, 30);
    doc.text(`Admission No: ${student.admission_no}`, 14, 36);
    doc.text(`Class: ${student.classes?.name ?? "—"}`, 14, 42);
    doc.text(`Term: ${formatTermName(term?.name) ?? ""}`, 14, 48);

    const pageH = doc.internal.pageSize.getHeight();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const bottomMargin = 16;

    autoTable(doc, {
      startY: 56,
      head: [["Subject", "Exam", "Score", "Max", "Grade"]],
      body: (results ?? []).map((r: any) => [
        r.exams?.subjects?.name ?? "—",
        r.exams?.title ?? "—",
        String(r.score),
        String(r.exams?.max_score ?? "—"),
        r.grade ?? "",
      ]),
      margin: { left: margin, right: margin, bottom: bottomMargin },
    });
    let finalY = (doc as any).lastAutoTable?.finalY ?? 80;

    const ensureSpace = (needed: number) => {
      if (finalY + needed > pageH - bottomMargin) {
        doc.addPage();
        finalY = margin;
      }
    };

    ensureSpace(12);
    doc.text(
      `Average: ${card.average ?? "—"}   Position: ${card.position ?? "—"}   Grade: ${card.overall_grade ?? "—"}`,
      margin,
      finalY + 10,
    );
    finalY += 16;

    // Traits & skills — let autoTable paginate; keep each group together when possible.
    (traitGroups ?? []).forEach((g) => {
      autoTable(doc, {
        startY: finalY + 4,
        head: [[g.title, "M", "SP", "P", "NA"]],
        body: g.items.map((it) => [
          it.rating == null ? `${it.label}  (not rated yet)` : it.label,
          it.rating === "M" ? "X" : "",
          it.rating === "SP" ? "X" : "",
          it.rating === "P" ? "X" : "",
          it.rating === "NA" ? "X" : "",
        ]),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 234, 254], textColor: 0 },
        margin: { left: margin, right: margin, bottom: bottomMargin },
        rowPageBreak: "avoid",
        pageBreak: "auto",
      });
      finalY = (doc as any).lastAutoTable?.finalY ?? finalY;
    });

    const writeComment = (label: string, value: string) => {
      const text = `${label}: ${value}`;
      const lines = doc.splitTextToSize(text, pageW - margin * 2);
      const needed = lines.length * 5 + 6;
      ensureSpace(needed);
      doc.text(lines, margin, finalY + 8);
      finalY += needed;
    };
    if (card.teacher_comment) writeComment("Teacher", card.teacher_comment);
    if (card.principal_comment) writeComment("Principal", card.principal_comment);

    doc.save(`report-${student.admission_no}-${formatTermName(term?.name) ?? "term"}.pdf`);
  }

  return (
    <div className="space-y-4">
      {card && (
        <div className="flex justify-end">
          <Button onClick={downloadPdf} disabled={traitsLoading}>
            {traitsLoading ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Preparing…</>
            ) : (
              <><Download className="h-4 w-4 mr-1" />Download PDF</>
            )}
          </Button>
        </div>
      )}

      {!card ? (
        <Card className="p-6 text-sm text-muted-foreground">No published report card for this term yet.</Card>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total" value={String(card.total_score ?? "—")} />
            <Stat label="Average" value={card.average != null ? `${card.average}%` : "—"} />
            <Stat label="Position" value={card.position != null ? `#${card.position}` : "—"} />
            <Stat label="Grade" value={card.overall_grade ?? "—"} />
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Subject</TableHead><TableHead>Exam</TableHead><TableHead>Score</TableHead><TableHead>Grade</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {(results ?? []).map((r: any, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.exams?.subjects?.name ?? "—"}</TableCell>
                    <TableCell>{r.exams?.title ?? "—"}</TableCell>
                    <TableCell>{r.score}/{r.exams?.max_score ?? "—"}</TableCell>
                    <TableCell>{r.grade ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(traitGroups ?? []).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Traits &amp; skills</p>
                <p className="text-[10px] text-muted-foreground">
                  M = Mastered · SP = Strongly Progressing · P = Progressing · NA = Needs Attention
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {(traitGroups ?? []).map((g) => (
                  <div key={g.id} className="rounded border">
                    <div className="px-2 py-1 bg-muted/50 text-xs font-semibold">{g.title}</div>
                    <table className="w-full text-xs">
                      <tbody>
                        {g.items.map((it) => (
                          <tr key={it.id} className="border-t">
                            <td className="px-2 py-1">{it.label}</td>
                            {it.rating == null ? (
                              <td colSpan={RATING_COLUMNS.length} className="px-2 py-1 text-center italic text-muted-foreground">
                                Not rated yet
                              </td>
                            ) : (
                              RATING_COLUMNS.map((col) => (
                                <td key={col} className="w-7 text-center text-muted-foreground">
                                  {it.rating === col ? "✓" : ""}
                                </td>
                              ))
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}
          {card.teacher_comment && <p className="text-sm"><strong>Teacher:</strong> {card.teacher_comment}</p>}
          {card.principal_comment && <p className="text-sm"><strong>Principal:</strong> {card.principal_comment}</p>}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

/* ----------------------------- Results Card ----------------------------- */

type ResultRow = {
  subject: string;
  ca1: number | null;
  ca2: number | null;
  exam: number | null;
  exam_max: number;
  total: number;
  grade: string | null;
  remark: string | null;
};

function ResultsCardTab({ student, terms, selectedTermId }: { student: StudentRow; terms: Term[]; selectedTermId?: string | null }) {
  const termId = selectedTermId ?? terms.find((t) => t.is_current)?.id ?? terms[0]?.id ?? null;

  const activeTerm = terms.find((t) => t.id === termId) ?? null;
  const { data: activeGradingScale } = useResolvedGradingScale(student.class_id || undefined, null);
  // Consistent resolution args across consumers: class + term + session (I1)
  const { data: activeStructure } = useResolvedAssessmentStructure(
    student.class_id || undefined,
    null,
    termId,
    activeTerm?.session_id
  );

  const { data: settings } = useQuery({
    queryKey: ["student", "school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("school_name, ca1_weight, ca2_weight, exam_weight, grading_scale")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["student", "results-card", student.id, termId, settings?.exam_weight],
    enabled: !!termId,
    queryFn: async () => {
      const [examsRes, casRes, bsRes] = await Promise.all([
        supabase
          .from("results")
          .select("score, grade, remark, exam:exam_id!inner(id, title, max_score, term_id, published, subject:subject_id(id, name))")
          .eq("student_id", student.id)
          .eq("exam.term_id", termId!)
          .eq("exam.published", true),
        supabase
          .from("continuous_assessments")
          .select("score, max_score, ca_type, title, created_at, subject:subject_id(id, name)")
          .eq("student_id", student.id)
          .eq("term_id", termId!),
        supabase
          .from("broadsheets")
          .select("student_id,subject_id,ca1,ca2,ca3,exam_score")
          .eq("student_id", student.id)
          .eq("term_id", termId!),
      ]);
      if (examsRes.error) throw examsRes.error;
      if (casRes.error) throw casRes.error;
      if (bsRes.error) throw bsRes.error;

      const examRows = (examsRes.data ?? []) as unknown as Array<{
        score: number; grade: string | null; remark: string | null;
        exam: { id: string; title: string; max_score: number; term_id: string; published: boolean; subject: { id: string; name: string } | null } | null;
      }>;
      const caRows = (casRes.data ?? []) as unknown as Array<{
        score: number; max_score: number; ca_type: string;
        subject: { id: string; name: string } | null;
      }>;
      const bsRows = (bsRes.data ?? []) as unknown as Array<{
        student_id: string; subject_id: string;
        ca1: number | null; ca2: number | null; ca3: number | null; exam_score: number | null;
      }>;

      // Look up subject names and delegate row construction to the shared helper (I5/I6)
      const { data: allSubjects } = await supabase.from("subjects").select("id,name");
      return buildResultsCardRows({
        caRows,
        examRows,
        bsRows,
        allSubjects: allSubjects ?? [],
        settings,
        structure: activeStructure,
        gradingBands: activeGradingScale?.bands ?? null,
      });
    },
  });

  const summary = useMemo(() => {
    const list = rows ?? [];
    if (!list.length) return { total: 0, average: 0, count: 0 };
    const total = list.reduce((s, r) => s + r.total, 0);
    return {
      total: Math.round(total * 10) / 10,
      average: Math.round((total / list.length) * 10) / 10,
      count: list.length,
    };
  }, [rows]);

  function handlePrint() { window.print(); }

  function handleDownloadPDF() {
    if (!rows?.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(settings?.school_name ?? "Results Card", 14, 16);
    doc.setFontSize(11);
    doc.text(`${student.full_name} — ${student.classes?.name ?? "—"}`, 14, 24);
    doc.text(`Admission No: ${student.admission_no}`, 14, 30);
    doc.text(`Term: ${activeTerm?.name ?? "—"}`, 14, 36);
    autoTable(doc, {
      startY: 42,
      head: [["Subject", "CA1/10", "CA2/10", `Exam/${rows[0]?.exam_max ?? 100}`, "Total/100", "Grade", "Remark"]],
      body: rows.map((r) => [
        r.subject,
        r.ca1?.toString() ?? "—",
        r.ca2?.toString() ?? "—",
        r.exam?.toString() ?? "—",
        r.total.toString(),
        r.grade ?? "—",
        r.remark ?? "—",
      ]),
      foot: [["Total", "", "", "", summary.total.toString(), "", `Avg ${summary.average}%`]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save(`results-${student.admission_no}-${activeTerm?.name ?? "term"}.pdf`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center justify-end gap-3 print:hidden">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!rows?.length}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button size="sm" onClick={handleDownloadPDF} disabled={!rows?.length}>
            <Download className="h-4 w-4 mr-1.5" /> Download PDF
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">{student.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              Admission No: {student.admission_no} · Class: {student.classes?.name ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">Term: {activeTerm?.name ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{summary.average ? `${summary.average}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">Average</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Subjects" value={summary.count.toString()} />
          <Stat label="Total score" value={summary.total.toString()} />
          <Stat label="Average" value={summary.average ? `${summary.average}%` : "—"} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading results…</p>
        ) : !rows?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No published exam results for this term yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">CA1 /10</TableHead>
                  <TableHead className="text-right">CA2 /10</TableHead>
                  <TableHead className="text-right">Exam /{rows[0]?.exam_max ?? 100}</TableHead>
                  <TableHead className="text-right">Total /100</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subject}>
                    <TableCell className="font-medium">{r.subject}</TableCell>
                    <TableCell className="text-right">{r.ca1 ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.ca2 ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.exam ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{r.total}</TableCell>
                    <TableCell>{r.grade ? <Badge variant="secondary">{r.grade}</Badge> : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.remark ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
