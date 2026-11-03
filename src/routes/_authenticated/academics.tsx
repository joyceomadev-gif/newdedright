import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/paginated-fetch";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichEditor } from "@/components/rich/RichEditor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Trash2, BookOpen, CalendarDays, ClipboardList, FileText, GraduationCap, Users, CheckCircle2, Loader2, AlertCircle, Inbox, RefreshCw, Award, Upload, Download, Library, Smile } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSchoolSettings, computeTermTotal, computeCumulative, gradeFor, pct, type SchoolSettings } from "@/lib/scoring";
import { useResolvedAssessmentStructure, useResolvedGradingScale, gradeForDynamicScale, computeDynamicTotalScore } from "@/lib/assessment-config";
import { AcademicsToolbar } from "@/components/academics/AcademicsToolbar";
import { softDelete } from "@/lib/soft-delete";
import { EarlyYearsAssessmentGrid } from "@/components/results/EarlyYearsAssessmentGrid";
import { PrimarySecondaryResultGrid } from "@/components/results/PrimarySecondaryResultGrid";
import { ExamReviewManager } from "@/components/exams/ExamReviewManager";
import { ShieldCheck } from "lucide-react";
import { SessionSelect, useCurrentSessionId } from "@/components/SessionSelect";

export const Route = createFileRoute("/_authenticated/academics")({
  component: AcademicsPage,
});

type Level = "nursery" | "primary" | "jss" | "sss";
const LEVELS: { value: Level; label: string }[] = [
  { value: "nursery", label: "Creche / Nursery" },
  { value: "primary", label: "Primary" },
  { value: "jss", label: "JSS (Secondary)" },
  { value: "sss", label: "SSS (Secondary)" },
];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CA_TYPES = ["ca1","ca2","ca3","test","project","classwork","homework","other"] as const;

interface ClassRow { id: string; name: string; level: Level; session_id: string | null }
interface SubjectRow { id: string; name: string; class_id: string | null }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string | null }
interface StudentRow { id: string; full_name: string; class_id: string | null }

function useClasses() {
  return useQuery({
    queryKey: ["academics-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level,session_id").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
}
function useSubjects() {
  return useQuery({
    queryKey: ["academics-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name,class_id").order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });
}
function useTerms() {
  return useQuery({
    queryKey: ["academics-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,is_current,session_id").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function AcademicsPage() {
  const { isStaff } = useAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Academics</h1>
        <p className="text-muted-foreground text-sm">
          Curriculum, lesson plans, timetable, homework, and continuous assessment.
        </p>
      </div>
      <Tabs defaultValue="subjects">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="subjects"><Library className="h-3.5 w-3.5 mr-1" />Subjects</TabsTrigger>
          <TabsTrigger value="curriculum"><BookOpen className="h-3.5 w-3.5 mr-1" />Curriculum</TabsTrigger>
          <TabsTrigger value="lessons"><FileText className="h-3.5 w-3.5 mr-1" />Lesson plans</TabsTrigger>
          <TabsTrigger value="timetable"><CalendarDays className="h-3.5 w-3.5 mr-1" />Timetable</TabsTrigger>
          <TabsTrigger value="assignments"><ClipboardList className="h-3.5 w-3.5 mr-1" />Homework</TabsTrigger>
          <TabsTrigger value="ey-assessment"><Smile className="h-3.5 w-3.5 mr-1" />Early Years Competency</TabsTrigger>
          <TabsTrigger value="ps-grid"><GraduationCap className="h-3.5 w-3.5 mr-1" />Result Entry Grid</TabsTrigger>
          <TabsTrigger value="ca"><GraduationCap className="h-3.5 w-3.5 mr-1" />Assessments</TabsTrigger>
          <TabsTrigger value="exam-review"><ShieldCheck className="h-3.5 w-3.5 mr-1 text-primary" />Exam Review</TabsTrigger>
          <TabsTrigger value="gradebook"><GraduationCap className="h-3.5 w-3.5 mr-1" />Gradebook</TabsTrigger>
          <TabsTrigger value="reports"><FileText className="h-3.5 w-3.5 mr-1" />Report cards</TabsTrigger>
          <TabsTrigger value="traits"><Award className="h-3.5 w-3.5 mr-1" />Traits &amp; skills</TabsTrigger>
        </TabsList>
        <TabsContent value="subjects" className="mt-4"><SubjectsTab canEdit={isStaff} /></TabsContent>
        <TabsContent value="curriculum" className="mt-4"><CurriculumTab canEdit={isStaff} /></TabsContent>
        <TabsContent value="lessons" className="mt-4"><LessonPlansTab canEdit={isStaff} /></TabsContent>
        <TabsContent value="timetable" className="mt-4"><TimetableTab canEdit={isStaff} /></TabsContent>
        <TabsContent value="assignments" className="mt-4"><AssignmentsTab canEdit={isStaff} /></TabsContent>
        <TabsContent value="ey-assessment" className="mt-4"><EarlyYearsAssessmentGrid /></TabsContent>
        <TabsContent value="ps-grid" className="mt-4"><PrimarySecondaryResultGrid /></TabsContent>
        <TabsContent value="ca" className="mt-4"><CATab canEdit={isStaff} /></TabsContent>
        <TabsContent value="exam-review" className="mt-4"><ExamReviewManager /></TabsContent>
        <TabsContent value="gradebook" className="mt-4"><GradebookTab /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportCardsTab canEdit={isStaff} /></TabsContent>
        <TabsContent value="traits" className="mt-4"><TraitsTab canEdit={isStaff} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ CURRICULUM ============ */
interface CurriculumRow {
  id: string; level: Level; subject_id: string | null; title: string;
  description: string | null; learning_outcomes: string | null; resources: string | null;
  topics: unknown;
}
function CurriculumTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: subjects } = useSubjects();
  const [levelFilter, setLevelFilter] = useState<Level | "all">("all");
  const [editing, setEditing] = useState<CurriculumRow | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CurriculumRow | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["curriculum"],
    queryFn: async () => {
      const { data, error } = await supabase.from("curriculum").select("*").order("level").order("title");
      if (error) throw error;
      return (data ?? []) as CurriculumRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("curriculum", id);
    },
    onSuccess: () => { toast.success("Curriculum deleted."); qc.invalidateQueries({ queryKey: ["curriculum"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (rows ?? []).filter((r) => levelFilter === "all" || r.level === levelFilter);
  const subjMap = new Map((subjects ?? []).map((s) => [s.id, s.name]));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <h3 className="font-semibold">Curriculum</h3>
          <p className="text-xs text-muted-foreground">Per-level syllabus and learning outcomes.</p>
        </div>
        <div className="flex-1" />
        <Field label="Level">
          <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as Level | "all")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {canEdit && (
          <AcademicsToolbar
            title="Curriculum"
            filename="curriculum"
            rows={filtered}
            columns={[
              { header: "Level", accessor: (r) => LEVELS.find(l => l.value === r.level)?.label ?? r.level },
              { header: "Title", accessor: (r) => r.title },
              { header: "Subject", accessor: (r) => r.subject_id ? (subjMap.get(r.subject_id) ?? "") : "" },
              { header: "Description", accessor: (r) => r.description ?? "" },
              { header: "Learning Outcomes", accessor: (r) => r.learning_outcomes ?? "" },
              { header: "Resources", accessor: (r) => r.resources ?? "" },
            ]}
            canImport={canEdit}
            importHeaders={["level", "title", "subject", "description", "learning_outcomes", "resources"]}
            onImport={async (parsed) => {
              const subjByName = new Map((subjects ?? []).map((s) => [s.name.toLowerCase(), s.id]));
              const validLevels = new Set(LEVELS.map(l => l.value));
              const payload = parsed
                .filter((r) => r.title && validLevels.has(r.level as Level))
                .map((r) => ({
                  level: r.level as Level,
                  title: r.title,
                  subject_id: r.subject ? (subjByName.get(r.subject.toLowerCase()) ?? null) : null,
                  description: r.description || null,
                  learning_outcomes: r.learning_outcomes || null,
                  resources: r.resources || null,
                }));
              if (payload.length === 0) { toast.error("Need 'level' (nursery/primary/jss/sss) and 'title'."); return; }
              const { error } = await supabase.from("curriculum").insert(payload);
              if (error) { toast.error(error.message); return; }
              toast.success(`Imported ${payload.length} curriculum entry(s).`);
              qc.invalidateQueries({ queryKey: ["curriculum"] });
            }}
          />
        )}
        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
            <CurriculumDialog subjects={subjects ?? []} onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["curriculum"] })} />
          </Dialog>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Level</TableHead><TableHead>Title</TableHead><TableHead>Subject</TableHead>
            <TableHead>Outcomes</TableHead>{canEdit && <TableHead className="text-right">Action</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center text-muted-foreground py-8">No curriculum entries.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell><Badge variant="outline">{LEVELS.find(l=>l.value===r.level)?.label ?? r.level}</Badge></TableCell>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell>{r.subject_id ? subjMap.get(r.subject_id) ?? "—" : "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{r.learning_outcomes ?? "—"}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && (
        <CurriculumDialog row={editing} subjects={subjects ?? []} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["curriculum"] })} />
      )}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete curriculum entry?</AlertDialogTitle>
            <AlertDialogDescription>{confirmDel?.title} ({LEVELS.find(l=>l.value===confirmDel?.level)?.label})</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CurriculumDialog({ row, subjects, onClose, onSaved }: {
  row?: CurriculumRow; subjects: SubjectRow[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!row;
  const [form, setForm] = useState({
    level: (row?.level ?? "nursery") as Level,
    subject_id: row?.subject_id ?? "",
    title: row?.title ?? "",
    description: row?.description ?? "",
    learning_outcomes: row?.learning_outcomes ?? "",
    resources: row?.resources ?? "",
    academic_session_id: (row as unknown as { session_id?: string | null })?.session_id ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      const payload = {
        level: form.level,
        subject_id: form.subject_id || null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        learning_outcomes: form.learning_outcomes.trim() || null,
        resources: form.resources.trim() || null,
        session_id: form.academic_session_id || null,
      };
      if (isEdit && row) {
        const { error } = await supabase.from("curriculum").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("curriculum").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Updated." : "Added."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dlg = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit curriculum" : "New curriculum entry"}</DialogTitle>
        <DialogDescription>Define syllabus topics and learning outcomes per level.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <SessionSelect value={form.academic_session_id} onChange={(v) => setForm({ ...form, academic_session_id: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level" required>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as Level })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={form.subject_id || "none"} onValueChange={(v) => setForm({ ...form, subject_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
        </Field>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Learning outcomes"><Textarea rows={3} value={form.learning_outcomes} onChange={(e) => setForm({ ...form, learning_outcomes: e.target.value })} /></Field>
        <Field label="Resources"><Textarea rows={2} value={form.resources} onChange={(e) => setForm({ ...form, resources: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
  if (isEdit) return <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>{dlg}</Dialog>;
  return dlg;
}

/* ============ LESSON PLANS ============ */
interface LessonRow {
  id: string; class_id: string; subject_id: string; term_id: string | null;
  week_number: number | null; topic: string; objectives: string | null;
  materials: string | null; activities: string | null; evaluation: string | null;
  lesson_date: string | null;
}
function LessonPlansTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: terms } = useTerms();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [editing, setEditing] = useState<LessonRow | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<LessonRow | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["lesson-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lesson_plans").select("*").order("week_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LessonRow[];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("lesson_plans", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Lesson plan deleted."); qc.invalidateQueries({ queryKey: ["lesson-plans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const classMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const subjMap = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const filtered = (rows ?? []).filter((r) => classFilter === "all" || r.class_id === classFilter);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><h3 className="font-semibold">Lesson plans</h3><p className="text-xs text-muted-foreground">Weekly lesson notes per class & subject.</p></div>
        <div className="flex-1" />
        <Field label="Class">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {canEdit && (
          <AcademicsToolbar
            title="Lesson Plans"
            filename="lesson-plans"
            rows={filtered}
            columns={[
              { header: "Week", accessor: (r) => r.week_number ?? "" },
              { header: "Class", accessor: (r) => classMap.get(r.class_id) ?? "" },
              { header: "Subject", accessor: (r) => subjMap.get(r.subject_id) ?? "" },
              { header: "Topic", accessor: (r) => r.topic },
              { header: "Date", accessor: (r) => r.lesson_date ?? "" },
              { header: "Objectives", accessor: (r) => r.objectives ?? "" },
              { header: "Materials", accessor: (r) => r.materials ?? "" },
              { header: "Activities", accessor: (r) => r.activities ?? "" },
              { header: "Evaluation", accessor: (r) => r.evaluation ?? "" },
            ]}
            canImport={canEdit}
            importHeaders={["class", "subject", "week", "topic", "date", "objectives", "materials", "activities", "evaluation"]}
            onImport={async (parsed) => {
              const classByName = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), c.id]));
              const subjByName = new Map((subjects ?? []).map((s) => [s.name.toLowerCase(), s.id]));
              const payload = parsed
                .map((r) => ({
                  class_id: classByName.get((r.class || "").toLowerCase()),
                  subject_id: subjByName.get((r.subject || "").toLowerCase()),
                  week_number: r.week ? Number(r.week) : null,
                  topic: r.topic,
                  lesson_date: r.date || null,
                  objectives: r.objectives || null,
                  materials: r.materials || null,
                  activities: r.activities || null,
                  evaluation: r.evaluation || null,
                }))
                .filter((r) => r.class_id && r.subject_id && r.topic);
              if (payload.length === 0) { toast.error("Need valid 'class', 'subject', and 'topic'."); return; }
              const { error } = await supabase.from("lesson_plans").insert(payload as never);
              if (error) { toast.error(error.message); return; }
              toast.success(`Imported ${payload.length} lesson plan(s).`);
              qc.invalidateQueries({ queryKey: ["lesson-plans"] });
            }}
          />
        )}
        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
            <LessonPlanDialog classes={classes ?? []} subjects={subjects ?? []} terms={terms ?? []} onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["lesson-plans"] })} />
          </Dialog>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Week</TableHead><TableHead>Class</TableHead><TableHead>Subject</TableHead>
            <TableHead>Topic</TableHead><TableHead>Date</TableHead>{canEdit && <TableHead className="text-right">Action</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">No lesson plans.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.week_number ?? "—"}</TableCell>
                <TableCell>{classMap.get(r.class_id) ?? "—"}</TableCell>
                <TableCell>{subjMap.get(r.subject_id) ?? "—"}</TableCell>
                <TableCell className="font-medium">{r.topic}</TableCell>
                <TableCell>{r.lesson_date ?? "—"}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <LessonPlanDialog row={editing} classes={classes ?? []} subjects={subjects ?? []} terms={terms ?? []} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["lesson-plans"] })} />}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lesson plan?</AlertDialogTitle>
            <AlertDialogDescription>{confirmDel?.topic} (Week {confirmDel?.week_number ?? "—"})</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LessonPlanDialog({ row, classes, subjects, terms, onClose, onSaved }: {
  row?: LessonRow; classes: ClassRow[]; subjects: SubjectRow[]; terms: TermRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!row;
  const [form, setForm] = useState({
    class_id: row?.class_id ?? "", subject_id: row?.subject_id ?? "",
    term_id: row?.term_id ?? "", week_number: row?.week_number ?? 1,
    topic: row?.topic ?? "", lesson_date: row?.lesson_date ?? "",
    objectives: row?.objectives ?? "", materials: row?.materials ?? "",
    activities: row?.activities ?? "", evaluation: row?.evaluation ?? "",
    academic_session_id: (row as unknown as { academic_session_id?: string | null })?.academic_session_id ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.class_id || !form.subject_id || !form.topic.trim()) throw new Error("Class, subject and topic are required.");
      const payload = {
        class_id: form.class_id, subject_id: form.subject_id,
        term_id: form.term_id || null, week_number: Number(form.week_number) || null,
        topic: form.topic.trim(), lesson_date: form.lesson_date || null,
        objectives: form.objectives.trim() || null, materials: form.materials.trim() || null,
        activities: form.activities.trim() || null, evaluation: form.evaluation.trim() || null,
        ...(form.academic_session_id ? { academic_session_id: form.academic_session_id } : {}),
      };
      if (isEdit && row) {
        const { error } = await supabase.from("lesson_plans").update(payload).eq("id", row.id); if (error) throw error;
      } else {
        const { error } = await supabase.from("lesson_plans").insert({ ...payload, teacher_id: user?.id ?? null }); if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Updated." : "Created."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dlg = (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{isEdit ? "Edit lesson plan" : "New lesson plan"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
        <SessionSelect value={form.academic_session_id} onChange={(v) => setForm({ ...form, academic_session_id: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class" required>
            <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subject" required>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Week"><Input type="number" min={1} max={20} value={form.week_number} onChange={(e) => setForm({ ...form, week_number: Number(e.target.value) })} /></Field>
          <Field label="Date"><Input type="date" value={form.lesson_date} onChange={(e) => setForm({ ...form, lesson_date: e.target.value })} /></Field>
          <Field label="Term">
            <Select value={form.term_id || "none"} onValueChange={(v) => setForm({ ...form, term_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Topic" required><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={200} /></Field>
        <Field label="Objectives"><RichEditor rows={2} value={form.objectives} onChange={(v) => setForm({ ...form, objectives: v })} /></Field>
        <Field label="Materials"><RichEditor rows={2} value={form.materials} onChange={(v) => setForm({ ...form, materials: v })} /></Field>
        <Field label="Activities"><RichEditor rows={2} value={form.activities} onChange={(v) => setForm({ ...form, activities: v })} /></Field>
        <Field label="Evaluation"><RichEditor rows={2} value={form.evaluation} onChange={(v) => setForm({ ...form, evaluation: v })} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
  if (isEdit) return <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>{dlg}</Dialog>;
  return dlg;
}

/* ============ TIMETABLE ============ */
interface TimetableRow {
  id: string; class_id: string; subject_id: string; teacher_id: string | null;
  day_of_week: number; start_time: string; end_time: string; room: string | null;
}
function TimetableTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [editing, setEditing] = useState<TimetableRow | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<TimetableRow | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["timetable"],
    queryFn: async () => {
      const { data, error } = await supabase.from("timetable").select("*").order("day_of_week").order("start_time");
      if (error) throw error;
      return (data ?? []) as TimetableRow[];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("timetable", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Slot deleted."); qc.invalidateQueries({ queryKey: ["timetable"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const classMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const subjMap = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const filtered = (rows ?? []).filter((r) => classFilter === "all" || r.class_id === classFilter);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><h3 className="font-semibold">Timetable</h3><p className="text-xs text-muted-foreground">Class period scheduling.</p></div>
        <div className="flex-1" />
        <Field label="Class">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {canEdit && (
          <AcademicsToolbar
            title="Timetable"
            filename="timetable"
            rows={filtered}
            columns={[
              { header: "Day", accessor: (r) => DAYS[r.day_of_week] ?? r.day_of_week },
              { header: "Start", accessor: (r) => r.start_time?.slice(0, 5) ?? "" },
              { header: "End", accessor: (r) => r.end_time?.slice(0, 5) ?? "" },
              { header: "Class", accessor: (r) => classMap.get(r.class_id) ?? "" },
              { header: "Subject", accessor: (r) => subjMap.get(r.subject_id) ?? "" },
              { header: "Room", accessor: (r) => r.room ?? "" },
            ]}
            canImport={canEdit}
            importHeaders={["class", "subject", "day", "start", "end", "room"]}
            onImport={async (parsed) => {
              const classByName = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), c.id]));
              const subjByName = new Map((subjects ?? []).map((s) => [s.name.toLowerCase(), s.id]));
              const dayIdx = (d: string) => {
                const n = Number(d);
                if (!Number.isNaN(n)) return n;
                const i = DAYS.findIndex((x) => x.toLowerCase() === d.toLowerCase().slice(0, 3));
                return i;
              };
              const payload = parsed
                .map((r) => ({
                  class_id: classByName.get((r.class || "").toLowerCase()),
                  subject_id: subjByName.get((r.subject || "").toLowerCase()),
                  day_of_week: dayIdx(r.day || ""),
                  start_time: r.start,
                  end_time: r.end,
                  room: r.room || null,
                }))
                .filter((r) => r.class_id && r.subject_id && r.start_time && r.end_time && r.day_of_week >= 0);
              if (payload.length === 0) { toast.error("Need 'class', 'subject', 'day', 'start', 'end'."); return; }
              const { error } = await supabase.from("timetable").insert(payload as never);
              if (error) { toast.error(error.message); return; }
              toast.success(`Imported ${payload.length} slot(s).`);
              qc.invalidateQueries({ queryKey: ["timetable"] });
            }}
          />
        )}
        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add slot</Button></DialogTrigger>
            <TimetableDialog classes={classes ?? []} subjects={subjects ?? []} onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["timetable"] })} />
          </Dialog>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Day</TableHead><TableHead>Time</TableHead><TableHead>Class</TableHead>
            <TableHead>Subject</TableHead><TableHead>Room</TableHead>{canEdit && <TableHead className="text-right">Action</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">No slots.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{DAYS[r.day_of_week] ?? r.day_of_week}</TableCell>
                <TableCell>{r.start_time?.slice(0,5)}–{r.end_time?.slice(0,5)}</TableCell>
                <TableCell>{classMap.get(r.class_id) ?? "—"}</TableCell>
                <TableCell>{subjMap.get(r.subject_id) ?? "—"}</TableCell>
                <TableCell>{r.room ?? "—"}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <TimetableDialog row={editing} classes={classes ?? []} subjects={subjects ?? []} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["timetable"] })} />}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slot?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel && `${DAYS[confirmDel.day_of_week]} ${confirmDel.start_time?.slice(0,5)}–${confirmDel.end_time?.slice(0,5)}, ${classMap.get(confirmDel.class_id) ?? ""} · ${subjMap.get(confirmDel.subject_id) ?? ""}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TimetableDialog({ row, classes, subjects, onClose, onSaved }: {
  row?: TimetableRow; classes: ClassRow[]; subjects: SubjectRow[]; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!row;
  const [form, setForm] = useState({
    class_id: row?.class_id ?? "", subject_id: row?.subject_id ?? "",
    day_of_week: row?.day_of_week ?? 1, start_time: row?.start_time?.slice(0,5) ?? "08:00",
    end_time: row?.end_time?.slice(0,5) ?? "08:40", room: row?.room ?? "",
    academic_session_id: (row as unknown as { academic_session_id?: string | null })?.academic_session_id ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.class_id || !form.subject_id) throw new Error("Class and subject required.");
      if (form.start_time >= form.end_time) throw new Error("End time must be after start time.");
      const payload = {
        class_id: form.class_id, subject_id: form.subject_id,
        day_of_week: Number(form.day_of_week), start_time: form.start_time,
        end_time: form.end_time, room: form.room.trim() || null,
        ...(form.academic_session_id ? { academic_session_id: form.academic_session_id } : {}),
      };
      if (isEdit && row) { const { error } = await supabase.from("timetable").update(payload).eq("id", row.id); if (error) throw error; }
      else { const { error } = await supabase.from("timetable").insert({ ...payload, teacher_id: user?.id ?? null }); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? "Updated." : "Added."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dlg = (
    <DialogContent>
      <DialogHeader><DialogTitle>{isEdit ? "Edit slot" : "New timetable slot"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <SessionSelect value={form.academic_session_id} onChange={(v) => setForm({ ...form, academic_session_id: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class" required>
            <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subject" required>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Day">
            <Select value={String(form.day_of_week)} onValueChange={(v) => setForm({ ...form, day_of_week: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Start"><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
          <Field label="End"><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
        </div>
        <Field label="Room"><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} maxLength={50} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
  if (isEdit) return <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>{dlg}</Dialog>;
  return dlg;
}

/* ============ ASSIGNMENTS / HOMEWORK ============ */
type AssignmentStatus = "draft" | "published" | "closed";
interface AssignmentRow {
  id: string; class_id: string; subject_id: string; term_id: string | null;
  title: string; instructions: string | null; max_score: number;
  assigned_date: string; due_date: string | null; status: AssignmentStatus;
}
function AssignmentsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: terms } = useTerms();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<AssignmentRow | null>(null);
  const [submissionsFor, setSubmissionsFor] = useState<AssignmentRow | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assignments").select("*").order("assigned_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AssignmentRow[];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("assignments", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Assignment deleted."); qc.invalidateQueries({ queryKey: ["assignments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const classMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const subjMap = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const filtered = (rows ?? []).filter((r) => classFilter === "all" || r.class_id === classFilter);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><h3 className="font-semibold">Homework & assignments</h3><p className="text-xs text-muted-foreground">Create, publish and track assignments.</p></div>
        <div className="flex-1" />
        <Field label="Class">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {canEdit && (
          <AcademicsToolbar
            title="Homework"
            filename="homework"
            rows={filtered}
            columns={[
              { header: "Title", accessor: (r) => r.title },
              { header: "Class", accessor: (r) => classMap.get(r.class_id) ?? "" },
              { header: "Subject", accessor: (r) => subjMap.get(r.subject_id) ?? "" },
              { header: "Assigned", accessor: (r) => r.assigned_date },
              { header: "Due", accessor: (r) => r.due_date ?? "" },
              { header: "Max Score", accessor: (r) => r.max_score },
              { header: "Status", accessor: (r) => r.status },
              { header: "Instructions", accessor: (r) => r.instructions ?? "" },
            ]}
            canImport={canEdit}
            importHeaders={["class", "subject", "title", "assigned_date", "due_date", "max_score", "status", "instructions"]}
            onImport={async (parsed) => {
              const classByName = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), c.id]));
              const subjByName = new Map((subjects ?? []).map((s) => [s.name.toLowerCase(), s.id]));
              const payload = parsed
                .map((r) => ({
                  class_id: classByName.get((r.class || "").toLowerCase()),
                  subject_id: subjByName.get((r.subject || "").toLowerCase()),
                  title: r.title,
                  assigned_date: r.assigned_date || new Date().toISOString().slice(0, 10),
                  due_date: r.due_date || null,
                  max_score: r.max_score ? Number(r.max_score) : 100,
                  status: (["draft", "published", "closed"].includes(r.status) ? r.status : "draft") as AssignmentStatus,
                  instructions: r.instructions || null,
                }))
                .filter((r) => r.class_id && r.subject_id && r.title);
              if (payload.length === 0) { toast.error("Need 'class', 'subject', 'title'."); return; }
              const { error } = await supabase.from("assignments").insert(payload as never);
              if (error) { toast.error(error.message); return; }
              toast.success(`Imported ${payload.length} homework item(s).`);
              qc.invalidateQueries({ queryKey: ["assignments"] });
            }}
          />
        )}
        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button></DialogTrigger>
            <AssignmentDialog classes={classes ?? []} subjects={subjects ?? []} terms={terms ?? []} onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["assignments"] })} />
          </Dialog>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead><TableHead>Class</TableHead><TableHead>Subject</TableHead>
            <TableHead>Due</TableHead><TableHead>Max</TableHead><TableHead>Status</TableHead>
            {canEdit && <TableHead className="text-right">Action</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground py-8">No assignments.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.title}</TableCell>
                <TableCell>{classMap.get(r.class_id) ?? "—"}</TableCell>
                <TableCell>{subjMap.get(r.subject_id) ?? "—"}</TableCell>
                <TableCell>{r.due_date ?? "—"}</TableCell>
                <TableCell>{r.max_score}</TableCell>
                <TableCell><Badge variant={r.status === "published" ? "default" : r.status === "closed" ? "outline" : "secondary"}>{r.status}</Badge></TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSubmissionsFor(r)} title="Submissions"><Users className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <AssignmentDialog row={editing} classes={classes ?? []} subjects={subjects ?? []} terms={terms ?? []} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["assignments"] })} />}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assignment?</AlertDialogTitle>
            <AlertDialogDescription>{confirmDel?.title}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {submissionsFor && (
        <SubmissionsDialog assignment={submissionsFor} onClose={() => setSubmissionsFor(null)} />
      )}
    </Card>
  );
}

function AssignmentDialog({ row, classes, subjects, terms, onClose, onSaved }: {
  row?: AssignmentRow; classes: ClassRow[]; subjects: SubjectRow[]; terms: TermRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!row;
  const [form, setForm] = useState({
    class_id: row?.class_id ?? "", subject_id: row?.subject_id ?? "",
    term_id: row?.term_id ?? "", title: row?.title ?? "",
    instructions: row?.instructions ?? "", max_score: row?.max_score ?? 100,
    assigned_date: row?.assigned_date ?? new Date().toISOString().slice(0,10),
    due_date: row?.due_date ?? "", status: (row?.status ?? "draft") as AssignmentStatus,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.class_id || !form.subject_id || !form.title.trim()) throw new Error("Class, subject and title required.");
      if (form.due_date && form.due_date < form.assigned_date) throw new Error("Due date must be on/after assigned date.");
      const termSession = terms.find((t) => t.id === form.term_id)?.session_id;
      const classSession = classes.find((c) => c.id === form.class_id)?.session_id;
      const academic_session_id = termSession || classSession;
      if (!academic_session_id) throw new Error("Could not determine academic session for this assignment.");
      const payload = {
        class_id: form.class_id, subject_id: form.subject_id,
        term_id: form.term_id || null, title: form.title.trim(),
        instructions: form.instructions.trim() || null, max_score: Number(form.max_score) || 100,
        assigned_date: form.assigned_date, due_date: form.due_date || null,
        status: form.status, academic_session_id,
      };
      if (isEdit && row) { const { error } = await supabase.from("assignments").update(payload).eq("id", row.id); if (error) throw error; }
      else { const { error } = await supabase.from("assignments").insert({ ...payload, teacher_id: user?.id ?? null }); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? "Updated." : "Created."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dlg = (
    <DialogContent>
      <DialogHeader><DialogTitle>{isEdit ? "Edit assignment" : "New assignment"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class" required>
            <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subject" required>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Title" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></Field>
        <Field label="Instructions"><RichEditor rows={3} value={form.instructions} onChange={(v) => setForm({ ...form, instructions: v })} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Assigned"><Input type="date" value={form.assigned_date} onChange={(e) => setForm({ ...form, assigned_date: e.target.value })} /></Field>
          <Field label="Due"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Max score"><Input type="number" min={1} value={form.max_score} onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Term">
            <Select value={form.term_id || "none"} onValueChange={(v) => setForm({ ...form, term_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AssignmentStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
  if (isEdit) return <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>{dlg}</Dialog>;
  return dlg;
}

/* ============ CONTINUOUS ASSESSMENT ============ */
type CAType = typeof CA_TYPES[number];
interface CARow {
  id: string; student_id: string; class_id: string | null; subject_id: string;
  term_id: string | null; ca_type: CAType; title: string | null;
  score: number; max_score: number; assessment_date: string; remark: string | null;
}
function CATab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: terms } = useTerms();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [editing, setEditing] = useState<CARow | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<CARow | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["ca"],
    queryFn: async () => {
      const { data, error } = await supabase.from("continuous_assessments").select("*").order("assessment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CARow[];
    },
  });
  const { data: students } = useQuery({
    queryKey: ["ca-students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,full_name,class_id").order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("continuous_assessments", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Record deleted."); qc.invalidateQueries({ queryKey: ["ca"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const studentMap = useMemo(() => new Map((students ?? []).map((s) => [s.id, s.full_name])), [students]);
  const subjMap = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const filtered = (rows ?? []).filter((r) => classFilter === "all" || r.class_id === classFilter);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div><h3 className="font-semibold">Continuous assessments</h3><p className="text-xs text-muted-foreground">CA1, CA2, tests, projects and other classwork scores.</p></div>
        <div className="flex-1" />
        <Field label="Class">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Record</Button></DialogTrigger>
            <CADialog students={(students ?? []).filter((s) => classFilter === "all" || s.class_id === classFilter)} subjects={subjects ?? []} terms={terms ?? []} onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["ca"] })} />
          </Dialog>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Student</TableHead><TableHead>Subject</TableHead>
            <TableHead>Type</TableHead><TableHead>Score</TableHead>
            {canEdit && <TableHead className="text-right">Action</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground py-8">No records.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.assessment_date}</TableCell>
                <TableCell className="font-medium">{studentMap.get(r.student_id) ?? "—"}</TableCell>
                <TableCell>{subjMap.get(r.subject_id) ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{r.ca_type.toUpperCase()}</Badge></TableCell>
                <TableCell className="font-semibold">{r.score} / {r.max_score}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing && <CADialog row={editing} students={students ?? []} subjects={subjects ?? []} terms={terms ?? []} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["ca"] })} />}
      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete assessment record?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel && `${studentMap.get(confirmDel.student_id) ?? ""} · ${subjMap.get(confirmDel.subject_id) ?? ""} · ${confirmDel.ca_type.toUpperCase()} · ${confirmDel.score}/${confirmDel.max_score}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CADialog({ row, students, subjects, terms, onClose, onSaved }: {
  row?: CARow; students: StudentRow[]; subjects: SubjectRow[]; terms: TermRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!row;
  const [form, setForm] = useState({
    student_id: row?.student_id ?? "", subject_id: row?.subject_id ?? "",
    term_id: row?.term_id ?? "", ca_type: (row?.ca_type ?? "ca1") as CAType,
    title: row?.title ?? "", score: row?.score ?? 0, max_score: row?.max_score ?? 10,
    assessment_date: row?.assessment_date ?? new Date().toISOString().slice(0,10),
    remark: row?.remark ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.student_id || !form.subject_id) throw new Error("Student and subject required.");
      if (form.score < 0 || form.max_score <= 0 || form.score > form.max_score)
        throw new Error("Score must be between 0 and max.");
      const student = students.find((s) => s.id === form.student_id);
      const termSession = terms.find((t) => t.id === form.term_id)?.session_id;
      if (!termSession) throw new Error("Could not determine academic session for this assessment.");
      const payload = {
        student_id: form.student_id, class_id: student?.class_id ?? null,
        subject_id: form.subject_id, term_id: form.term_id || null,
        ca_type: form.ca_type, title: form.title.trim() || null,
        score: Number(form.score), max_score: Number(form.max_score),
        assessment_date: form.assessment_date, remark: form.remark.trim() || null,
        academic_session_id: termSession,
      };
      if (isEdit && row) { const { error } = await supabase.from("continuous_assessments").update(payload).eq("id", row.id); if (error) throw error; }
      else { const { error } = await supabase.from("continuous_assessments").insert({ ...payload, recorded_by: user?.id ?? null }); if (error) throw error; }
    },
    onSuccess: () => { toast.success(isEdit ? "Updated." : "Recorded."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const dlg = (
    <DialogContent>
      <DialogHeader><DialogTitle>{isEdit ? "Edit assessment" : "New assessment record"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <Field label="Student" required>
          <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })} disabled={isEdit}>
            <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
            <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject" required>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={form.ca_type} onValueChange={(v) => setForm({ ...form, ca_type: v as CAType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CA_TYPES.map((t) => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><Input type="date" value={form.assessment_date} onChange={(e) => setForm({ ...form, assessment_date: e.target.value })} /></Field>
          <Field label="Score" required><Input type="number" min={0} value={form.score} onChange={(e) => setForm({ ...form, score: Number(e.target.value) })} /></Field>
          <Field label="Max" required><Input type="number" min={1} value={form.max_score} onChange={(e) => setForm({ ...form, max_score: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Term">
          <Select value={form.term_id || "none"} onValueChange={(v) => setForm({ ...form, term_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Title / topic"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} /></Field>
        <Field label="Remark"><Textarea rows={2} value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
  if (isEdit) return <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>{dlg}</Dialog>;
  return dlg;
}

/* ============ SUBMISSIONS ============ */
type SubmissionStatus = "submitted" | "late" | "graded" | "returned";
const SUB_STATUSES: SubmissionStatus[] = ["submitted", "late", "graded", "returned"];

interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string | null;
  attachment_url: string | null;
  submitted_at: string;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  student?: { id: string; full_name: string; admission_no: string | null } | null;
}

function SubmissionsDialog({
  assignment,
  onClose,
}: {
  assignment: AssignmentRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [grading, setGrading] = useState<SubmissionRow | null>(null);

  const { data: submissions, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["assignment-submissions", assignment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, student:students(id, full_name, admission_no)")
        .eq("assignment_id", assignment.id)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionRow[];
    },
  });

  const {
    data: classStudents,
    isLoading: isLoadingStudents,
    isError: isErrorStudents,
  } = useQuery({
    queryKey: ["class-students", assignment.class_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no")
        .eq("class_id", assignment.class_id)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SubmissionStatus }) => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated.");
      qc.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submittedIds = new Set((submissions ?? []).map((s) => s.student_id));
  const missing = (classStudents ?? []).filter((s) => !submittedIds.has(s.id));
  const pastDue = assignment.due_date ? new Date(assignment.due_date) < new Date() : false;
  const pendingStatusId = setStatus.isPending ? (setStatus.variables?.id ?? null) : null;
  const busy = isLoading || isLoadingStudents;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Submissions — {assignment.title}
              {isFetching && !isLoading && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Refreshing" />
              )}
            </DialogTitle>
            <DialogDescription>
              Due {assignment.due_date ?? "no date"} · Max {assignment.max_score} ·
              {" "}{busy ? "…" : `${submissions?.length ?? 0} submitted, ${missing.length} pending`}
              {pastDue && <Badge variant="outline" className="ml-2">Past due</Badge>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
            {isError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-destructive">Couldn't load submissions</p>
                    <p className="text-muted-foreground mt-0.5">{(error as Error)?.message ?? "Unknown error."}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                    Retry
                  </Button>
                </div>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <p className="text-sm">Loading submissions…</p>
              </div>
            ) : (submissions ?? []).length === 0 && missing.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 opacity-60" />
                <p className="text-sm font-medium">No students or submissions yet</p>
                <p className="text-xs mt-1">Add students to this class to start tracking submissions.</p>
              </div>
            ) : (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Submitted ({submissions?.length ?? 0})</h4>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(submissions ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                              <Inbox className="h-5 w-5 mx-auto mb-1 opacity-60" />
                              No submissions yet.
                            </TableCell>
                          </TableRow>
                        ) : (submissions ?? []).map((s) => {
                          const updating = pendingStatusId === s.id;
                          return (
                            <TableRow key={s.id} className={updating ? "opacity-60" : ""}>
                              <TableCell className="font-medium">{s.student?.full_name ?? "—"}</TableCell>
                              <TableCell className="text-xs">{new Date(s.submitted_at).toLocaleString()}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Select
                                    value={s.status}
                                    onValueChange={(v) => setStatus.mutate({ id: s.id, status: v as SubmissionStatus })}
                                    disabled={updating}
                                  >
                                    <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {SUB_STATUSES.map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  {updating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                </div>
                              </TableCell>
                              <TableCell>{s.score != null ? `${s.score}/${assignment.max_score}` : "—"}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="outline" onClick={() => setGrading(s)} disabled={updating}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Grade
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {isErrorStudents ? (
                  <p className="text-xs text-destructive">Couldn't load class roster.</p>
                ) : missing.length > 0 ? (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Pending ({missing.length})</h4>
                    <div className="flex flex-wrap gap-1">
                      {missing.map((s) => (
                        <Badge key={s.id} variant="secondary" className="text-xs">{s.full_name}</Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {grading && (
        <GradeSubmissionDialog
          submission={grading}
          maxScore={assignment.max_score}
          gradedBy={user?.id ?? null}
          onClose={() => setGrading(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["assignment-submissions", assignment.id] })}
        />
      )}
    </>
  );
}

function GradeSubmissionDialog({
  submission, maxScore, gradedBy, onClose, onSaved,
}: {
  submission: SubmissionRow;
  maxScore: number;
  gradedBy: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState<number | "">(submission.score ?? "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const n = score === "" ? null : Number(score);
      if (n != null && (Number.isNaN(n) || n < 0 || n > maxScore)) {
        throw new Error(`Score must be between 0 and ${maxScore}.`);
      }
      const { error } = await supabase
        .from("assignment_submissions")
        .update({
          score: n,
          feedback: feedback.trim() || null,
          status: "graded",
          graded_by: gradedBy,
          graded_at: new Date().toISOString(),
        })
        .eq("id", submission.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Graded."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grade submission</DialogTitle>
          <DialogDescription>{submission.student?.full_name ?? "—"}</DialogDescription>
        </DialogHeader>
        {submission.content && (
          <div className="rounded-md border bg-muted/30 p-2 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
            {submission.content}
          </div>
        )}
        <div className="grid gap-3">
          <Field label={`Score (out of ${maxScore})`} required>
            <Input
              type="number" min={0} max={maxScore} value={score}
              onChange={(e) => setScore(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </Field>
          <Field label="Feedback">
            <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} />
          </Field>
        </div>
        {save.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-destructive">Couldn't save grade</p>
                <p className="text-muted-foreground mt-0.5 break-words">
                  {(save.error as Error)?.message ?? "Unknown error."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => save.mutate()}
                disabled={save.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${save.isPending ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {save.isPending ? "Saving…" : save.isError ? "Try again" : "Save grade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   GRADEBOOK — term totals & cumulative per scoring scheme
   ============================================================ */
interface GradebookCA { student_id: string; subject_id: string; term_id: string | null; ca_type: string; score: number; max_score: number }
interface GradebookExamRow { student_id: string; score: number; exam: { class_id: string; subject_id: string; term_id: string | null; max_score: number } | null }

function GradebookTab() {
  const { data: settings } = useSchoolSettings();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: terms } = useTerms();
  const [classId, setClassId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");

  const { data: activeStructure } = useResolvedAssessmentStructure(classId || undefined, subjectId || undefined);
  const { data: activeGradingScale } = useResolvedGradingScale(classId || undefined, subjectId || undefined);

  const subjectsForClass = useMemo(
    () => (subjects ?? []).filter((s) => !classId || !s.class_id || s.class_id === classId),
    [subjects, classId],
  );

  const studentsQ = useQuery({
    queryKey: ["gradebook-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,full_name,class_id").eq("class_id", classId).order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const caQ = useQuery({
    queryKey: ["gradebook-ca", classId, subjectId],
    enabled: !!classId && !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("continuous_assessments")
        .select("student_id,subject_id,term_id,ca_type,score,max_score")
        .eq("class_id", classId)
        .eq("subject_id", subjectId);
      if (error) throw error;
      return (data ?? []) as GradebookCA[];
    },
  });

  const examQ = useQuery({
    queryKey: ["gradebook-exam", classId, subjectId],
    enabled: !!classId && !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id,score,exam:exams!inner(class_id,subject_id,term_id,max_score)")
        .eq("exam.class_id", classId)
        .eq("exam.subject_id", subjectId);
      if (error) throw error;
      return (data ?? []) as unknown as GradebookExamRow[];
    },
  });

  const orderedTerms = useMemo(() => {
    const order = { first: 0, second: 1, third: 2 } as Record<string, number>;
    return [...(terms ?? [])].sort((a, b) => (order[a.name] ?? 99) - (order[b.name] ?? 99));
  }, [terms]);

  if (!settings) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading settings…</div>;

  const scheme = settings.scoring_scheme;
  const showComputed = scheme !== "display_only";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <h3 className="font-semibold">Gradebook</h3>
          <p className="text-xs text-muted-foreground">
            Computed using <Badge variant="outline">{labelForScheme(scheme)}</Badge>
            {showComputed && <> · cumulative = <Badge variant="outline">{settings.cumulative_method === "sum_of_terms" ? "Sum of terms" : "Average of terms"}</Badge></>}
          </p>
        </div>
        <div className="flex-1" />
        <Field label="Class">
          <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(""); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Subject">
          <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select subject" /></SelectTrigger>
            <SelectContent>{subjectsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>

      {!classId || !subjectId ? (
        <div className="text-center text-sm text-muted-foreground py-10">Pick a class and subject to view the gradebook.</div>
      ) : caQ.isLoading || examQ.isLoading || studentsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : caQ.isError || examQ.isError ? (
        <div className="text-center text-sm text-destructive py-10 flex items-center gap-2 justify-center"><AlertCircle className="h-4 w-4" />Failed to load gradebook.</div>
      ) : (
        <GradebookTable
          settings={settings}
          students={studentsQ.data ?? []}
          terms={orderedTerms}
          ca={caQ.data ?? []}
          exams={examQ.data ?? []}
        />
      )}
    </Card>
  );
}

function labelForScheme(s: SchoolSettings["scoring_scheme"]) {
  if (s === "weighted_ca_exam") return "Weighted CA + Exam";
  if (s === "running_average") return "Running average";
  return "Display only";
}

function GradebookTable({ settings, students, terms, ca, exams }: {
  settings: SchoolSettings;
  students: StudentRow[];
  terms: TermRow[];
  ca: GradebookCA[];
  exams: GradebookExamRow[];
}) {
  const showComputed = settings.scoring_scheme !== "display_only";

  // index: studentId -> termId -> { caScoresPct, examScorePct }
  const byStudent = useMemo(() => {
    const map = new Map<string, Map<string, { caScoresPct: number[]; examScorePct: number | null }>>();
    const ensure = (sid: string, tid: string) => {
      let s = map.get(sid);
      if (!s) { s = new Map(); map.set(sid, s); }
      let t = s.get(tid);
      if (!t) { t = { caScoresPct: [], examScorePct: null }; s.set(tid, t); }
      return t;
    };
    // Order CA so ca1 → ca2 → ca3 align with CA1/CA2/CA3 weights
    const order = (t: string) => (t === "ca1" ? 0 : t === "ca2" ? 1 : t === "ca3" ? 2 : 3);
    [...ca].sort((a, b) => order(a.ca_type) - order(b.ca_type)).forEach((r) => {
      if (!r.term_id) return;
      ensure(r.student_id, r.term_id).caScoresPct.push(pct(Number(r.score), Number(r.max_score)));
    });
    exams.forEach((r) => {
      if (!r.exam?.term_id) return;
      ensure(r.student_id, r.exam.term_id).examScorePct = pct(Number(r.score), Number(r.exam.max_score));
    });
    return map;
  }, [ca, exams]);

  if (students.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground"><Inbox className="inline h-4 w-4 mr-2" />No students in this class.</div>;
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            {terms.map((t) => <TableHead key={t.id} className="capitalize">{t.name} term</TableHead>)}
            {showComputed && <TableHead>Cumulative</TableHead>}
            {showComputed && <TableHead>Grade</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((stu) => {
            const totals: Array<number | null> = terms.map((t) => {
              const inputs = byStudent.get(stu.id)?.get(t.id) ?? { caScoresPct: [], examScorePct: null };
              return computeTermTotal(settings, inputs);
            });
            const cum = computeCumulative(settings, totals);
            const gb = gradeFor(settings, cum);
            return (
              <TableRow key={stu.id}>
                <TableCell className="font-medium">{stu.full_name}</TableCell>
                {terms.map((t, i) => {
                  const inputs = byStudent.get(stu.id)?.get(t.id);
                  if (!showComputed) {
                    const parts = inputs?.caScoresPct?.map((p) => p.toFixed(0)) ?? [];
                    if (inputs?.examScorePct != null) parts.push(`E:${inputs.examScorePct.toFixed(0)}`);
                    return <TableCell key={t.id} className="text-xs text-muted-foreground">{parts.length ? parts.join(" / ") : "—"}</TableCell>;
                  }
                  return <TableCell key={t.id}>{totals[i] != null ? totals[i]!.toFixed(2) : "—"}</TableCell>;
                })}
                {showComputed && <TableCell className="font-semibold">{cum != null ? cum.toFixed(2) : "—"}</TableCell>}
                {showComputed && <TableCell>{gb ? <Badge>{gb.grade}</Badge> : "—"}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ============ REPORT CARDS ============ */

interface ReportCardRow {
  id: string;
  student_id: string;
  term_id: string;
  class_id: string | null;
  total_score: number | null;
  average: number | null;
  position: number | null;
  overall_grade: string | null;
  teacher_comment: string | null;
  principal_comment: string | null;
  published: boolean;
}

function ReportCardsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useSchoolSettings();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: terms } = useTerms();
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [editing, setEditing] = useState<{ studentId: string; teacher: string; principal: string } | null>(null);

  const subjectsForClass = useMemo(
    () => (subjects ?? []).filter((s) => !s.class_id || s.class_id === classId),
    [subjects, classId],
  );

  const studentsQ = useQuery({
    queryKey: ["report-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,full_name,class_id")
        .eq("class_id", classId)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const caQ = useQuery({
    queryKey: ["report-ca", classId, termId],
    enabled: !!classId && !!termId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("continuous_assessments")
        .select("student_id,subject_id,term_id,ca_type,score,max_score")
        .eq("class_id", classId)
        .eq("term_id", termId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const examQ = useQuery({
    queryKey: ["report-exam", classId, termId],
    enabled: !!classId && !!termId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("student_id,score,exam:exams!inner(class_id,subject_id,term_id,max_score)")
        .eq("exam.class_id", classId)
        .eq("exam.term_id", termId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const cardsQ = useQuery({
    queryKey: ["report-cards", classId, termId],
    enabled: !!classId && !!termId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_cards")
        .select("id,student_id,term_id,class_id,total_score,average,position,overall_grade,teacher_comment,principal_comment,published")
        .eq("class_id", classId)
        .eq("term_id", termId);
      if (error) throw error;
      return (data ?? []) as ReportCardRow[];
    },
  });

  const computed = useMemo(() => {
    if (!settings || !studentsQ.data) return [];
    const ca = caQ.data ?? [];
    const exams = examQ.data ?? [];
    const order = (t: string) => (t === "ca1" ? 0 : t === "ca2" ? 1 : t === "ca3" ? 2 : 3);
    const sortedCA = [...ca].sort((a: any, b: any) => order(a.ca_type) - order(b.ca_type));

    // student -> subject -> { caScoresPct[], examScorePct }
    const idx = new Map<string, Map<string, { caScoresPct: number[]; examScorePct: number | null }>>();
    const ensure = (sid: string, subj: string) => {
      let s = idx.get(sid);
      if (!s) { s = new Map(); idx.set(sid, s); }
      let t = s.get(subj);
      if (!t) { t = { caScoresPct: [], examScorePct: null }; s.set(subj, t); }
      return t;
    };
    sortedCA.forEach((r: any) => {
      ensure(r.student_id, r.subject_id).caScoresPct.push(pct(Number(r.score), Number(r.max_score)));
    });
    exams.forEach((r: any) => {
      if (!r.exam?.subject_id) return;
      ensure(r.student_id, r.exam.subject_id).examScorePct = pct(Number(r.score), Number(r.exam.max_score));
    });

    const rows = studentsQ.data.map((stu) => {
      const subjMap = idx.get(stu.id) ?? new Map();
      const subjectTotals: number[] = [];
      subjectsForClass.forEach((sub) => {
        const inputs = subjMap.get(sub.id);
        if (!inputs) return;
        const t = computeTermTotal(settings, inputs);
        if (t != null) subjectTotals.push(t);
      });
      const total = subjectTotals.reduce((a, b) => a + b, 0);
      const avg = subjectTotals.length ? total / subjectTotals.length : null;
      const grade = gradeFor(settings, avg)?.grade ?? null;
      return {
        student_id: stu.id,
        full_name: stu.full_name,
        subjects_counted: subjectTotals.length,
        total: subjectTotals.length ? Math.round(total * 100) / 100 : null,
        average: avg != null ? Math.round(avg * 100) / 100 : null,
        grade,
      };
    });

    // Position by average desc; null averages get no position
    const ranked = [...rows].filter((r) => r.average != null).sort((a, b) => (b.average! - a.average!));
    const posMap = new Map<string, number>();
    ranked.forEach((r, i) => posMap.set(r.student_id, i + 1));
    return rows.map((r) => ({ ...r, position: posMap.get(r.student_id) ?? null }));
  }, [settings, studentsQ.data, subjectsForClass, caQ.data, examQ.data]);

  const cardByStudent = useMemo(() => {
    const m = new Map<string, ReportCardRow>();
    (cardsQ.data ?? []).forEach((c) => m.set(c.student_id, c));
    return m;
  }, [cardsQ.data]);

  const generateAll = useMutation({
    mutationFn: async () => {
      if (!classId || !termId) throw new Error("Pick class and term");
      const termSession = terms?.find((t) => t.id === termId)?.session_id;
      if (!termSession) throw new Error("Could not determine academic session for the selected term.");
      const payload = computed
        .filter((r) => r.subjects_counted > 0)
        .map((r) => {
          const existing = cardByStudent.get(r.student_id);
          return {
            ...(existing?.id ? { id: existing.id } : {}),
            student_id: r.student_id,
            term_id: termId,
            class_id: classId,
            academic_session_id: termSession,
            total_score: r.total,
            average: r.average,
            position: r.position,
            overall_grade: r.grade,
            teacher_comment: existing?.teacher_comment ?? null,
            principal_comment: existing?.principal_comment ?? null,
            published: existing?.published ?? false,
          };
        });
      if (!payload.length) throw new Error("No students with recorded scores yet");
      const { error } = await supabase.from("report_cards").upsert(payload, { onConflict: "student_id,term_id" });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Saved ${n} report card${n === 1 ? "" : "s"}.`); qc.invalidateQueries({ queryKey: ["report-cards", classId, termId] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const setPublished = useMutation({
    mutationFn: async ({ ids, published }: { ids: string[]; published: boolean }) => {
      if (!ids.length) throw new Error("Generate report cards first");

      // 1. Update report_cards.published
      const { error } = await supabase.from("report_cards").update({ published }).in("id", ids);
      if (error) throw error;

      // 2. Also sync result_publications so the student/parent portal gate opens
      if (classId && termId) {
        const { data: termRow } = await supabase
          .from("terms")
          .select("session_id")
          .eq("id", termId)
          .maybeSingle();
        const sessionId = termRow?.session_id;
        if (sessionId) {
          if (published) {
            await supabase.rpc("publish_results", {
              _session_id: sessionId,
              _term_id: termId,
              _class_id: classId,
              _exam_type: "combined",
            });
          } else {
            await supabase.rpc("unpublish_results", {
              _session_id: sessionId,
              _term_id: termId,
              _class_id: classId,
              _exam_type: "combined",
            });
          }
        }
      }
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.published ? "Published to portal." : "Unpublished.");
      qc.invalidateQueries({ queryKey: ["report-cards", classId, termId] });
      // Invalidate the publication gate so student/parent portals refresh
      qc.invalidateQueries({ queryKey: ["result-published"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const saveComments = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const card = cardByStudent.get(editing.studentId);
      if (!card?.id) throw new Error("Generate the report card first");
      const { error } = await supabase
        .from("report_cards")
        .update({ teacher_comment: editing.teacher || null, principal_comment: editing.principal || null })
        .eq("id", card.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Comments saved."); setEditing(null); qc.invalidateQueries({ queryKey: ["report-cards", classId, termId] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const allCardIds = (cardsQ.data ?? []).map((c) => c.id);
  const loading = studentsQ.isLoading || caQ.isLoading || examQ.isLoading || cardsQ.isLoading;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <h3 className="font-semibold">Report cards</h3>
          <p className="text-xs text-muted-foreground">Aggregates CA + exam scores per term, then publishes to students and parents.</p>
        </div>
        <div className="flex-1" />
        <Field label="Class">
          <Select value={classId} onValueChange={(v) => setClassId(v)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Term">
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Select term" /></SelectTrigger>
            <SelectContent>{(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>

      {!classId || !termId ? (
        <div className="text-center text-sm text-muted-foreground py-10">Pick a class and term.</div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : (
        <>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => generateAll.mutate()} disabled={generateAll.isPending}>
                {generateAll.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Generate / refresh
              </Button>
              <Button variant="outline" onClick={() => setPublished.mutate({ ids: allCardIds, published: true })} disabled={!allCardIds.length || setPublished.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" />Publish all
              </Button>
              <Button variant="ghost" onClick={() => setPublished.mutate({ ids: allCardIds, published: false })} disabled={!allCardIds.length || setPublished.isPending}>
                Unpublish all
              </Button>
            </div>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Average</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Saved</TableHead>
                  <TableHead>Status</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.length === 0 ? (
                  <TableRow><TableCell colSpan={canEdit ? 9 : 8} className="text-center text-sm text-muted-foreground py-8"><Inbox className="inline h-4 w-4 mr-2" />No students.</TableCell></TableRow>
                ) : (
                  computed.map((r) => {
                    const card = cardByStudent.get(r.student_id);
                    return (
                      <TableRow key={r.student_id}>
                        <TableCell className="font-medium">{r.full_name}</TableCell>
                        <TableCell>{r.subjects_counted}</TableCell>
                        <TableCell>{r.total ?? "—"}</TableCell>
                        <TableCell>{r.average != null ? `${r.average}%` : "—"}</TableCell>
                        <TableCell>{r.grade ? <Badge>{r.grade}</Badge> : "—"}</TableCell>
                        <TableCell>{r.position != null ? `#${r.position}` : "—"}</TableCell>
                        <TableCell>{card ? <Badge variant="outline">Saved</Badge> : <span className="text-xs text-muted-foreground">Not saved</span>}</TableCell>
                        <TableCell>{card?.published ? <Badge>Published</Badge> : <Badge variant="secondary">Draft</Badge>}</TableCell>
                        {canEdit && (
                          <TableCell className="text-right space-x-1">
                            <Button size="sm" variant="ghost" disabled={!card} onClick={() => setEditing({ studentId: r.student_id, teacher: card?.teacher_comment ?? "", principal: card?.principal_comment ?? "" })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {card && (
                              <Button size="sm" variant={card.published ? "ghost" : "default"} onClick={() => setPublished.mutate({ ids: [card.id], published: !card.published })}>
                                {card.published ? "Unpublish" : "Publish"}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report card comments</DialogTitle>
            <DialogDescription>Comments appear on the published report card and PDF.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <Field label="Teacher comment">
                <Textarea rows={3} value={editing.teacher} onChange={(e) => setEditing({ ...editing, teacher: e.target.value })} />
              </Field>
              <Field label="Principal comment">
                <Textarea rows={3} value={editing.principal} onChange={(e) => setEditing({ ...editing, principal: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveComments.mutate()} disabled={saveComments.isPending}>{saveComments.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// =====================================================================
// Traits & skills tab
// =====================================================================

type Rating = "M" | "SP" | "P" | "NA";
const RATINGS: Rating[] = ["M", "SP", "P", "NA"];
const RATING_LABEL: Record<Rating, string> = {
  M: "Mastered",
  SP: "Strongly Progressing",
  P: "Progressing",
  NA: "Needs Attention",
};

interface TraitCategory { id: string; name: string; display_order: number }
interface TraitItem { id: string; category_id: string; label: string; display_order: number }
interface TraitItemWithCategory extends TraitItem { category: string }

function TraitsTab({ canEdit }: { canEdit: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const classesQ = useClasses();
  const termsQ = useTerms();

  const [classId, setClassId] = useState<string>("");
  const [termId, setTermId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, Rating>>({});
  const traitSessionId = useCurrentSessionId();

  // Default term to current
  if (!termId && termsQ.data?.length) {
    const cur = termsQ.data.find((t) => t.is_current) ?? termsQ.data[0];
    if (cur) setTimeout(() => setTermId(cur.id), 0);
  }

  const studentsQ = useQuery({
    queryKey: ["traits-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,full_name,class_id")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const categoriesQ = useQuery({
    queryKey: ["trait-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trait_categories")
        .select("id,name,display_order")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as TraitCategory[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["trait-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trait_items")
        .select("id,category_id,label,display_order")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as TraitItem[];
    },
  });

  // Default category to first
  if (!categoryId && categoriesQ.data?.length) {
    setTimeout(() => setCategoryId(categoriesQ.data![0].id), 0);
  }

  const itemsForCategory = useMemo<TraitItemWithCategory[]>(() => {
    if (!categoryId || !itemsQ.data || !categoriesQ.data) return [];
    const cat = categoriesQ.data.find((c) => c.id === categoryId);
    return itemsQ.data
      .filter((i) => i.category_id === categoryId)
      .map((i) => ({ ...i, category: cat?.name ?? "" }));
  }, [categoryId, itemsQ.data, categoriesQ.data]);

  const ratingsQ = useQuery({
    queryKey: ["trait-ratings", classId, termId],
    enabled: !!classId && !!termId,
    queryFn: async () => {
      const studentIds = (studentsQ.data ?? []).map((s) => s.id);
      if (studentIds.length === 0) return [];
      const { data, error } = await supabase
        .from("student_trait_ratings")
        .select("id,student_id,trait_item_id,rating")
        .eq("term_id", termId)
        .in("student_id", studentIds);
      if (error) throw error;
      return (data ?? []) as { id: string; student_id: string; trait_item_id: string; rating: Rating }[];
    },
  });

  // Reset draft when filters change
  const filterKey = `${classId}|${termId}|${categoryId}`;
  const [lastKey, setLastKey] = useState("");
  if (lastKey !== filterKey) {
    setTimeout(() => { setLastKey(filterKey); setDraft({}); }, 0);
  }

  const ratingMap = useMemo(() => {
    const map = new Map<string, Rating>();
    (ratingsQ.data ?? []).forEach((r) => {
      map.set(`${r.student_id}|${r.trait_item_id}`, r.rating);
    });
    return map;
  }, [ratingsQ.data]);

  const cellKey = (sid: string, iid: string) => `${sid}|${iid}`;
  const getRating = (sid: string, iid: string): Rating | undefined => {
    const k = cellKey(sid, iid);
    return draft[k] ?? ratingMap.get(k);
  };

  const setCell = (sid: string, iid: string, value: Rating) => {
    setDraft((d) => ({ ...d, [cellKey(sid, iid)]: value }));
  };

  const studentNameById = useMemo(() => {
    const m = new Map<string, string>();
    (studentsQ.data ?? []).forEach((s) => m.set(s.id, s.full_name));
    return m;
  }, [studentsQ.data]);

  const itemLabelById = useMemo(() => {
    const m = new Map<string, string>();
    (itemsQ.data ?? []).forEach((i) => m.set(i.id, i.label));
    return m;
  }, [itemsQ.data]);

  // Pending changes: only draft entries that differ from the saved rating.
  const pendingChanges = useMemo(() => {
    return Object.entries(draft)
      .filter(([k, rating]) => ratingMap.get(k) !== rating)
      .map(([k, rating]) => {
        const [student_id, trait_item_id] = k.split("|");
        return {
          key: k,
          student_id,
          trait_item_id,
          student: studentNameById.get(student_id) ?? "—",
          item: itemLabelById.get(trait_item_id) ?? "—",
          from: ratingMap.get(k) ?? null,
          to: rating,
        };
      })
      .sort((a, b) => a.student.localeCompare(b.student) || a.item.localeCompare(b.item));
  }, [draft, ratingMap, studentNameById, itemLabelById]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const save = useMutation({
    mutationFn: async () => {
      if (!termId) throw new Error("Pick a term first");
      const rows = pendingChanges.map((c) => ({
        student_id: c.student_id,
        trait_item_id: c.trait_item_id,
        term_id: termId,
        rating: c.to,
        recorded_by: user?.id ?? null,
        ...(traitSessionId ? { academic_session_id: traitSessionId } : {}),
      }));
      if (rows.length === 0) {
        setProgress({ done: 0, total: 0 });
        return { count: 0 };
      }
      const CHUNK = 100;
      setProgress({ done: 0, total: rows.length });
      let saved = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from("student_trait_ratings")
          .upsert(batch, { onConflict: "student_id,term_id,trait_item_id" });
        if (error) throw error;
        saved += batch.length;
        setProgress({ done: saved, total: rows.length });
      }
      return { count: saved };
    },
    onSuccess: ({ count }) => {
      toast.success(count ? `Saved ${count} rating${count === 1 ? "" : "s"}.` : "No changes to save.");
      setDraft({});
      setPreviewOpen(false);
      setProgress({ done: 0, total: 0 });
      qc.invalidateQueries({ queryKey: ["trait-ratings", classId, termId] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setProgress({ done: 0, total: 0 });
    },
  });

  const dirtyCount = pendingChanges.length;
  const students = studentsQ.data ?? [];
  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  // Inline validation: cells with no saved rating AND no draft rating, scoped to
  // the active class/term/category currently being edited.
  const missingCells = useMemo(() => {
    if (!classId || !termId || !categoryId) return [] as Array<{ sid: string; iid: string }>;
    const out: Array<{ sid: string; iid: string }> = [];
    students.forEach((s) => {
      itemsForCategory.forEach((it) => {
        const k = cellKey(s.id, it.id);
        if (!draft[k] && !ratingMap.get(k)) out.push({ sid: s.id, iid: it.id });
      });
    });
    return out;
  }, [students, itemsForCategory, draft, ratingMap, classId, termId, categoryId]);
  const missingSet = useMemo(
    () => new Set(missingCells.map((m) => cellKey(m.sid, m.iid))),
    [missingCells],
  );
  const totalCells = students.length * itemsForCategory.length;
  const missingCount = missingCells.length;
  const missingStudents = useMemo(() => {
    const ids = new Set(missingCells.map((m) => m.sid));
    return students.filter((s) => ids.has(s.id));
  }, [missingCells, students]);

  // ---- CSV import -------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  type ImportRow = {
    line: number;
    student: string;
    item: string;
    rating: string;
    student_id?: string;
    trait_item_id?: string;
    parsedRating?: Rating;
    error?: string;
  };
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const studentByName = useMemo(() => {
    const m = new Map<string, string>();
    students.forEach((s) => m.set(s.full_name.trim().toLowerCase(), s.id));
    return m;
  }, [students]);
  const itemByLabel = useMemo(() => {
    const m = new Map<string, string>();
    (itemsQ.data ?? []).forEach((i) => m.set((i.label as string).trim().toLowerCase(), i.id as string));
    return m;
  }, [itemsQ.data]);

  function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cell += ch; }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell); cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (cell.length || row.length) { row.push(cell); rows.push(row); }
        row = []; cell = "";
        if (ch === "\r" && text[i + 1] === "\n") i++;
      } else {
        cell += ch;
      }
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  function downloadCsvTemplate() {
    const sampleStudent = students[0]?.full_name ?? "Jane Doe";
    const sampleItem = (itemsQ.data ?? [])[0]?.label ?? "Punctuality";
    const csv =
      "student_name,item_label,rating\n" +
      `"${sampleStudent}","${sampleItem}",M\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trait-ratings-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- Export -----------------------------------------------------------
  const className = useMemo(
    () => (classesQ.data ?? []).find((c) => c.id === classId)?.name ?? "",
    [classesQ.data, classId],
  );
  const termName = useMemo(() => {
    const t = (termsQ.data ?? []).find((x) => x.id === termId);
    return t ? `${t.name}${t.is_current ? " (current)" : ""}` : "";
  }, [termsQ.data, termId]);

  function csvEscape(v: string) {
    if (v == null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    if (!classId || !termId) { toast.error("Pick a class and term first."); return; }
    if (!students.length) { toast.error("No students in this class."); return; }
    const cats = categoriesQ.data ?? [];
    const items = itemsQ.data ?? [];
    const itemCat = new Map(items.map((i) => [i.id, i.category_id]));
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const lines = ["student_name,category,item_label,rating"];
    students.forEach((s) => {
      items.forEach((i) => {
        const r = ratingMap.get(`${s.id}|${i.id}`);
        if (!r) return;
        lines.push([
          csvEscape(s.full_name),
          csvEscape(catName.get(itemCat.get(i.id) ?? "") ?? ""),
          csvEscape(i.label),
          r,
        ].join(","));
      });
    });
    if (lines.length === 1) { toast.error("No ratings to export."); return; }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trait-ratings-${className || "class"}-${termName || "term"}.csv`
      .replace(/[^a-z0-9-_.]+/gi, "_");
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${lines.length - 1} rating${lines.length - 1 === 1 ? "" : "s"}.`);
  }

  function exportPdf() {
    if (!classId || !termId) { toast.error("Pick a class and term first."); return; }
    if (!students.length) { toast.error("No students in this class."); return; }
    const cats = (categoriesQ.data ?? []).slice().sort((a, b) => a.display_order - b.display_order);
    const items = itemsQ.data ?? [];

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(14);
    doc.text("Trait Ratings", pageW / 2, 14, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Class: ${className || "—"}    Term: ${termName || "—"}`, pageW / 2, 20, { align: "center" });
    doc.setFontSize(8);
    doc.text(
      "M = Mastered • SP = Strongly Progressing • P = Progressing • NA = Needs Attention • — = Not rated",
      pageW / 2, 25, { align: "center" },
    );

    let startY = 30;
    let exported = 0;
    cats.forEach((cat) => {
      const catItems = items
        .filter((i) => i.category_id === cat.id)
        .sort((a, b) => a.display_order - b.display_order);
      if (!catItems.length) return;
      const head = [["Student", ...catItems.map((i) => i.label)]];
      const body = students.map((s) => [
        s.full_name,
        ...catItems.map((i) => {
          const r = ratingMap.get(`${s.id}|${i.id}`);
          if (r) exported++;
          return r ?? "—";
        }),
      ]);
      autoTable(doc, {
        startY,
        head,
        body,
        styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
        headStyles: { fillColor: [60, 60, 60], fontSize: 7 },
        columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
        margin: { left: 8, right: 8 },
        rowPageBreak: "avoid",
        didDrawPage: () => {
          doc.setFontSize(9);
          doc.text(cat.name, 8, startY - 2);
        },
      });
      // @ts-expect-error - lastAutoTable is added by jspdf-autotable
      startY = (doc.lastAutoTable?.finalY ?? startY) + 10;
      if (startY > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage();
        startY = 15;
      }
    });

    if (exported === 0) { toast.error("No ratings to export."); return; }
    doc.save(`trait-ratings-${className || "class"}-${termName || "term"}.pdf`
      .replace(/[^a-z0-9-_.]+/gi, "_"));
    toast.success(`Exported ${exported} rating${exported === 1 ? "" : "s"}.`);
  }


  async function handleCsvFile(file: File) {
    if (!classId || !termId) {
      toast.error("Pick a class and term first.");
      return;
    }
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { toast.error("CSV is empty."); return; }

    const header = rows[0].map((c) => c.trim().toLowerCase());
    const idxStudent = header.indexOf("student_name");
    const idxItem = header.indexOf("item_label");
    const idxRating = header.indexOf("rating");
    if (idxStudent < 0 || idxItem < 0 || idxRating < 0) {
      toast.error("CSV must have headers: student_name, item_label, rating");
      return;
    }

    const validRatings = new Set<Rating>(RATINGS);
    const parsed: ImportRow[] = rows.slice(1).map((r, i) => {
      const student = (r[idxStudent] ?? "").trim();
      const item = (r[idxItem] ?? "").trim();
      const ratingRaw = (r[idxRating] ?? "").trim().toUpperCase();
      const row: ImportRow = { line: i + 2, student, item, rating: ratingRaw };
      const sid = studentByName.get(student.toLowerCase());
      const iid = itemByLabel.get(item.toLowerCase());
      if (!student || !item || !ratingRaw) row.error = "Missing field";
      else if (!sid) row.error = "Student not in this class";
      else if (!iid) row.error = "Item not found";
      else if (!validRatings.has(ratingRaw as Rating)) row.error = `Rating must be ${RATINGS.join("/")}`;
      else { row.student_id = sid; row.trait_item_id = iid; row.parsedRating = ratingRaw as Rating; }
      return row;
    });

    setImportRows(parsed);
    setImportOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function applyImport() {
    const valid = importRows.filter((r) => !r.error && r.student_id && r.trait_item_id && r.parsedRating);
    if (valid.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }
    setDraft((d) => {
      const next = { ...d };
      valid.forEach((r) => {
        next[cellKey(r.student_id!, r.trait_item_id!)] = r.parsedRating!;
      });
      return next;
    });
    toast.success(`Loaded ${valid.length} rating${valid.length === 1 ? "" : "s"} into draft. Review and save.`);
    setImportOpen(false);
    setImportRows([]);
  }

  const importValidCount = importRows.filter((r) => !r.error).length;
  const importErrorCount = importRows.length - importValidCount;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-medium">Traits & skills</h3>
        <p className="text-xs text-muted-foreground">
          Rate each student per term. M = Mastered, SP = Strongly Progressing, P = Progressing, NA = Needs Attention.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Class">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {(classesQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Term">
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Select term" /></SelectTrigger>
            <SelectContent>
              {(termsQ.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}{t.is_current ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Category">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {(categoriesQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsvFile(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!classId || !termId || save.isPending}
              onClick={() => fileInputRef.current?.click()}
              title="Import ratings from CSV"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={downloadCsvTemplate}
              title="Download a sample CSV"
            >
              Template
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!classId || !termId}
              onClick={exportCsv}
              title="Export ratings as CSV"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!classId || !termId}
              onClick={exportPdf}
              title="Export ratings as PDF"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Export PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!dirtyCount || save.isPending}
              onClick={() => setDraft({})}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={!dirtyCount || save.isPending}
              onClick={() => setPreviewOpen(true)}
            >
              Preview &amp; save{dirtyCount ? ` (${dirtyCount})` : ""}
            </Button>
          </>
        )}
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={(o) => { if (!save.isPending) setPreviewOpen(o); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirm bulk save</DialogTitle>
            <DialogDescription>
              {dirtyCount === 0
                ? "No changes to save."
                : `You are about to update ${dirtyCount} rating${dirtyCount === 1 ? "" : "s"}. Ratings in other terms are not affected.`}
            </DialogDescription>
          </DialogHeader>

          {missingCount > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-amber-900 dark:text-amber-200">
                {missingCount} cell{missingCount === 1 ? "" : "s"} in this category will remain unrated after saving.
              </p>
            </div>
          )}

          {dirtyCount > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">From</TableHead>
                    <TableHead className="text-xs">To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingChanges.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="text-xs">{c.student}</TableCell>
                      <TableCell className="text-xs">{c.item}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.from ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{c.to}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {save.isPending && progress.total > 0 && (
            <div className="space-y-1.5">
              <Progress value={progressPct} />
              <p className="text-xs text-muted-foreground text-center">
                Saving {progress.done} of {progress.total}… ({progressPct}%)
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() => setPreviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!dirtyCount || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirm &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review CSV import</DialogTitle>
            <DialogDescription>
              {importRows.length === 0
                ? "No rows parsed."
                : `${importValidCount} valid · ${importErrorCount} skipped. Valid rows are loaded into your unsaved draft so you can preview and confirm before saving.`}
            </DialogDescription>
          </DialogHeader>
          {importRows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-12">Line</TableHead>
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">Rating</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.map((r, idx) => (
                    <TableRow key={idx} className={r.error ? "bg-destructive/5" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{r.line}</TableCell>
                      <TableCell className="text-xs">{r.student || "—"}</TableCell>
                      <TableCell className="text-xs">{r.item || "—"}</TableCell>
                      <TableCell className="text-xs">{r.rating || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.error ? (
                          <span className="text-destructive">{r.error}</span>
                        ) : (
                          <span className="text-emerald-600">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setImportOpen(false); setImportRows([]); }}>
              Cancel
            </Button>
            <Button size="sm" disabled={importValidCount === 0} onClick={applyImport}>
              Load {importValidCount} into draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!classId || !termId || !categoryId ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground text-center">
          Pick a class, term, and category to begin.
        </div>
      ) : studentsQ.isLoading || itemsQ.isLoading || ratingsQ.isLoading ? (
        <div className="p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div>
      ) : students.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground text-center">
          No active students in this class.
        </div>
      ) : itemsForCategory.length === 0 ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground text-center">
          No items in this category.
        </div>
      ) : (
        <>
          {missingCount > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {missingCount} of {totalCells} rating{missingCount === 1 ? "" : "s"} missing in this category
                </p>
                <p className="text-amber-800/80 dark:text-amber-200/80">
                  Highlighted cells below have no M/SP/P/NA rating yet. Affects{" "}
                  {missingStudents.length} student{missingStudents.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>
          )}
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Student</TableHead>
                  {itemsForCategory.map((it) => (
                    <TableHead key={it.id} className="min-w-[140px] text-xs whitespace-normal align-bottom">
                      {it.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="sticky left-0 bg-background font-medium z-10">{s.full_name}</TableCell>
                    {itemsForCategory.map((it) => {
                      const value = getRating(s.id, it.id);
                      const k = cellKey(s.id, it.id);
                      const dirty = k in draft;
                      const missing = missingSet.has(k);
                      return (
                        <TableCell
                          key={it.id}
                          className={
                            missing
                              ? "bg-amber-500/10"
                              : dirty
                              ? "bg-muted/40"
                              : ""
                          }
                        >
                          <Select
                            value={value ?? ""}
                            onValueChange={(v) => setCell(s.id, it.id, v as Rating)}
                            disabled={!canEdit}
                          >
                            <SelectTrigger
                              aria-invalid={missing || undefined}
                              className={`h-8 w-20 text-xs ${
                                missing ? "border-amber-500 text-amber-700 dark:text-amber-300" : ""
                              }`}
                            >
                              <SelectValue placeholder={missing ? "Missing" : "—"} />
                            </SelectTrigger>
                            <SelectContent>
                              {RATINGS.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {r} — {RATING_LABEL[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}

/* ============ SUBJECTS ============ */
interface SubjectFull {
  id: string;
  name: string;
  code: string | null;
  class_id: string | null;
  teacher_id: string | null;
}
interface TeacherOption { id: string; full_name: string; position: string }

function SubjectsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SubjectFull | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [confirmDel, setConfirmDel] = useState<SubjectFull | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["subjects-full"],
    queryFn: async () =>
      fetchAllPaged<SubjectFull>(() =>
        supabase
          .from("subjects")
          .select("id,name,code,class_id,teacher_id")
          .order("name") as unknown as {
            range: (from: number, to: number) => PromiseLike<{ data: SubjectFull[] | null; error: { message: string } | null }>;
          },
      ),
  });

  const { data: teachers } = useQuery({
    queryKey: ["subjects-teachers"],
    queryFn: async () =>
      fetchAllPaged<TeacherOption>(() =>
        supabase
          .from("staff")
          .select("id,full_name,position")
          .eq("status", "active")
          .order("full_name") as unknown as {
            range: (from: number, to: number) => PromiseLike<{ data: TeacherOption[] | null; error: { message: string } | null }>;
          },
      ),
  });

  const classMap = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c.name])), [classes]);
  const teacherMap = useMemo(() => new Map((teachers ?? []).map((t) => [t.id, t.full_name])), [teachers]);

  const filtered = (rows ?? []).filter((r) => {
    if (classFilter !== "all" && r.class_id !== classFilter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !(r.code ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, classFilter]);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  const del = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("subjects", id);
    },
    onSuccess: () => {
      toast.success("Subject deleted");
      qc.invalidateQueries({ queryKey: ["subjects-full"] });
      qc.invalidateQueries({ queryKey: ["academics-subjects"] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <Input placeholder="Search subjects…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Class" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canEdit && (
          <AcademicsToolbar
            title="Subjects"
            filename="subjects"
            rows={filtered}
            columns={[
              { header: "Subject", accessor: (r) => r.name },
              { header: "Code", accessor: (r) => r.code ?? "" },
              { header: "Class", accessor: (r) => r.class_id ? (classMap.get(r.class_id) ?? "") : "All classes" },
              { header: "Teacher", accessor: (r) => r.teacher_id ? (teacherMap.get(r.teacher_id) ?? "") : "Unassigned" },
            ]}
            canImport={canEdit}
            importHeaders={["name", "code", "class", "teacher"]}
            onImport={async (parsed) => {
              const classByName = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), c.id]));
              const teacherByName = new Map((teachers ?? []).map((t) => [t.full_name.toLowerCase(), t.id]));
              const payload = parsed
                .filter((r) => r.name)
                .map((r) => ({
                  name: r.name,
                  code: r.code || null,
                  class_id: r.class ? (classByName.get(r.class.toLowerCase()) ?? null) : null,
                  teacher_id: r.teacher ? (teacherByName.get(r.teacher.toLowerCase()) ?? null) : null,
                }));
              if (payload.length === 0) { toast.error("No valid rows. Need 'name' column."); return; }
              const { error } = await supabase.from("subjects").insert(payload);
              if (error) { toast.error(error.message); return; }
              toast.success(`Imported ${payload.length} subject(s).`);
              qc.invalidateQueries({ queryKey: ["subjects-full"] });
              qc.invalidateQueries({ queryKey: ["academics-subjects"] });
            }}
          />
        )}
        {canEdit && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New subject</Button></DialogTrigger>
            <SubjectDialog classes={classes ?? []} teachers={teachers ?? []} onClose={() => setOpenAdd(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["subjects-full"] }); qc.invalidateQueries({ queryKey: ["academics-subjects"] }); }} />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="py-10 flex items-center justify-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm"><Inbox className="h-6 w-6 mx-auto mb-2 opacity-50" />No subjects yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Teacher</TableHead>
                {canEdit && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.code ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{r.class_id ? (classMap.get(r.class_id) ?? "—") : <Badge variant="outline">All classes</Badge>}</TableCell>
                  <TableCell>
                    {r.teacher_id
                      ? (teacherMap.get(r.teacher_id) ?? <span className="text-muted-foreground italic">Unknown</span>)
                      : <Badge variant="outline">Unassigned</Badge>}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(r)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDel(r)} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        totalItems={filtered.length}
        start={start}
        end={end}
        onPageChange={setPage}
      />

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <SubjectDialog row={editing} classes={classes ?? []} teachers={teachers ?? []} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["subjects-full"] }); qc.invalidateQueries({ queryKey: ["academics-subjects"] }); }} />
        </Dialog>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subject?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{confirmDel?.name}</strong> and cascade to assignments, exams, lesson plans, timetable entries, and assessments tied to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && del.mutate(confirmDel.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SubjectDialog({ row, classes, teachers, onClose, onSaved }: {
  row?: SubjectFull; classes: ClassRow[]; teachers: TeacherOption[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!row;
  const [form, setForm] = useState({
    name: row?.name ?? "",
    code: row?.code ?? "",
    class_id: row?.class_id ?? "__none__",
    teacher_id: row?.teacher_id ?? "__none__",
    academic_session_id: (row as unknown as { academic_session_id?: string | null })?.academic_session_id ?? "",
  });
  const [coTeachers, setCoTeachers] = useState<Set<string>>(new Set());

  useQuery({
    queryKey: ["subject-teachers", row?.id],
    enabled: !!row?.id,
    queryFn: async () => {
      const { data } = await supabase.from("subject_teachers").select("staff_id").eq("subject_id", row!.id);
      setCoTeachers(new Set((data ?? []).map((r) => r.staff_id as string)));
      return data ?? [];
    },
  });

  async function syncJunction(subjectId: string, primary: string | null, extras: Set<string>) {
    const desired = new Set<string>(extras);
    if (primary) desired.add(primary);
    await supabase.from("subject_teachers").delete().eq("subject_id", subjectId);
    if (desired.size === 0) return;
    const rowsToInsert = Array.from(desired).map((sid) => ({
      subject_id: subjectId, staff_id: sid, is_primary: sid === primary,
    }));
    const { error } = await supabase.from("subject_teachers").insert(rowsToInsert);
    if (error) throw error;
  }

  const save = useMutation({
    mutationFn: async () => {
      const primary = form.teacher_id === "__none__" ? null : form.teacher_id;
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        class_id: form.class_id === "__none__" ? null : form.class_id,
        teacher_id: primary,
        academic_session_id: form.academic_session_id || null,
      };
      if (!payload.name) throw new Error("Name is required");
      let subjectId = row?.id;
      if (isEdit && row) {
        const { error } = await supabase.from("subjects").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("subjects").insert(payload).select("id").single();
        if (error) throw error;
        subjectId = data.id;
      }
      if (subjectId) await syncJunction(subjectId, primary, coTeachers);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Subject updated" : "Subject created");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit subject" : "New subject"}</DialogTitle>
        <DialogDescription>Assign a class scope and one or more teachers for this subject.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <SessionSelect value={form.academic_session_id} onChange={(v) => setForm({ ...form, academic_session_id: v })} />
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mathematics" />
        </Field>
        <Field label="Code">
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. MTH101" />
        </Field>
        <Field label="Class">
          <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
            <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Primary teacher">
          <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.full_name}{t.position ? ` — ${t.position}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Additional teachers">
          <div className="max-h-48 overflow-auto border rounded-md p-2 space-y-1">
            {teachers.length === 0 && <p className="text-xs text-muted-foreground">No teachers yet.</p>}
            {teachers.filter((t) => t.id !== form.teacher_id).map((t) => {
              const checked = coTeachers.has(t.id);
              return (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(coTeachers);
                      if (e.target.checked) next.add(t.id); else next.delete(t.id);
                      setCoTeachers(next);
                    }}
                  />
                  <span>{t.full_name}{t.position ? ` — ${t.position}` : ""}</span>
                </label>
              );
            })}
          </div>
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {isEdit ? "Save changes" : "Create subject"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

