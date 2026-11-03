import { compactMcq, normalizeMcqAnswer, optionEntries } from "@/lib/exam-answer";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichEditor } from "@/components/rich/RichEditor";
import { QuestionBuilderDialog } from "@/components/question-builder/QuestionBuilderDialog";
import { RichView } from "@/components/rich/RichView";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Pencil, Trash2, ListChecks, FileText, ClipboardCheck, ChevronLeft, ChevronRight, CalendarDays, GraduationCap, Eye, EyeOff, Library, FileUp, Copy, Save, MoreVertical, ChevronUp, ChevronDown, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  format, isSameMonth, isSameDay, parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";
import { SignedImage } from "@/lib/storage";
import { fetchAllPaged } from "@/lib/paginated-fetch";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";
import { downloadQuestionTemplate, type TemplateVariant } from "@/lib/question-templates";
import { ExamSubmissionStatus } from "@/components/exams/ExamSubmissionStatus";
import { ExamSubmissionDialog } from "@/components/exams/ExamSubmissionDialog";
import { ExamRejectionModal } from "@/components/exams/ExamRejectionModal";
import { ExamReviewManager } from "@/components/exams/ExamReviewManager";
import { ShieldCheck } from "lucide-react";
import { WordImportWizard, type WordImportPayload } from "@/components/exams/WordImportWizard";
import { CopyQuestionsDialog } from "@/components/exams/CopyQuestionsDialog";
import { SaveToBankDialog } from "@/components/exams/SaveToBankDialog";
import { parseContentJson, itemGradeableUnits, ansKey } from "@/components/question-builder/StudentQuestionView";
import type { BuilderItem, BuilderQuestion } from "@/components/question-builder/types";
import { softDelete } from "@/lib/soft-delete";
import { useSchoolSettings, gradeFor, type SchoolSettings } from "@/lib/scoring";

// Normalize question options which may be stored as string[] or as
// [{ text, label }] objects (from bulk imports).
function toOptionStrings(o: unknown): string[] {
  if (!Array.isArray(o)) return [];
  return o.map((it) => {
    if (typeof it === "string") return it;
    if (it && typeof it === "object") {
      const anyIt = it as { text?: unknown; label?: unknown; value?: unknown };
      if (typeof anyIt.text === "string") return anyIt.text;
      if (typeof anyIt.value === "string") return anyIt.value;
      if (typeof anyIt.label === "string") return anyIt.label;
      try { return JSON.stringify(it); } catch { return String(it); }
    }
    return String(it ?? "");
  });
}

export const Route = createFileRoute("/_authenticated/exams")({
  head: () => ({ meta: [
    { title: "Examinations — De-Bright Group of Schools" },
    { name: "description", content: "Manage examinations, question banks and student results at De-Bright Group of Schools." },
    { property: "og:title", content: "Examinations — De-Bright Group of Schools" },
    { property: "og:description", content: "Manage examinations, question banks and student results at De-Bright Group of Schools." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ExamsPage,
});

type ExamType = "cbt" | "written" | "practical" | "oral";
const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "written", label: "Written" },
  { value: "cbt", label: "CBT (Computer)" },
  { value: "practical", label: "Practical" },
  { value: "oral", label: "Oral" },
];

type ExamPurpose = "exam" | "ca1" | "ca2" | "ca3";
const EXAM_PURPOSES: { value: ExamPurpose; label: string }[] = [
  { value: "exam", label: "Exam" },
  { value: "ca1", label: "CA1" },
  { value: "ca2", label: "CA2" },
  { value: "ca3", label: "CA3" },
];
type QuestionSource = "manual" | "random";

type QuestionType = "mcq" | "fill_gap" | "theory" | "short_answer" | "drawing" | "coloring" | "chart";
const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "mcq", label: "Multi-choice" },
  { value: "fill_gap", label: "Fill in the gap" },
  { value: "theory", label: "Theory" },
  { value: "short_answer", label: "Short answer" },
  { value: "drawing", label: "Drawing (Nursery/Pre-school)" },
  { value: "coloring", label: "Coloring / Painting (Nursery/Pre-school)" },
  { value: "chart", label: "Chart / Picture (Nursery/Pre-school)" },
];

// Types that are visual/practical work for young learners — teacher-graded,
// no auto-marking, no expected text answer required.
const VISUAL_TYPES: QuestionType[] = ["drawing", "coloring", "chart"];

// Which question types make sense for each exam delivery mode.
// CBT is auto-graded, so it excludes open-ended theory. Written/Oral/Practical
// are teacher-graded, so they exclude MCQ (which needs machine marking).
// Visual (drawing/coloring/chart) types are allowed on written, practical, and oral.
function allowedTypesForExam(examType: ExamType): QuestionType[] {
  switch (examType) {
    case "cbt":
      return ["mcq", "fill_gap", "short_answer"];
    case "written":
      return ["theory", "short_answer", "fill_gap", "drawing", "coloring", "chart"];
    case "oral":
      return ["theory", "short_answer", "drawing", "coloring", "chart"];
    case "practical":
      return ["theory", "short_answer", "drawing", "coloring", "chart"];
    default:
      return ["mcq", "fill_gap", "theory", "short_answer", "drawing", "coloring", "chart"];
  }
}
function defaultTypeForExam(examType: ExamType): QuestionType {
  return allowedTypesForExam(examType)[0];
}


type ExamStatus = "draft" | "pending_review" | "published" | "closed";
interface ExamRow {
  id: string; title: string; type: ExamType;
  subject_id: string; class_id: string; term_id: string;
  exam_date: string | null; duration_minutes: number | null; max_score: number;
  published: boolean;
  status: ExamStatus;
  submitted_by?: string | null;
  purpose?: ExamPurpose | null;
  session_id?: string | null;
  academic_session_id?: string | null;
  question_source?: QuestionSource | null;
  num_questions?: number | null;
  opens_at?: string | null;
  closes_at?: string | null;
  release_offset_minutes?: number | null;
  time_zone?: string | null;
  is_mandatory?: boolean | null;
  allow_late_entry?: boolean | null;
  allow_resume?: boolean | null;
}


interface ClassRow { id: string; name: string }
interface SubjectRow { id: string; name: string; class_id: string | null }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string }
interface SessionRow { id: string; name: string; is_current: boolean }
interface ExamSectionRow {
  id: string;
  exam_id: string;
  title: string;
  instruction: string | null;
  section_order: number;
  created_at?: string;
  updated_at?: string;
}
interface QuestionRow {
  id: string; exam_id: string; question_text: string;
  section_id?: string | null;
  options: unknown; correct_answer: string; position: number | null; marks: number;
  question_type: QuestionType;
  section_label?: string | null;
  section_instruction?: string | null;
  section_order?: number | null;
  question_number?: number | null;
  media?: Array<{ type?: string; url: string; caption?: string; bucket?: string; path?: string }> | null;
  content_json?: any;
}


function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function ExamsPage() {
  const { isStaff, isAdmin, myClassIds, myAssignments, user } = useAuth();
  const { canAccess } = usePermissions();
  const canManageClass = (classId: string): boolean => isAdmin || myClassIds.includes(classId);
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<ExamRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<ExamRow | null>(null);
  const [questionsFor, setQuestionsFor] = useState<ExamRow | null>(null);
  const [gradingFor, setGradingFor] = useState<ExamRow | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [termFilter, setTermFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<ExamType | "all">("all");
  const [bulkDelOpen, setBulkDelOpen] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState<ExamRow | null>(null);
  const [retakeFor, setRetakeFor] = useState<ExamRow | null>(null);
  const [mixedImportOpen, setMixedImportOpen] = useState(false);
  const [copyFor, setCopyFor] = useState<ExamRow | null>(null);
  const [saveBankFor, setSaveBankFor] = useState<ExamRow | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["exams-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const { data: subjects } = useQuery({
    queryKey: ["exams-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name,class_id").order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["exams-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,is_current,session_id").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: sessions } = useQuery({
    queryKey: ["exams-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const { data: exams } = useQuery({
    queryKey: ["exams-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exams")
        .select("id,title,type,subject_id,class_id,term_id,exam_date,duration_minutes,max_score,published,status,submitted_by,purpose,session_id,question_source,num_questions,opens_at,closes_at,release_offset_minutes,time_zone,is_mandatory,allow_late_entry,allow_resume")
        .order("exam_date", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });
  // Per-exam attempt counts drive "locked" state (started/completed exams
  // can't be edited, unpublished, or have questions changed).
  const { data: attemptCounts } = useQuery({
    queryKey: ["exams-attempt-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exam_attempts").select("exam_id");
      if (error) throw error;
      const out: Record<string, number> = {};
      (data ?? []).forEach((a: { exam_id: string }) => { out[a.exam_id] = (out[a.exam_id] ?? 0) + 1; });
      return out;
    },
  });
  const isLocked = (e: ExamRow) => (attemptCounts?.[e.id] ?? 0) > 0;

  const { data: questionCounts } = useQuery({
    queryKey: ["exams-q-counts"],
    queryFn: async () => {
      const rows = await fetchAllPaged<{ exam_id: string }>(() =>
        supabase.from("questions").select("exam_id"),
      );
      const out: Record<string, number> = {};
      rows.forEach((q) => { out[q.exam_id] = (out[q.exam_id] ?? 0) + 1; });
      return out;
    },
  });
  // Bank questions grouped by class|subject|purpose so admins/teachers can see
  // teacher-contributed bank content as "available" for each exam even when
  // nothing has been attached directly.
  const { data: bankCounts } = useQuery({
    queryKey: ["exams-bank-counts"],
    queryFn: async () => {
      const rows = await fetchAllPaged<{ class_id: string | null; subject_id: string | null; purpose: string | null }>(() =>
        supabase.from("question_bank").select("class_id,subject_id,purpose"),
      );
      const out: Record<string, number> = {};
      rows.forEach((r) => {
        if (!r.class_id || !r.subject_id) return;
        const k = `${r.class_id}|${r.subject_id}|${r.purpose ?? "exam"}`;
        out[k] = (out[k] ?? 0) + 1;
      });
      return out;
    },
  });
  const effectiveQCount = (e: ExamRow): { attached: number; bank: number; total: number } => {
    const attached = questionCounts?.[e.id] ?? 0;
    const bank = bankCounts?.[`${e.class_id}|${e.subject_id}|${e.purpose ?? "exam"}`] ?? 0;
    return { attached, bank, total: attached + bank };
  };


  const remove = useMutation({
    mutationFn: async (id: string) => {
      // delete questions first to avoid FK issues
      await supabase.from("questions").delete().eq("exam_id", id);
      await softDelete("exams", id);
    },
    onSuccess: () => {
      toast.success("Exam deleted.");
      qc.invalidateQueries({ queryKey: ["exams-list"] });
      qc.invalidateQueries({ queryKey: ["exams-q-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Admins publish/unpublish. Trigger enforces role.
  const publish = useMutation({
    mutationFn: async (e: ExamRow) => {
      const { error } = await supabase.from("exams")
        .update({ status: "published", published: true }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exam approved & published — students can now see it.");
      qc.invalidateQueries({ queryKey: ["exams-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unpublish = useMutation({
    mutationFn: async (e: ExamRow) => {
      const { error } = await supabase.from("exams")
        .update({ status: "draft", published: false }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exam unpublished.");
      qc.invalidateQueries({ queryKey: ["exams-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // Teachers submit their draft for admin review.
  const submitForReview = useMutation({
    mutationFn: async (e: ExamRow) => {
      const { error } = await supabase.from("exams")
        .update({ status: "pending_review" }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submitted for admin review.");
      qc.invalidateQueries({ queryKey: ["exams-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendBackToDraft = useMutation({
    mutationFn: async (e: ExamRow) => {
      const { error } = await supabase.from("exams")
        .update({ status: "draft" }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sent back to draft.");
      qc.invalidateQueries({ queryKey: ["exams-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const classMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const subjMap = new Map((subjects ?? []).map((s) => [s.id, s.name]));
  const termMap = new Map((terms ?? []).map((t) => [t.id, t.name]));

  // Teachers can only create/edit exams for (class, subject) pairs they teach. Admins see all.
  const assignedClassIds = new Set(myAssignments.map((a) => a.class_id));
  const editableClasses = isAdmin ? (classes ?? []) : (classes ?? []).filter((c) => assignedClassIds.has(c.id));
  const canCreateExam = isAdmin || myAssignments.length > 0;

  const filtered = (exams ?? []).filter((e) =>
    (classFilter === "all" || e.class_id === classFilter) &&
    (termFilter === "all" || e.term_id === termFilter) &&
    (typeFilter === "all" || e.type === typeFilter)
  );

  const [page, setPage] = useState(1);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Exams &amp; CBT</h1>
        <p className="text-muted-foreground text-sm">Set up exams, schedule sittings, and build the CBT question bank.</p>
      </div>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Class">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termFilter} onValueChange={setTermFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terms</SelectItem>
                {(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ExamType | "all")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {EXAM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          {isStaff && canCreateExam && (
            <>
              <Button size="sm" variant="outline" onClick={() => setMixedImportOpen(true)}>
                <FileUp className="h-4 w-4 mr-1" />Import Word (mixed)
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkDelOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" />Bulk delete questions
              </Button>
              <Dialog open={openAdd} onOpenChange={setOpenAdd}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New exam</Button></DialogTrigger>
                <ExamDialog classes={editableClasses} subjects={subjects ?? []} terms={terms ?? []} sessions={sessions ?? []} userId={user?.id ?? null}
                  restrictPairs={isAdmin ? undefined : myAssignments}
                  onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["exams-list"] })} />
              </Dialog>
            </>
          )}
        </div>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list"><FileText className="h-3.5 w-3.5 mr-1" />List</TabsTrigger>
            <TabsTrigger value="calendar"><CalendarDays className="h-3.5 w-3.5 mr-1" />Calendar</TabsTrigger>
            <TabsTrigger value="bank"><Library className="h-3.5 w-3.5 mr-1" />Question Bank</TabsTrigger>
            {isStaff && <TabsTrigger value="review"><ShieldCheck className="h-3.5 w-3.5 mr-1 text-primary" />Exam Review</TabsTrigger>}
          </TabsList>
          <TabsContent value="list" className="mt-3">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Title</TableHead><TableHead>Type</TableHead>
                  <TableHead>Subject</TableHead><TableHead>Class</TableHead>
                  <TableHead>Term</TableHead><TableHead>Date</TableHead>
                  <TableHead className="text-center">Duration</TableHead>
                  <TableHead className="text-center">Max</TableHead>
                  <TableHead className="text-center">Q's</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {isStaff && <TableHead className="text-right">Actions</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={isStaff ? 11 : 10} className="text-center text-muted-foreground py-8">No exams scheduled.</TableCell></TableRow>
                  ) : pageItems.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>
                        <Badge variant={e.type === "cbt" ? "default" : "outline"} className="capitalize">{e.type}</Badge>
                      </TableCell>
                      <TableCell>{subjMap.get(e.subject_id) ?? "—"}</TableCell>
                      <TableCell>{classMap.get(e.class_id) ?? "—"}</TableCell>
                      <TableCell className="capitalize">{termMap.get(e.term_id) ?? "—"}</TableCell>
                      <TableCell>{e.exam_date ?? <span className="text-muted-foreground">Not set</span>}</TableCell>
                      <TableCell className="text-center">{e.duration_minutes ? `${e.duration_minutes}m` : "—"}</TableCell>
                      <TableCell className="text-center">{e.max_score}</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const c = effectiveQCount(e);
                          if (c.bank > 0) {
                            return (
                              <span title={`${c.attached} attached + ${c.bank} in bank`}>
                                {c.attached}
                                <span className="text-muted-foreground"> (+{c.bank})</span>
                              </span>
                            );
                          }
                          return c.attached;
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const status = e.status ?? (e.published ? "published" : "draft");
                          if (status === "published")
                            return <Badge variant="default" className="gap-1"><Eye className="h-3 w-3" />Published</Badge>;
                          if (status === "pending_review")
                            return <Badge variant="outline" className="gap-1">Pending review</Badge>;
                          if (status === "closed")
                            return <Badge variant="secondary" className="gap-1">Closed</Badge>;
                          return <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" />Draft</Badge>;
                        })()}
                        {isLocked(e) && (
                          <div className="text-[10px] text-muted-foreground mt-1">Locked · {attemptCounts?.[e.id]} attempt(s)</div>
                        )}
                      </TableCell>
                      {isStaff && (
                        <TableCell className="text-right">
                          {canManageClass(e.class_id) ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setQuestionsFor(e)} title={isLocked(e) ? "Locked — view only" : "Manage questions"}>
                                <ListChecks className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setGradingFor(e)} title="Grade & publish results">
                                <GraduationCap className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCopyFor(e)} title="Copy questions to another class">
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setSaveBankFor(e)} title="Save questions to the Question Bank">
                                <Save className="h-3.5 w-3.5" />
                              </Button>
                              {/* Status-driven actions */}
                              {(() => {
                                const status = e.status ?? (e.published ? "published" : "draft");
                                const locked = isLocked(e);
                                if (locked) {
                                  return (
                                    <span className="text-[10px] text-muted-foreground italic mr-2" title="Students have started this exam">
                                      Locked
                                    </span>
                                  );
                                }
                                if (status === "draft" && !isAdmin) {
                                  return (
                                    <Button size="sm" variant="default"
                                      onClick={() => {
                                        const c = effectiveQCount(e);
                                        if (c.total === 0) {
                                          toast.error("Add questions before submitting for review.");
                                          return;
                                        }
                                        submitForReview.mutate(e);
                                      }}
                                      disabled={submitForReview.isPending}
                                      title="Submit for admin review">
                                      Submit for review
                                    </Button>
                                  );
                                }
                                if (status === "pending_review" && !isAdmin) {
                                  return (
                                    <Button size="sm" variant="outline"
                                      onClick={() => sendBackToDraft.mutate(e)}
                                      disabled={sendBackToDraft.isPending}
                                      title="Withdraw submission">
                                      Withdraw
                                    </Button>
                                  );
                                }
                                if (isAdmin) {
                                  if (status === "published") {
                                    return (
                                      <Button size="sm" variant="outline"
                                        onClick={() => setConfirmPublish(e)}
                                        disabled={unpublish.isPending}
                                        title="Unpublish (hide from students)">
                                        <EyeOff className="h-3.5 w-3.5 mr-1" />Unpublish
                                      </Button>
                                    );
                                  }
                                  return (
                                    <>
                                      <Button size="sm" variant="default"
                                        onClick={async () => {
                                          const c = effectiveQCount(e);
                                          if (c.total === 0) {
                                            // Fallback: verify with live count queries in case cached
                                            // aggregates are stale or were truncated.
                                            const [aRes, bRes] = await Promise.all([
                                              supabase.from("questions").select("id", { count: "exact", head: true }).eq("exam_id", e.id),
                                              supabase.from("question_bank").select("id", { count: "exact", head: true })
                                                .eq("class_id", e.class_id).eq("subject_id", e.subject_id)
                                                .eq("purpose", e.purpose ?? "exam"),
                                            ]);
                                            const live = (aRes.count ?? 0) + (bRes.count ?? 0);
                                            if (live === 0) {
                                              toast.error("Cannot publish: no questions attached and none in the bank for this class/subject.");
                                              return;
                                            }
                                            qc.invalidateQueries({ queryKey: ["exams-q-counts"] });
                                            qc.invalidateQueries({ queryKey: ["exams-bank-counts"] });
                                          }
                                          setConfirmPublish(e);
                                        }}
                                        disabled={publish.isPending}
                                        title={status === "pending_review" ? "Approve & publish" : "Publish"}>
                                        <Eye className="h-3.5 w-3.5 mr-1" />{status === "pending_review" ? "Approve & publish" : "Publish"}
                                      </Button>
                                      {status === "pending_review" && (
                                        <Button size="sm" variant="ghost"
                                          onClick={() => sendBackToDraft.mutate(e)}
                                          disabled={sendBackToDraft.isPending}
                                          title="Send back to draft">
                                          Send back
                                        </Button>
                                      )}
                                    </>
                                  );
                                }
                                return null;
                              })()}

                              {isAdmin && e.type === "cbt" && (
                                <Button size="sm" variant="ghost" onClick={() => setRetakeFor(e)} title="Set up retake">
                                  <ClipboardCheck className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost"
                                onClick={() => {
                                  if (isLocked(e)) {
                                    toast.error("Exam is locked — students have already started or completed it.");
                                    return;
                                  }
                                  setEditing(e);
                                }}
                                disabled={isLocked(e)}
                                title={isLocked(e) ? "Locked" : "Edit"}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive"
                                onClick={() => {
                                  if (isLocked(e)) {
                                    toast.error("Cannot delete — students have taken this exam.");
                                    return;
                                  }
                                  setConfirmDel(e);
                                }}
                                disabled={isLocked(e)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Other class</span>
                          )}
                        </TableCell>
                      )}

                    </TableRow>
                  ))}
                </TableBody>
               </Table>
             </div>
             <PaginationBar
               page={safePage}
               totalPages={totalPages}
               totalItems={filtered.length}
               start={start}
               end={end}
               onPageChange={setPage}
             />
           </TabsContent>
          <TabsContent value="calendar" className="mt-3">
            <ExamCalendar
              exams={filtered}
              subjMap={subjMap}
              classMap={classMap}
              onSelect={(exam: ExamRow) => {
                if (isStaff && canManageClass(exam.class_id)) setEditing(exam);
              }}
              isStaff={isStaff}
            />
          </TabsContent>
          <TabsContent value="bank" className="mt-3">
            <QuestionBankPanel
              classes={editableClasses}
              subjects={subjects ?? []}
              userId={user?.id ?? null}
              isStaff={isStaff}
              canManageClass={canManageClass}
              restrictPairs={isAdmin ? undefined : myAssignments}
            />
          </TabsContent>
          {isStaff && (
            <TabsContent value="review" className="mt-3">
              <ExamReviewManager />
            </TabsContent>
          )}
        </Tabs>
      </Card>

      {editing && (
        <ExamDialog row={editing} classes={editableClasses} subjects={subjects ?? []} terms={terms ?? []} sessions={sessions ?? []} userId={user?.id ?? null}
          restrictPairs={isAdmin ? undefined : myAssignments}
          onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["exams-list"] })} />
      )}

      {questionsFor && (
        <QuestionsDialog exam={questionsFor} onClose={() => setQuestionsFor(null)} />
      )}

      {copyFor && (
        <CopyQuestionsDialog exam={copyFor} onClose={() => setCopyFor(null)} />
      )}

      {saveBankFor && (
        <SaveToBankDialog exam={saveBankFor} onClose={() => setSaveBankFor(null)} />
      )}

      {bulkDelOpen && (
        <BulkDeleteQuestionsDialog
          classes={editableClasses}
          subjects={subjects ?? []}
          terms={terms ?? []}
          sessions={sessions ?? []}
          onClose={() => setBulkDelOpen(false)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["exam-questions"] });
            qc.invalidateQueries({ queryKey: ["exams-q-counts"] });
          }}
        />
      )}

      {mixedImportOpen && (
        <MixedExamImportDialog
          classes={editableClasses}
          subjects={subjects ?? []}
          terms={terms ?? []}
          sessions={sessions ?? []}
          userId={user?.id ?? null}
          restrictPairs={isAdmin ? undefined : myAssignments}
          onClose={() => setMixedImportOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["exams-list"] });
            qc.invalidateQueries({ queryKey: ["exams-q-counts"] });
          }}
        />
      )}

      {gradingFor && (
        <GradeDialog
          exam={gradingFor}
          userId={user?.id ?? null}
          onClose={() => setGradingFor(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["exams-list"] })}
        />
      )}

      {retakeFor && (
        <RetakeDialog
          exam={retakeFor}
          onClose={() => setRetakeFor(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["exams-list"] });
            qc.invalidateQueries({ queryKey: ["grade-results"] });
            qc.invalidateQueries({ queryKey: ["grade-attempts"] });
          }}
        />
      )}

      <AlertDialog open={!!confirmPublish} onOpenChange={(o) => !o && setConfirmPublish(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmPublish?.status === "published" ? "Unpublish exam?" : "Approve & publish exam?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPublish?.status === "published"
                ? `"${confirmPublish?.title}" will be hidden from students.`
                : `"${confirmPublish?.title}" will become visible to students in ${classMap.get(confirmPublish?.class_id ?? "") ?? "the assigned class"}${confirmPublish?.type === "cbt" ? ` (${questionCounts?.[confirmPublish?.id ?? ""] ?? 0} question${(questionCounts?.[confirmPublish?.id ?? ""] ?? 0) === 1 ? "" : "s"})` : ""}. Once any student starts, the exam becomes read-only.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmPublish) return;
                if (confirmPublish.status === "published") unpublish.mutate(confirmPublish);
                else publish.mutate(confirmPublish);
                setConfirmPublish(null);
              }}
            >
              {confirmPublish?.status === "published" ? "Unpublish" : "Approve & publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exam?</AlertDialogTitle>
            <AlertDialogDescription>"{confirmDel?.title}" and all its questions will be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ExamDialog({ row, classes, subjects, terms, sessions, userId, restrictPairs, onClose, onSaved }: {
  row?: ExamRow; classes: ClassRow[]; subjects: SubjectRow[]; terms: TermRow[]; sessions: SessionRow[];
  userId: string | null; restrictPairs?: Array<{ class_id: string; subject_id: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!row;
  const currentTerm = terms.find((t) => t.is_current);
  const currentSession = sessions.find((s) => s.is_current);
  const toLocalTime = (iso: string | null | undefined): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [form, setForm] = useState({
    title: row?.title ?? "",
    type: (row?.type ?? "written") as ExamType,
    class_id: row?.class_id ?? "",
    subject_id: row?.subject_id ?? "",
    term_id: row?.term_id ?? currentTerm?.id ?? "",
    session_id: row?.session_id ?? currentTerm?.session_id ?? currentSession?.id ?? "",
    exam_date: row?.exam_date ?? "",
    duration_minutes: row?.duration_minutes?.toString() ?? "60",
    max_score: row?.max_score?.toString() ?? "100",
    purpose: (row?.purpose ?? "exam") as ExamPurpose,
    question_source: (row?.question_source ?? "manual") as QuestionSource,
    num_questions: row?.num_questions?.toString() ?? "20",
    start_time: toLocalTime(row?.opens_at) || "09:00",
    end_time: toLocalTime(row?.closes_at) || "",
    time_zone: row?.time_zone ?? "Africa/Lagos",
    release_offset_minutes: (row?.release_offset_minutes ?? 5).toString(),
    is_mandatory: row?.is_mandatory ?? true,
    allow_late_entry: row?.allow_late_entry ?? false,
    allow_resume: row?.allow_resume ?? true,
  });


  const allowedSubjectIdsByClass = useMemo(() => {
    if (!restrictPairs) return null;
    const m = new Map<string, Set<string>>();
    restrictPairs.forEach((p) => {
      if (!m.has(p.class_id)) m.set(p.class_id, new Set());
      m.get(p.class_id)!.add(p.subject_id);
    });
    return m;
  }, [restrictPairs]);

  const subjectOptions = useMemo(() => {
    let list = form.class_id ? subjects.filter((s) => s.class_id === form.class_id) : subjects;
    if (allowedSubjectIdsByClass && form.class_id) {
      const allowed = allowedSubjectIdsByClass.get(form.class_id) ?? new Set<string>();
      list = list.filter((s) => allowed.has(s.id));
    }
    return list;
  }, [subjects, form.class_id, allowedSubjectIdsByClass]);

  

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.class_id) throw new Error("Class is required.");
      if (!form.subject_id) throw new Error("Subject is required.");
      if (!form.term_id) throw new Error("Term is required.");
      if (!form.session_id) throw new Error("Academic session is required.");
      if (form.question_source === "random") {
        const n = Number(form.num_questions);
        if (!Number.isFinite(n) || n < 1) throw new Error("Number of questions must be at least 1.");
      }
      // Compose opens_at / closes_at timestamps from date + times.
      let opens_at: string | null = null;
      let closes_at: string | null = null;
      const durMin = form.duration_minutes ? Number(form.duration_minutes) : null;
      if (form.exam_date && form.start_time) {
        const isoStart = new Date(`${form.exam_date}T${form.start_time}:00`);
        if (!isNaN(isoStart.getTime())) opens_at = isoStart.toISOString();
        if (form.end_time) {
          const isoEnd = new Date(`${form.exam_date}T${form.end_time}:00`);
          if (!isNaN(isoEnd.getTime())) {
            if (isoEnd.getTime() <= isoStart.getTime())
              throw new Error("End time must be after start time.");
            closes_at = isoEnd.toISOString();
          }
        } else if (durMin && durMin > 0) {
          closes_at = new Date(isoStart.getTime() + durMin * 60_000).toISOString();
        }
      }
      const release = Number(form.release_offset_minutes);
      if (!Number.isFinite(release) || release < 0) throw new Error("Release offset must be zero or greater.");
      const payload = {
        title: form.title.trim(),
        type: form.type,
        class_id: form.class_id,
        subject_id: form.subject_id,
        term_id: form.term_id,
        session_id: form.session_id,
        academic_session_id: form.session_id,
        exam_date: form.exam_date || null,
        duration_minutes: durMin,
        max_score: Number(form.max_score) || 100,
        purpose: form.purpose,
        question_source: form.question_source,
        num_questions: form.num_questions ? Number(form.num_questions) : null,
        opens_at,
        closes_at,
        time_zone: form.time_zone || "Africa/Lagos",
        release_offset_minutes: release,
        is_mandatory: form.is_mandatory,
        allow_late_entry: form.allow_late_entry,
        allow_resume: form.allow_resume,
      };

      if (isEdit && row) {
        const { error } = await supabase.from("exams").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exams").insert({ ...payload, created_by: userId });
        if (error) throw error;
      }

    },
    onSuccess: () => { toast.success(isEdit ? "Exam updated." : "Exam created."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dlg = (
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit exam" : "Schedule new exam"}</DialogTitle>
        <DialogDescription>Configure the exam, sitting date, duration and total marks.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Field label="Title" required>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Mathematics — Mid-term" maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" required>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ExamType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EXAM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Purpose" required>
            <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v as ExamPurpose })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EXAM_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Term" required>
            <Select value={form.term_id} onValueChange={(v) => {
              const t = terms.find((x) => x.id === v);
              setForm({ ...form, term_id: v, session_id: t?.session_id ?? form.session_id });
            }}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Session / Year">
            <Select value={form.session_id} onValueChange={(v) => setForm({ ...form, session_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class" required>
            <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v, subject_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subject" required>
            <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>{subjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Exam date">
            <Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} />
          </Field>
          <Field label="Duration (min)">
            <Input type="number" min={1} value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
          </Field>
          <Field label="Max score" required>
            <Input type="number" min={1} value={form.max_score}
              onChange={(e) => setForm({ ...form, max_score: e.target.value })} />
          </Field>
        </div>
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <p className="text-xs font-medium">Schedule &amp; release</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start time" required>
              <Input type="time" value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="End time">
              <Input type="time" value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </Field>
            <Field label="Time zone">
              <Input value={form.time_zone}
                onChange={(e) => setForm({ ...form, time_zone: e.target.value })}
                placeholder="Africa/Lagos" />
            </Field>
          </div>
          <Field label="Release visibility (minutes before start)">
            <Input type="number" min={0} max={240} value={form.release_offset_minutes}
              onChange={(e) => setForm({ ...form, release_offset_minutes: e.target.value })} />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            Students see the exam only from this many minutes before Start Time until End Time.
          </p>
          <div className="grid grid-cols-1 gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.is_mandatory}
                onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} />
              Mandatory examination
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.allow_late_entry}
                onChange={(e) => setForm({ ...form, allow_late_entry: e.target.checked })} />
              Allow late entry (students may start after Start Time, up to End Time)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.allow_resume}
                onChange={(e) => setForm({ ...form, allow_resume: e.target.checked })} />
              Allow resume after disconnection
            </label>
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <p className="text-xs font-medium">Question setup</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Question source" required>
              <Select value={form.question_source} onValueChange={(v) => setForm({ ...form, question_source: v as QuestionSource })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Teacher uploads / enters questions</SelectItem>
                  <SelectItem value="random">Random from question bank + past exams</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Number of questions">
              <Input type="number" min={1} value={form.num_questions}
                onChange={(e) => setForm({ ...form, num_questions: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {form.question_source === "random"
              ? "Random mode draws N unique questions from the question bank AND previously authored exam questions for this class, subject, and purpose."
              : "Manual mode: add or upload questions after creating the exam."}
          </p>
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

/* ============= QUESTIONS ============= */
/* ============= SECTIONS & QUESTIONS STRUCTURE EDITOR ============= */
function SectionDialog({
  section,
  examId,
  nextOrder,
  onClose,
  onSaved,
}: {
  section?: ExamSectionRow | null;
  examId: string;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(section?.title ?? "");
  const [instruction, setInstruction] = useState(section?.instruction ?? "");

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Section title is required.");
      if (section) {
        const { error } = await supabase
          .from("exam_sections")
          .update({ title: title.trim(), instruction: instruction.trim() || null })
          .eq("id", section.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("exam_sections").insert({
          exam_id: examId,
          title: title.trim(),
          instruction: instruction.trim() || null,
          section_order: nextOrder,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(section ? "Section updated." : "Section created.");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{section ? "Edit Section" : "Add Section"}</DialogTitle>
          <DialogDescription>
            Create or edit a section (e.g. SECTION A, SECTION B) with optional instructions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="Section Name" required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SECTION A"
            />
          </Field>
          <Field label="Section Instruction">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Answer all questions in this section."
              rows={3}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save Section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveToSectionDialog({
  question,
  sections,
  onClose,
  onMoved,
}: {
  question: QuestionRow;
  sections: ExamSectionRow[];
  onClose: () => void;
  onMoved: () => void;
}) {
  const [selectedSecId, setSelectedSecId] = useState<string>(question.section_id ?? "none");

  const move = useMutation({
    mutationFn: async () => {
      const targetId = selectedSecId === "none" ? null : selectedSecId;
      const { error } = await supabase
        .from("questions")
        .update({ section_id: targetId })
        .eq("id", question.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Question moved.");
      onMoved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move Question to Section</DialogTitle>
          <DialogDescription>
            Select the destination section for this question.
          </DialogDescription>
        </DialogHeader>
        <div className="py-3">
          <Select value={selectedSecId} onValueChange={setSelectedSecId}>
            <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">General / Unsectioned</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={move.isPending}>Cancel</Button>
          <Button onClick={() => move.mutate()} disabled={move.isPending}>
            {move.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSectionDialog({
  section,
  questionCount,
  onClose,
  onDeleted,
}: {
  section: ExamSectionRow;
  questionCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const delSectionWithQuestions = useMutation({
    mutationFn: async () => {
      if (questionCount > 0) {
        const { error: qErr } = await supabase
          .from("questions")
          .update({ deleted_at: new Date().toISOString(), delete_reason: "Parent section deleted" })
          .eq("section_id", section.id);
        if (qErr) throw qErr;
      }
      const { error: sErr } = await supabase
        .from("exam_sections")
        .delete()
        .eq("id", section.id);
      if (sErr) throw sErr;
    },
    onSuccess: () => {
      toast.success("Section and questions deleted.");
      onDeleted();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delSectionOnly = useMutation({
    mutationFn: async () => {
      if (questionCount > 0) {
        const { error: qErr } = await supabase
          .from("questions")
          .update({ section_id: null })
          .eq("section_id", section.id);
        if (qErr) throw qErr;
      }
      const { error: sErr } = await supabase
        .from("exam_sections")
        .delete()
        .eq("id", section.id);
      if (sErr) throw sErr;
    },
    onSuccess: () => {
      toast.success("Section removed (questions kept in unsectioned).");
      onDeleted();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPending = delSectionWithQuestions.isPending || delSectionOnly.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {section.title}?</DialogTitle>
          <DialogDescription>
            {questionCount > 0
              ? `This section contains ${questionCount} question${questionCount === 1 ? "" : "s"}. What would you like to do?`
              : "Are you sure you want to delete this section? This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          {questionCount > 0 && (
            <Button variant="secondary" onClick={() => delSectionOnly.mutate()} disabled={isPending}>
              Move Questions & Delete Section
            </Button>
          )}
          <Button variant="destructive" onClick={() => delSectionWithQuestions.mutate()} disabled={isPending}>
            Delete Section & Questions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionsDialog({ exam, onClose }: { exam: ExamRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [editingQ, setEditingQ] = useState<QuestionRow | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [openSectionModal, setOpenSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState<ExamSectionRow | null>(null);
  const [delSection, setDelSection] = useState<ExamSectionRow | null>(null);
  const [moveQ, setMoveQ] = useState<QuestionRow | null>(null);
  const [openAddQ, setOpenAddQ] = useState(false);
  const [openBuilder, setOpenBuilder] = useState(false);
  const [builderEdit, setBuilderEdit] = useState<QuestionRow | null>(null);
  const [openUploadQ, setOpenUploadQ] = useState(false);
  const [openSelectBank, setOpenSelectBank] = useState(false);
  const [confirmDelQ, setConfirmDelQ] = useState<QuestionRow | null>(null);

  // 1. Fetch Exam Sections
  const { data: rawSections = [] } = useQuery({
    queryKey: ["exam-sections", exam.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_sections")
        .select("*")
        .eq("exam_id", exam.id)
        .order("section_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExamSectionRow[];
    },
  });

  // 2. Fetch Exam Questions
  const { data: questions = [] } = useQuery({
    queryKey: ["exam-questions", exam.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id,exam_id,section_id,question_text,options,correct_answer,position,marks,question_type,section_label,section_instruction,section_order,question_number,media,content_json,deleted_at")
        .eq("exam_id", exam.id)
        .is("deleted_at", null)
        .order("position", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as QuestionRow[];
    },
  });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ["exam-sections", exam.id] });
    qc.invalidateQueries({ queryKey: ["exam-questions", exam.id] });
    qc.invalidateQueries({ queryKey: ["exams-q-counts"] });
  };

  const sections = useMemo(() => {
    return [...rawSections].sort((a, b) => a.section_order - b.section_order);
  }, [rawSections]);

  const questionsBySection = useMemo(() => {
    const map = new Map<string, QuestionRow[]>();
    sections.forEach((s) => map.set(s.id, []));
    const unsectioned: QuestionRow[] = [];

    questions.forEach((q) => {
      if (q.section_id && map.has(q.section_id)) {
        map.get(q.section_id)!.push(q);
      } else {
        unsectioned.push(q);
      }
    });

    return { map, unsectioned };
  }, [sections, questions]);

  const { globalQuestionNumMap, totalMarks } = useMemo(() => {
    let currentNo = 1;
    let sumMarks = 0;
    const numMap = new Map<string, number>();

    sections.forEach((sec) => {
      const secQs = questionsBySection.map.get(sec.id) ?? [];
      secQs.forEach((q) => {
        numMap.set(q.id, currentNo++);
        sumMarks += Number(q.marks) || 1;
      });
    });

    questionsBySection.unsectioned.forEach((q) => {
      numMap.set(q.id, currentNo++);
      sumMarks += Number(q.marks) || 1;
    });

    return { globalQuestionNumMap: numMap, totalMarks: sumMarks };
  }, [sections, questionsBySection]);

  const removeQ = useMutation({
    mutationFn: async (id: string) => {
      try {
        await softDelete("questions", id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("recycle bin")) {
          const { error } = await supabase.from("questions").delete().eq("id", id);
          if (error) throw error;
        } else {
          throw err;
        }
      }
    },
    onSuccess: () => {
      toast.success("Question deleted.");
      refetchAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateSection = useMutation({
    mutationFn: async (sec: ExamSectionRow) => {
      const { data: newSec, error: sErr } = await supabase
        .from("exam_sections")
        .insert({
          exam_id: exam.id,
          title: `${sec.title} (Copy)`,
          instruction: sec.instruction,
          section_order: sections.length + 1,
        })
        .select()
        .single();
      if (sErr) throw sErr;

      const secQs = questionsBySection.map.get(sec.id) ?? [];
      if (secQs.length > 0) {
        const payload = secQs.map((q, idx) => ({
          exam_id: exam.id,
          section_id: newSec.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options as any,
          correct_answer: q.correct_answer,
          marks: q.marks,
          media: q.media as any,
          content_json: q.content_json,
          position: (questions.length) + idx + 1,
        }));
        const { error: qErr } = await supabase.from("questions").insert(payload);
        if (qErr) throw qErr;
      }
    },
    onSuccess: () => {
      toast.success("Section duplicated.");
      refetchAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveSectionOrder = useMutation({
    mutationFn: async ({ sec, direction }: { sec: ExamSectionRow; direction: "up" | "down" }) => {
      const idx = sections.findIndex((s) => s.id === sec.id);
      if (idx < 0) return;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sections.length) return;
      const otherSec = sections[targetIdx];

      await Promise.all([
        supabase.from("exam_sections").update({ section_order: otherSec.section_order }).eq("id", sec.id),
        supabase.from("exam_sections").update({ section_order: sec.section_order }).eq("id", otherSec.id),
      ]);
    },
    onSuccess: () => refetchAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: bankMatches } = useQuery({
    queryKey: ["exam-bank-matches", exam.class_id, exam.subject_id, exam.purpose ?? "exam"],
    queryFn: async () => {
      const { data, error } = await supabase.from("question_bank")
        .select("id,question_text,options,correct_answer,marks,question_type,section_label,section_instruction,section_order,question_number,media")
        .eq("class_id", exam.class_id)
        .eq("subject_id", exam.subject_id)
        .eq("purpose", exam.purpose ?? "exam")
        .order("section_order", { ascending: true, nullsFirst: false })
        .order("question_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const norm = (s: string | null | undefined) =>
    (s ?? "").toString().replace(/\s+/g, " ").trim().toLowerCase();

  const importBank = useMutation({
    mutationFn: async (chosen?: typeof bankMatches) => {
      const allowed = allowedTypesForExam(exam.type);
      const source = chosen ?? bankMatches ?? [];
      const list = source.filter((b) => allowed.includes((b.question_type ?? "mcq") as QuestionType));
      if (list.length === 0) {
        throw new Error(
          source.length === 0
            ? "No matching bank questions selected."
            : `None of the selected questions match this ${exam.type.toUpperCase()} exam's allowed types (${allowed.join(", ")}).`
        );
      }

      const existing = new Set((questions ?? []).map((q) => norm(q.question_text)));
      const seenInBatch = new Set<string>();
      const fresh = list.filter((b) => {
        const key = norm(b.question_text);
        if (!key) return false;
        if (existing.has(key) || seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
      });

      const skipped = list.length - fresh.length;
      if (fresh.length === 0) {
        throw new Error(`All ${list.length} selected questions are already attached to this exam.`);
      }

      const startPos = (questions?.length ?? 0) + 1;
      const payload = fresh.map((b, i) => ({
        exam_id: exam.id,
        section_id: activeSectionId ?? null,
        question_text: b.question_text,
        options: b.options,
        correct_answer: b.correct_answer,
        marks: b.marks ?? 1,
        question_type: b.question_type ?? "mcq",
        position: startPos + i,
        media: b.media ?? [],
      }));
      const { error } = await supabase.from("questions").insert(payload);
      if (error) throw error;
      return { imported: fresh.length, skipped };
    },
    onSuccess: ({ imported, skipped }) => {
      toast.success(
        skipped > 0
          ? `Imported ${imported} new question(s). Skipped ${skipped} duplicate(s).`
          : `Imported ${imported} question(s) from bank.`,
      );
      refetchAll();
      setOpenSelectBank(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAddQuestionForSection = (secId: string | null) => {
    setActiveSectionId(secId);
    setOpenAddQ(true);
  };

  const openBuilderForSection = (secId: string | null, editQ?: QuestionRow) => {
    setActiveSectionId(secId);
    setBuilderEdit(editQ ?? null);
    setOpenBuilder(true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Modal Header & Summary Bar */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <DialogTitle className="text-xl">Question Bank — {exam.title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Structure exam into sections, assign instructions, and author questions for {exam.type.toUpperCase()} ({exam.purpose ?? "exam"}).
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-muted/30 font-medium">
                {sections.length} Section{sections.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="bg-muted/30 font-medium">
                {questions.length} Question{questions.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary" className="font-semibold">
                {totalMarks} / {exam.max_score} Marks
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenUploadQ(true)}>
                <FileText className="h-4 w-4 mr-1.5" />Upload CSV
              </Button>
              {(bankMatches?.length ?? 0) > 0 && (
                <Button size="sm" variant="outline" onClick={() => setOpenSelectBank(true)}>
                  Import from Bank ({bankMatches?.length})
                </Button>
              )}
            </div>
            <Button size="sm" onClick={() => { setEditingSection(null); setOpenSectionModal(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />Add Section
            </Button>
          </div>
        </DialogHeader>

        {/* Modal Body: Structure Editor */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/5">
          {sections.length === 0 && questionsBySection.unsectioned.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed p-10 text-center space-y-3 bg-background">
              <FolderPlus className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <div className="space-y-1">
                <p className="font-medium text-base">No sections or questions created yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Start by adding a section (e.g. SECTION A - Objectives) to organize instructions and questions.
                </p>
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <Button size="sm" onClick={() => { setEditingSection(null); setOpenSectionModal(true); }}>
                  <Plus className="h-4 w-4 mr-1.5" />Add First Section
                </Button>
                <Button size="sm" variant="outline" onClick={() => openBuilderForSection(null)}>
                  <Plus className="h-4 w-4 mr-1.5" />Open Question Builder
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Render Section Containers */}
              {sections.map((sec, secIdx) => {
                const secQs = questionsBySection.map.get(sec.id) ?? [];
                const secMarks = secQs.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

                return (
                  <div key={sec.id} className="rounded-lg border bg-background shadow-sm overflow-hidden">
                    {/* Section Header Bar */}
                    <div className="bg-muted/30 px-4 py-3 border-b flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="uppercase font-semibold tracking-wide text-xs">{sec.title}</Badge>
                          <span className="text-xs text-muted-foreground font-medium">
                            {secQs.length} question{secQs.length === 1 ? "" : "s"} • {secMarks} mark{secMarks === 1 ? "" : "s"}
                          </span>
                        </div>
                        {sec.instruction ? (
                          <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed pt-1">
                            <RichView content={sec.instruction} />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/80 italic pt-0.5">No section instructions provided.</p>
                        )}
                      </div>

                      {/* Section Dropdown Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openAddQuestionForSection(sec.id)}>
                            <Plus className="h-4 w-4 mr-2" />Add Quick Question
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openBuilderForSection(sec.id)}>
                            <Plus className="h-4 w-4 mr-2" />Open Question Builder
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { setEditingSection(sec); setOpenSectionModal(true); }}>
                            <Pencil className="h-4 w-4 mr-2" />Edit Section Header
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateSection.mutate(sec)}>
                            <Copy className="h-4 w-4 mr-2" />Duplicate Section
                          </DropdownMenuItem>
                          {secIdx > 0 && (
                            <DropdownMenuItem onClick={() => moveSectionOrder.mutate({ sec, direction: "up" })}>
                              <ChevronUp className="h-4 w-4 mr-2" />Move Up
                            </DropdownMenuItem>
                          )}
                          {secIdx < sections.length - 1 && (
                            <DropdownMenuItem onClick={() => moveSectionOrder.mutate({ sec, direction: "down" })}>
                              <ChevronDown className="h-4 w-4 mr-2" />Move Down
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDelSection(sec)}>
                            <Trash2 className="h-4 w-4 mr-2" />Delete Section
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Section Question List */}
                    <div className="divide-y">
                      {secQs.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                          <p>No questions added to {sec.title} yet.</p>
                          <div className="flex justify-center gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddQuestionForSection(sec.id)}>
                              <Plus className="h-3.5 w-3.5 mr-1" />Quick add
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openBuilderForSection(sec.id)}>
                              <Plus className="h-3.5 w-3.5 mr-1" />Question Builder
                            </Button>
                          </div>
                        </div>
                      ) : (
                        secQs.map((q) => {
                          const displayNo = globalQuestionNumMap.get(q.id) ?? q.position;
                          const opts = toOptionStrings(q.options);
                          const qt = q.question_type ?? "mcq";
                          const typeLabel = QUESTION_TYPES.find((t) => t.value === qt)?.label ?? "Multi-choice";
                          const mediaList = Array.isArray(q.media) ? q.media.filter((m) => m?.url) : [];

                          return (
                            <div key={q.id} className="p-3.5 flex items-start justify-between gap-3 hover:bg-muted/10 transition-colors">
                              <div className="flex-1 space-y-2">
                                <div className="text-sm flex items-start gap-2 flex-wrap">
                                  <span className="font-semibold text-foreground whitespace-nowrap">Q{displayNo}.</span>
                                  <RichView content={q.question_text} className="flex-1 min-w-[200px]" />
                                  <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
                                  <Badge variant="outline">{q.marks} mk</Badge>
                                </div>
                                {mediaList.length > 0 && (
                                  <div className="ml-5 flex flex-wrap gap-2 pt-1">
                                    {mediaList.map((m, idx) => (
                                      <SignedImage
                                        key={idx}
                                        bucket={m.bucket ?? "question-media"}
                                        src={m.path ?? m.url}
                                        alt={m.caption ?? ""}
                                        className="max-h-40 rounded border object-contain bg-white"
                                      />
                                    ))}
                                  </div>
                                )}
                                {qt === "mcq" && (
                                  <ul className="text-xs space-y-1 ml-5">
                                    {opts.map((o, idx) => (
                                      <li key={idx} className={String.fromCharCode(65 + idx) === normalizeMcqAnswer(q.correct_answer, opts) ? "text-green-700 font-medium" : "text-muted-foreground"}>
                                        {String.fromCharCode(65 + idx)}. {o}{String.fromCharCode(65 + idx) === normalizeMcqAnswer(q.correct_answer, opts) ? " ✓" : ""}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {(qt === "fill_gap" || qt === "short_answer") && q.correct_answer && (
                                  <div className="text-xs ml-5 text-green-700">Answer: <span className="font-medium">{q.correct_answer}</span></div>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" title="Edit Question" onClick={() => { setActiveSectionId(sec.id); setEditingQ(q); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {sections.length > 1 && (
                                  <Button size="sm" variant="ghost" title="Move to another section" onClick={() => setMoveQ(q)}>
                                    <ListChecks className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="text-destructive" title="Delete Question" onClick={() => setConfirmDelQ(q)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Section Footer: + Add Question */}
                    <div className="px-4 py-2 bg-muted/20 border-t flex justify-end gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddQuestionForSection(sec.id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />Quick add
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => openBuilderForSection(sec.id)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />Add Question
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Unsectioned / General Questions Block (if any exist) */}
              {questionsBySection.unsectioned.length > 0 && (
                <div className="rounded-lg border bg-background shadow-sm overflow-hidden border-dashed">
                  <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-between">
                    <div>
                      <Badge variant="outline" className="font-medium text-xs">General / Unsectioned Questions</Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">Questions not assigned to a specific section.</p>
                    </div>
                    <Badge variant="secondary">{questionsBySection.unsectioned.length} Questions</Badge>
                  </div>
                  <div className="divide-y">
                    {questionsBySection.unsectioned.map((q) => {
                      const displayNo = globalQuestionNumMap.get(q.id) ?? q.position;
                      return (
                        <div key={q.id} className="p-3.5 flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="text-sm flex items-start gap-2 flex-wrap">
                              <span className="font-semibold">Q{displayNo}.</span>
                              <RichView content={q.question_text} className="flex-1 min-w-[200px]" />
                              <Badge variant="outline">{q.marks} mk</Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {sections.length > 0 && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMoveQ(q)}>
                                Move to Section
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setEditingQ(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelQ(q)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={onClose}>Close Structure Editor</Button>
        </DialogFooter>
      </DialogContent>

      {/* Nested Sub-modals */}
      {openSectionModal && (
        <SectionDialog
          section={editingSection}
          examId={exam.id}
          nextOrder={sections.length + 1}
          onClose={() => { setOpenSectionModal(false); setEditingSection(null); }}
          onSaved={refetchAll}
        />
      )}

      {moveQ && (
        <MoveToSectionDialog
          question={moveQ}
          sections={sections}
          onClose={() => setMoveQ(null)}
          onMoved={refetchAll}
        />
      )}

      {delSection && (
        <DeleteSectionDialog
          section={delSection}
          questionCount={(questionsBySection.map.get(delSection.id) ?? []).length}
          onClose={() => setDelSection(null)}
          onDeleted={refetchAll}
        />
      )}

      {openBuilder && (
        <QuestionBuilderDialog
          examId={exam.id}
          sectionId={activeSectionId}
          row={builderEdit ?? undefined}
          nextPosition={(questions?.length ?? 0) + 1}
          onClose={() => { setOpenBuilder(false); setBuilderEdit(null); }}
          onSaved={refetchAll}
        />
      )}

      {openAddQ && (
        <QuestionDialog
          examId={exam.id}
          sectionId={activeSectionId}
          examType={exam.type}
          nextPosition={(questions?.length ?? 0) + 1}
          onClose={() => setOpenAddQ(false)}
          onSaved={refetchAll}
        />
      )}

      {editingQ && (
        <QuestionDialog
          row={editingQ}
          examId={exam.id}
          sectionId={editingQ.section_id ?? activeSectionId}
          examType={exam.type}
          nextPosition={editingQ.position ?? 1}
          onClose={() => setEditingQ(null)}
          onSaved={refetchAll}
        />
      )}

      {openUploadQ && (
        <ExamQuestionsUploadDialog
          examId={exam.id}
          sectionId={activeSectionId}
          examType={exam.type}
          startPosition={(questions?.length ?? 0) + 1}
          onClose={() => setOpenUploadQ(false)}
          onSaved={refetchAll}
        />
      )}

      {openSelectBank && (
        <SelectBankQuestionsDialog
          examType={exam.type}
          bank={bankMatches ?? []}
          attachedTexts={new Set((questions ?? []).map((q) => norm(q.question_text)))}
          norm={norm}
          onClose={() => setOpenSelectBank(false)}
          onImport={(chosen) => importBank.mutate(chosen as unknown as NonNullable<typeof bankMatches>)}
          importing={importBank.isPending}
        />
      )}

      <AlertDialog open={!!confirmDelQ} onOpenChange={(o) => !o && setConfirmDelQ(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDelQ) removeQ.mutate(confirmDelQ.id); setConfirmDelQ(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

type BankPickerRow = {
  id: string;
  question_text: string;
  options: unknown;
  correct_answer: string | null;
  marks: number;
  question_type: string | null;
  section_label: string | null;
  section_instruction: string | null;
  section_order: number | null;
  question_number: number | null;
  media: unknown;
};

function SelectBankQuestionsDialog({
  examType, bank, attachedTexts, norm, onClose, onImport, importing,
}: {
  examType: ExamType;
  bank: BankPickerRow[];
  attachedTexts: Set<string>;
  norm: (s: string | null | undefined) => string;
  onClose: () => void;
  onImport: (chosen: BankPickerRow[]) => void;
  importing: boolean;
}) {

  const allowed = useMemo(() => allowedTypesForExam(examType), [examType]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return bank.map((b) => {
      const typeOk = allowed.includes((b.question_type ?? "mcq") as QuestionType);
      const already = attachedTexts.has(norm(b.question_text));
      return { b, typeOk, already };
    }).filter(({ b }) => !s || (b.question_text ?? "").toLowerCase().includes(s));
  }, [bank, allowed, attachedTexts, norm, search]);

  const selectableIds = rows.filter((r) => r.typeOk && !r.already).map((r) => r.b.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelected((prev) => {
    if (allSelected) {
      const next = new Set(prev);
      selectableIds.forEach((id) => next.delete(id));
      return next;
    }
    return new Set([...prev, ...selectableIds]);
  });

  const chosen = bank.filter((b) => selected.has(b.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select questions from the bank</DialogTitle>
          <DialogDescription>
            Pick individual questions to attach to this {examType.toUpperCase()} exam. Only allowed types ({allowed.join(", ")}) can be imported; already-attached items are disabled.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          <Button type="button" size="sm" variant="outline" onClick={toggleAll} disabled={selectableIds.length === 0}>
            {allSelected ? "Clear all" : "Select all"}
          </Button>
        </div>
        <div className="rounded-md border max-h-[50vh] overflow-y-auto divide-y">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No bank questions match.</p>
          ) : rows.map(({ b, typeOk, already }) => {
            const disabled = !typeOk || already;
            const qt = (b.question_type ?? "mcq") as QuestionType;
            const typeLabel = QUESTION_TYPES.find((t) => t.value === qt)?.label ?? qt;
            return (
              <label key={b.id} className={`flex items-start gap-2 p-3 text-sm ${disabled ? "opacity-60" : "cursor-pointer hover:bg-muted/40"}`}>
                <Checkbox
                  checked={selected.has(b.id)}
                  disabled={disabled}
                  onCheckedChange={() => !disabled && toggle(b.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1 mb-1">
                    <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
                    <Badge variant="outline" className="text-[10px]">{b.marks ?? 1} mk</Badge>
                    {!typeOk && <Badge variant="destructive" className="text-[10px]">Type not allowed</Badge>}
                    {already && <Badge className="text-[10px]">Already attached</Badge>}
                  </div>
                  <RichView content={b.question_text} className="line-clamp-3 text-foreground" />
                </div>
              </label>
            );
          })}
        </div>
        <DialogFooter className="items-center">
          <span className="text-xs text-muted-foreground mr-auto">{selected.size} selected</span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onImport(chosen)} disabled={chosen.length === 0 || importing}>
            {importing ? "Importing…" : `Import ${chosen.length || ""} selected`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function QuestionDialog({ row, examId, sectionId, examType, nextPosition, onClose, onSaved }: {
  row?: QuestionRow; examId: string; sectionId?: string | null; examType: ExamType; nextPosition: number; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!row;
  const initialOpts = toOptionStrings(row?.options);
  const padded = [...initialOpts, "", "", "", ""].slice(0, 4);
  const allowedTypes = useMemo(() => allowedTypesForExam(examType), [examType]);
  const [qType, setQType] = useState<QuestionType>(
    (row?.question_type as QuestionType) ?? defaultTypeForExam(examType)
  );
  const [text, setText] = useState(row?.question_text ?? "");
  const [opts, setOpts] = useState<string[]>(padded);
  const [correct, setCorrect] = useState(row?.correct_answer ?? "");
  const [marks, setMarks] = useState((row?.marks ?? 1).toString());
  const [position, setPosition] = useState((row?.position ?? nextPosition).toString());

  const [mode, setMode] = useState<"exit" | "another">("exit");

  function resetForm() {
    setText("");
    setOpts(["", "", "", ""]);
    setCorrect("");
    setMarks("1");
    setPosition(String(Number(position) + 1 || nextPosition + 1));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!text.trim()) throw new Error("Question text required.");
      let cleanOpts: string[] = [];
      let correctVal: string | null = null;
      if (qType === "mcq") {
        const normalized = compactMcq(opts, correct);
        cleanOpts = normalized.options;
        if (cleanOpts.length < 2) throw new Error("Provide at least 2 options.");
        if (!normalized.correct) throw new Error("Select a valid correct option.");
        correctVal = normalized.correct;
      } else if (qType === "fill_gap" || qType === "short_answer") {
        if (!correct.trim()) throw new Error("Provide the expected answer.");
        correctVal = correct.trim();
      } else {
        correctVal = correct.trim() || null;
      }
      const payload = {
        question_type: qType,
        question_text: text.trim(),
        options: cleanOpts.length ? cleanOpts : null,
        correct_answer: correctVal,
        marks: Number(marks) || 1,
        position: Number(position) || nextPosition,
        section_id: sectionId ?? row?.section_id ?? null,
      };
      if (isEdit && row) {
        const { error } = await supabase.from("questions").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("questions").insert({ ...payload, exam_id: examId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Question updated." : "Question added.");
      onSaved();
      if (mode === "another" && !isEdit) {
        resetForm();
      } else {
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>
            {examType === "cbt"
              ? "CBT exams are auto-graded. Choose Multi-choice, Fill in the gap, or Short answer."
              : `${examType[0].toUpperCase()}${examType.slice(1)} exams are teacher-graded. Choose Theory or Short answer.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Question type" required>
            <Select value={qType} onValueChange={(v) => setQType(v as QuestionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.filter((t) => allowedTypes.includes(t.value)).map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Question" required>
            <RichEditor rows={3} value={text} onChange={setText} maxLength={2000} />
          </Field>
          {qType === "mcq" && (
            <>
              {opts.map((o, i) => (
                <Field key={i} label={`Option ${String.fromCharCode(65 + i)}`}>
                  <Input value={o} onChange={(e) => {
                    const next = [...opts]; next[i] = e.target.value; setOpts(next);
                  }} maxLength={300} />
                </Field>
              ))}
              <Field label="Correct option" required>
                <Select value={normalizeMcqAnswer(correct, opts) || "none"} onValueChange={(v) => setCorrect(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select correct option" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {optionEntries(opts).map(([key, o]) => (
                      <SelectItem key={key} value={key}>{key}. {o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          {(qType === "fill_gap" || qType === "short_answer") && (
            <Field label={qType === "fill_gap" ? "Expected answer (the word/phrase that fills the gap)" : "Expected short answer"} required>
              <Input value={correct} onChange={(e) => setCorrect(e.target.value)} maxLength={500} />
            </Field>
          )}
          {qType === "theory" && (
            <Field label="Marking guide / model answer (optional)">
              <RichEditor rows={3} value={correct} onChange={setCorrect} maxLength={2000} />
            </Field>
          )}
          {VISUAL_TYPES.includes(qType) && (
            <>
              <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {qType === "drawing" && "Ask the child to draw what's described. Use the Diagram button in the editor to include a reference sketch if needed."}
                {qType === "coloring" && "Ask the child to color / paint the picture. Insert the outline image using the Diagram button in the editor."}
                {qType === "chart" && "Show a chart or picture and ask the child to point to / identify items. Insert the chart image using the Diagram button in the editor."}
              </div>
              <Field label="Marking guide / what to look for (optional)">
                <RichEditor rows={3} value={correct} onChange={setCorrect} maxLength={2000} />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Marks"><Input type="number" min={1} value={marks} onChange={(e) => setMarks(e.target.value)} /></Field>
            <Field label="Position"><Input type="number" min={1} value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          {!isEdit && (
            <Button variant="secondary" onClick={() => { setMode("another"); save.mutate(); }} disabled={save.isPending}>
              {save.isPending && mode === "another" ? "Saving…" : "Save & add another"}
            </Button>
          )}
          <Button onClick={() => { setMode("exit"); save.mutate(); }} disabled={save.isPending}>
            {save.isPending && mode === "exit" ? "Saving…" : (isEdit ? "Save" : "Save & exit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ============= CALENDAR ============= */
function ExamCalendar({ exams, subjMap, classMap, onSelect, isStaff }: {
  exams: ExamRow[];
  subjMap: Map<string, string>;
  classMap: Map<string, string>;
  onSelect: (e: ExamRow) => void;
  isStaff: boolean;
}) {
  const [cursor, setCursor] = useState<Date>(new Date());

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const byDay = new Map<string, ExamRow[]>();
  exams.forEach((e) => {
    if (!e.exam_date) return;
    const key = e.exam_date.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(e);
  });

  const undated = exams.filter((e) => !e.exam_date);

  const typeClass = (t: ExamType) =>
    t === "cbt" ? "bg-primary/15 text-primary border-primary/30"
      : t === "practical" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : t === "oral" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : "bg-muted text-foreground border-border";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="font-semibold">{format(cursor, "MMMM yyyy")}</div>
        <div className="text-xs text-muted-foreground">
          {isStaff ? "Click an event to edit" : "Click an event for details"}
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/40 text-xs font-medium">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="p-2 text-center border-r last:border-r-0">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const today = isSameDay(day, new Date());
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[110px] p-1.5 border-r border-t last:border-r-0 text-xs space-y-1",
                  !inMonth && "bg-muted/20 text-muted-foreground",
                )}
              >
                <div className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium",
                  today && "bg-primary text-primary-foreground",
                )}>
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onSelect(e)}
                      className={cn(
                        "w-full text-left truncate rounded border px-1.5 py-0.5 hover:opacity-80 transition",
                        typeClass(e.type),
                      )}
                      title={`${e.title} • ${subjMap.get(e.subject_id) ?? ""} • ${classMap.get(e.class_id) ?? ""}`}
                    >
                      <span className="font-medium">{e.title}</span>
                      <span className="opacity-70"> · {classMap.get(e.class_id) ?? ""}</span>
                    </button>
                  ))}
                  {items.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{items.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-md border p-3 space-y-2">
          <div className="text-sm font-medium">Unscheduled ({undated.length})</div>
          <div className="flex flex-wrap gap-2">
            {undated.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelect(e)}
                className={cn("rounded border px-2 py-1 text-xs hover:opacity-80", typeClass(e.type))}
              >
                {e.title} · {classMap.get(e.class_id) ?? ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============= GRADING ============= */
interface StudentRosterRow { id: string; full_name: string; admission_no: string }
interface ResultRow { id: string; student_id: string; score: number; grade: string | null; remark: string | null }

function letterGrade(pct: number, settings: SchoolSettings | null | undefined): string {
  if (settings) {
    const band = gradeFor(settings, pct);
    if (band) return band.grade;
  }
  // Fallback when settings not loaded yet
  if (pct >= 70) return "A";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 45) return "D";
  if (pct >= 40) return "E";
  return "F";
}

function GradeDialog({ exam, userId, onClose, onSaved }: {
  exam: ExamRow; userId: string | null; onClose: () => void; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: settings } = useSchoolSettings();
  const [rows, setRows] = useState<Record<string, { score: string; remark: string }>>({});
  const [hydrated, setHydrated] = useState(false);

  const { data: students, isLoading: loadingS } = useQuery({
    queryKey: ["grade-roster", exam.class_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no")
        .eq("class_id", exam.class_id)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRosterRow[];
    },
  });

  const { data: existing, isLoading: loadingR } = useQuery({
    queryKey: ["grade-results", exam.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, student_id, score, grade, remark")
        .eq("exam_id", exam.id);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const { data: attempts } = useQuery({
    queryKey: ["grade-attempts", exam.id],
    enabled: exam.type === "cbt",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, student_id, raw_score, total_marks, percentage, duration_seconds, submitted_at, answers")
        .eq("exam_id", exam.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const attemptByStudent = useMemo(() => {
    const m = new Map<string, any>();
    (attempts ?? []).forEach((a: any) => m.set(a.student_id, a));
    return m;
  }, [attempts]);
  const [breakdownFor, setBreakdownFor] = useState<{ student: StudentRosterRow; attempt: any } | null>(null);

  // Hydrate inputs once both queries resolve
  if (!hydrated && students && existing) {
    const init: Record<string, { score: string; remark: string }> = {};
    students.forEach((s) => {
      const r = existing.find((x) => x.student_id === s.id);
      init[s.id] = { score: r ? String(r.score) : "", remark: r?.remark ?? "" };
    });
    setRows(init);
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(rows)
        .filter(([, v]) => v.score.trim() !== "")
        .map(([student_id, v]) => {
          const score = Number(v.score);
          if (Number.isNaN(score) || score < 0 || score > exam.max_score) {
            throw new Error(`Score for student must be 0–${exam.max_score}`);
          }
          const pct = exam.max_score > 0 ? (score / exam.max_score) * 100 : 0;
          return {
            student_id,
            exam_id: exam.id,
            score,
            grade: letterGrade(pct, settings),
            remark: v.remark.trim() || null,
            recorded_by: userId,
            academic_session_id: exam.academic_session_id ?? exam.session_id ?? "",
          };
        });
      if (payload.length === 0) return 0;
      const { error } = await supabase
        .from("results")
        .upsert(payload, { onConflict: "student_id,exam_id" });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} result${n === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey: ["grade-results", exam.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePublish = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("exams")
        .update({ published: !exam.published })
        .eq("id", exam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(exam.published ? "Results unpublished." : "Results published to student portal.");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filled = Object.values(rows).filter((r) => r.score.trim() !== "").length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Grade — {exam.title}</DialogTitle>
          <DialogDescription>
            Enter marks (0–{exam.max_score}) and feedback per student. Save anytime; publish to release results to the student portal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filled} of {students?.length ?? 0} students graded</span>
          <span>
            {exam.published
              ? <Badge variant="default" className="gap-1"><Eye className="h-3 w-3" />Published</Badge>
              : <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" />Draft</Badge>}
          </span>
        </div>

        <div className="rounded-md border max-h-[60vh] overflow-y-auto">
          {loadingS || loadingR ? (
            <p className="p-6 text-sm text-muted-foreground text-center">Loading roster…</p>
          ) : (students ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No active students in this class.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-28">Score</TableHead>
                  <TableHead className="w-20 text-center">Grade</TableHead>
                  <TableHead>Feedback</TableHead>
                  {exam.type === "cbt" && <TableHead className="w-32 text-center">CBT</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(students ?? []).map((s) => {
                  const v = rows[s.id] ?? { score: "", remark: "" };
                  const num = Number(v.score);
                  const showGrade = v.score.trim() !== "" && !Number.isNaN(num);
                  const pct = exam.max_score > 0 ? (num / exam.max_score) * 100 : 0;
                  const attempt = attemptByStudent.get(s.id);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground">{s.admission_no}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" min={0} max={exam.max_score} value={v.score}
                          onChange={(e) => setRows({ ...rows, [s.id]: { ...v, score: e.target.value } })}
                          placeholder={`/${exam.max_score}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {showGrade ? <Badge variant="outline">{letterGrade(pct, settings)}</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={v.remark} maxLength={300}
                          onChange={(e) => setRows({ ...rows, [s.id]: { ...v, remark: e.target.value } })}
                          placeholder="Optional feedback"
                        />
                      </TableCell>
                      {exam.type === "cbt" && (
                        <TableCell className="text-center">
                          {attempt ? (
                            <Button size="sm" variant="outline" onClick={() => setBreakdownFor({ student: s, attempt })}>
                              <Eye className="h-3.5 w-3.5 mr-1" />{attempt.raw_score}/{attempt.total_marks}
                            </Button>
                          ) : <span className="text-xs text-muted-foreground">Not attempted</span>}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save results"}
            </Button>
            {!exam.published && (
              <Button
                onClick={async () => { await save.mutateAsync(); togglePublish.mutate(); }}
                disabled={save.isPending || togglePublish.isPending}
              >
                <Eye className="h-4 w-4 mr-1" />Save & publish
              </Button>
            )}
          </div>
        </DialogFooter>

      </DialogContent>
      {breakdownFor && (
        <AttemptBreakdownDialog
          exam={exam}
          student={breakdownFor.student}
          attempt={breakdownFor.attempt}
          onClose={() => setBreakdownFor(null)}
        />
      )}
    </Dialog>
  );
}

/* ============= QUESTION BANK ============= */
interface BankRow {
  id: string; class_id: string; subject_id: string; purpose: ExamPurpose;
  question_text: string; options: unknown; correct_answer: string; marks: number;
  question_type: QuestionType;
  section_label?: string | null;
  section_instruction?: string | null;
  section_order?: number | null;
  question_number?: number | null;
  media?: Array<{ type?: string; url?: string; caption?: string; bucket?: string; path?: string }> | null;
}

function QuestionBankPanel({ classes, subjects, userId, isStaff, canManageClass, restrictPairs }: {
  classes: ClassRow[]; subjects: SubjectRow[]; userId: string | null;
  isStaff: boolean; canManageClass: (classId: string) => boolean;
  restrictPairs?: Array<{ class_id: string; subject_id: string }>;
}) {
  const qc = useQueryClient();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<BankRow | null>(null);


  const { data: items } = useQuery({
    queryKey: ["question-bank-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("question_bank")
        .select("id,class_id,subject_id,purpose,question_text,options,correct_answer,marks,question_type,section_label,section_instruction,section_order,question_number,media")
        .order("section_order", { ascending: true, nullsFirst: false })
        .order("question_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as BankRow[];
    },
  });

  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const subjMap = new Map(subjects.map((s) => [s.id, s.name]));

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("question_bank", id);
    },
    onSuccess: () => {
      toast.success("Question removed from bank.");
      qc.invalidateQueries({ queryKey: ["question-bank-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (items ?? []).filter((q) =>
    (classFilter === "all" || q.class_id === classFilter) &&
    (subjectFilter === "all" || q.subject_id === subjectFilter) &&
    (purposeFilter === "all" || q.purpose === purposeFilter)
  );

  // Counts grouped by (class, subject, purpose)
  const counts = filtered.reduce<Record<string, number>>((acc, q) => {
    const k = `${q.class_id}|${q.subject_id}|${q.purpose}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Class">
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Subject">
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.filter((s) => classFilter === "all" || !s.class_id || s.class_id === classFilter)
                .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Purpose">
          <Select value={purposeFilter} onValueChange={setPurposeFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {EXAM_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex-1" />
        {isStaff && (
          <>
            <Button size="sm" variant="outline" onClick={() => setOpenUpload(true)}>
              <FileText className="h-4 w-4 mr-1" />Upload CSV
            </Button>
            <Button size="sm" onClick={() => setOpenAdd(true)}><Plus className="h-4 w-4 mr-1" />Add bank question</Button>
            {openAdd && (
              <BankQuestionDialog classes={classes} subjects={subjects} userId={userId}
                restrictPairs={restrictPairs}
                onClose={() => setOpenAdd(false)}
                onSaved={() => qc.invalidateQueries({ queryKey: ["question-bank-list"] })} />
            )}
            {openUpload && (
              <BankUploadDialog classes={classes} subjects={subjects} userId={userId}
                restrictPairs={restrictPairs}
                onClose={() => setOpenUpload(false)}
                onSaved={() => qc.invalidateQueries({ queryKey: ["question-bank-list"] })} />
            )}
          </>
        )}

      </div>

      {Object.keys(counts).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(counts).map(([k, n]) => {
            const [cid, sid, p] = k.split("|");
            return (
              <Badge key={k} variant="outline" className="font-normal">
                {classMap.get(cid) ?? "?"} · {subjMap.get(sid) ?? "?"} · {p.toUpperCase()}: {n}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Question</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Purpose</TableHead>
            <TableHead className="text-center">Marks</TableHead>
            {isStaff && <TableHead className="text-right">Actions</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={isStaff ? 7 : 6} className="text-center text-muted-foreground py-8">
                No bank questions yet. Add some to power random CBT generation.
              </TableCell></TableRow>
            ) : filtered.map((q) => {
              const qt = q.question_type ?? "mcq";
              const typeLabel = QUESTION_TYPES.find((t) => t.value === qt)?.label ?? qt;
              return (
                <TableRow key={q.id}>
                  <TableCell className="max-w-md">
                    {q.section_label && (
                      <div className="mb-1">
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                          {q.section_label}
                        </Badge>
                        {q.section_instruction && (
                          <div className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-2">
                            {q.section_instruction}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="text-sm">
                      {q.question_number != null && <span className="font-medium mr-1">{q.question_number}.</span>}
                      <RichView content={q.question_text} className="line-clamp-2 align-top text-sm" />
                    </div>
                    {Array.isArray(q.media) && q.media.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {q.media.filter((m) => m?.url || m?.path).slice(0, 3).map((m, i) => (
                          <SignedImage key={i} bucket={m.bucket ?? "question-media"} src={m.path ?? m.url} alt={m.caption ?? ""} className="h-12 w-12 object-cover rounded border" />
                        ))}
                      </div>
                    )}
                    {qt !== "theory" && !VISUAL_TYPES.includes(qt as QuestionType) && q.correct_answer && (
                      <div className="text-xs text-muted-foreground mt-1">Answer: {q.correct_answer}</div>
                    )}

                  </TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge></TableCell>
                  <TableCell>{classMap.get(q.class_id) ?? "—"}</TableCell>
                  <TableCell>{subjMap.get(q.subject_id) ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="uppercase">{q.purpose}</Badge></TableCell>
                  <TableCell className="text-center">{q.marks}</TableCell>
                  {isStaff && (
                    <TableCell className="text-right">
                      {canManageClass(q.class_id) ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(q)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(q)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Other class</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <BankQuestionDialog row={editing} classes={classes} subjects={subjects} userId={userId}
          restrictPairs={restrictPairs}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["question-bank-list"] })} />
      )}


      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bank question?</AlertDialogTitle>
            <AlertDialogDescription>It will no longer appear in random CBT pools.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDel) remove.mutate(confirmDel.id); setConfirmDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BankQuestionDialog({ row, classes, subjects, userId, restrictPairs, onClose, onSaved }: {
  row?: BankRow; classes: ClassRow[]; subjects: SubjectRow[]; userId: string | null;
  restrictPairs?: Array<{ class_id: string; subject_id: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!row;
  const initialOpts = toOptionStrings(row?.options);
  const padded = [...initialOpts, "", "", "", ""].slice(0, 4);
  const [classId, setClassId] = useState(row?.class_id ?? "");
  const [subjectId, setSubjectId] = useState(row?.subject_id ?? "");
  const [purpose, setPurpose] = useState<ExamPurpose>((row?.purpose ?? "exam") as ExamPurpose);
  const [qType, setQType] = useState<QuestionType>((row?.question_type ?? "mcq") as QuestionType);
  const [text, setText] = useState(row?.question_text ?? "");
  const [opts, setOpts] = useState<string[]>(padded);
  const [correct, setCorrect] = useState(row?.correct_answer ?? "");
  const [marks, setMarks] = useState((row?.marks ?? 1).toString());

  const allowedByClass = useMemo(() => {
    if (!restrictPairs) return null;
    const m = new Map<string, Set<string>>();
    restrictPairs.forEach((p) => {
      if (!m.has(p.class_id)) m.set(p.class_id, new Set());
      m.get(p.class_id)!.add(p.subject_id);
    });
    return m;
  }, [restrictPairs]);

  const subjectOptions = useMemo(() => {
    let list = classId ? subjects.filter((s) => s.class_id === classId) : subjects;
    if (allowedByClass && classId) {
      const allowed = allowedByClass.get(classId) ?? new Set<string>();
      list = list.filter((s) => allowed.has(s.id));
    }
    return list;
  }, [subjects, classId, allowedByClass]);

  const save = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("Class is required.");
      if (!subjectId) throw new Error("Subject is required.");
      if (!text.trim()) throw new Error("Question text required.");
      let cleanOpts: string[] = [];
      let correctVal: string | null = null;
      if (qType === "mcq") {
        const normalized = compactMcq(opts, correct);
        cleanOpts = normalized.options;
        if (cleanOpts.length < 2) throw new Error("Provide at least 2 options.");
        if (!normalized.correct) throw new Error("Select a valid correct option.");
        correctVal = normalized.correct;
      } else if (qType === "fill_gap" || qType === "short_answer") {
        if (!correct.trim()) throw new Error("Provide the expected answer.");
        correctVal = correct.trim();
      } else {
        correctVal = correct.trim() || null;
      }
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        purpose,
        question_type: qType,
        question_text: text.trim(),
        options: cleanOpts.length ? cleanOpts : null,
        correct_answer: correctVal,
        marks: Number(marks) || 1,
      };
      if (isEdit && row) {
        const { error } = await supabase.from("question_bank").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("question_bank").insert({ ...payload, created_by: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Question updated." : "Question added to bank."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit bank question" : "Add bank question"}</DialogTitle>
          <DialogDescription>Reusable question scoped to class, subject, and purpose.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Class" required>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Subject" required>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{subjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Purpose" required>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as ExamPurpose)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXAM_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Question type" required>
            <Select value={qType} onValueChange={(v) => setQType(v as QuestionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Question" required>
            <RichEditor rows={3} value={text} onChange={setText} maxLength={2000} />
          </Field>
          {qType === "mcq" && (
            <>
              {opts.map((o, i) => (
                <Field key={i} label={`Option ${String.fromCharCode(65 + i)}`}>
                  <Input value={o} onChange={(e) => {
                    const next = [...opts]; next[i] = e.target.value; setOpts(next);
                  }} maxLength={300} />
                </Field>
              ))}
              <Field label="Correct option" required>
                <Select value={normalizeMcqAnswer(correct, opts) || "none"} onValueChange={(v) => setCorrect(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select correct option" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select —</SelectItem>
                    {optionEntries(opts).map(([key, o]) => (
                      <SelectItem key={key} value={key}>{key}. {o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          {(qType === "fill_gap" || qType === "short_answer") && (
            <Field label={qType === "fill_gap" ? "Expected answer" : "Expected short answer"} required>
              <Input value={correct} onChange={(e) => setCorrect(e.target.value)} maxLength={500} />
            </Field>
          )}
          {qType === "theory" && (
            <Field label="Marking guide / model answer (optional)">
              <RichEditor rows={3} value={correct} onChange={setCorrect} maxLength={2000} />
            </Field>
          )}
          {VISUAL_TYPES.includes(qType) && (
            <>
              <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {qType === "drawing" && "Drawing task for nursery/pre-school — manually graded. Use the Diagram button in the editor for a reference sketch."}
                {qType === "coloring" && "Coloring / painting task for nursery/pre-school — manually graded. Insert the outline picture using the Diagram button."}
                {qType === "chart" && "Chart / picture identification task for nursery/pre-school — manually graded. Insert the chart image using the Diagram button."}
              </div>
              <Field label="Marking guide / what to look for (optional)">
                <RichEditor rows={3} value={correct} onChange={setCorrect} maxLength={2000} />
              </Field>
            </>
          )}

          <Field label="Marks">
            <Input type="number" min={1} value={marks} onChange={(e) => setMarks(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============= BANK CSV UPLOAD ============= */
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
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else { cell += ch; }
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

const CSV_TEMPLATE = `question_type,question_text,option_a,option_b,option_c,option_d,correct_answer,marks
mcq,"What is 2+2?",2,3,4,5,4,1
fill_gap,"The capital of France is ___.",,,,,Paris,1
short_answer,"Define osmosis.",,,,,"Movement of solvent across a semipermeable membrane",2
theory,"Explain photosynthesis.",,,,,,5
`;

function BankUploadDialog({ classes, subjects, userId, restrictPairs, onClose, onSaved }: {
  classes: ClassRow[]; subjects: SubjectRow[]; userId: string | null;
  restrictPairs?: Array<{ class_id: string; subject_id: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [purpose, setPurpose] = useState<ExamPurpose>("exam");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ ok: number; errors: string[] } | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [wordOpen, setWordOpen] = useState(false);

  const allowedByClass = useMemo(() => {
    if (!restrictPairs) return null;
    const m = new Map<string, Set<string>>();
    restrictPairs.forEach((p) => {
      if (!m.has(p.class_id)) m.set(p.class_id, new Set());
      m.get(p.class_id)!.add(p.subject_id);
    });
    return m;
  }, [restrictPairs]);

  const subjectOptions = useMemo(() => {
    let list = classId ? subjects.filter((s) => s.class_id === classId) : subjects;
    if (allowedByClass && classId) {
      const allowed = allowedByClass.get(classId) ?? new Set<string>();
      list = list.filter((s) => allowed.has(s.id));
    }
    return list;
  }, [subjects, classId, allowedByClass]);

  async function handleFile(f: File) {
    setFile(f);
    const text = await f.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { setPreview({ ok: 0, errors: ["CSV is empty or missing a header row."] }); setParsedRows([]); return; }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const required = ["question_type", "question_text"];
    for (const r of required) {
      if (!header.includes(r)) { setPreview({ ok: 0, errors: [`Missing required column: ${r}`] }); setParsedRows([]); return; }
    }
    const objs: Record<string, string>[] = [];
    const errs: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => { obj[h] = (rows[i][idx] ?? "").trim(); });
      const qt = obj.question_type as QuestionType;
      if (!QUESTION_TYPES.find((t) => t.value === qt)) { errs.push(`Row ${i + 1}: invalid question_type "${obj.question_type}"`); continue; }
      if (!obj.question_text) { errs.push(`Row ${i + 1}: empty question_text`); continue; }
      if (qt === "mcq") {
        const o = [obj.option_a, obj.option_b, obj.option_c, obj.option_d].filter(Boolean);
        if (o.length < 2) { errs.push(`Row ${i + 1}: MCQ needs at least 2 options`); continue; }
        if (!normalizeMcqAnswer(obj.correct_answer, o)) { errs.push(`Row ${i + 1}: correct_answer must match one option`); continue; }
      } else if (qt === "fill_gap" || qt === "short_answer") {
        if (!obj.correct_answer) { errs.push(`Row ${i + 1}: ${qt} needs correct_answer`); continue; }
      }
      objs.push(obj);
    }
    setParsedRows(objs);
    setPreview({ ok: objs.length, errors: errs });
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (!classId || !subjectId) throw new Error("Choose class and subject.");
      if (parsedRows.length === 0) throw new Error("Nothing to upload.");
      const payload = parsedRows.map((r) => {
        const qt = r.question_type as QuestionType;
        const opts = qt === "mcq" ? [r.option_a, r.option_b, r.option_c, r.option_d].filter(Boolean) : null;
        return {
          class_id: classId,
          subject_id: subjectId,
          purpose,
          question_type: qt,
          question_text: r.question_text,
          options: opts,
          correct_answer: qt === "mcq" ? normalizeMcqAnswer(r.correct_answer, opts) : r.correct_answer || null,
          marks: Number(r.marks) || 1,
          created_by: userId,
        };
      });
      const { error } = await supabase.from("question_bank").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Uploaded ${n} question${n === 1 ? "" : "s"} to the bank.`); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadTemplate(variant: TemplateVariant) {
    if (!classId) { toast.error("Choose a class first."); return; }
    if (!year.trim()) { toast.error("Enter the year first."); return; }
    const className = classes.find((c) => c.id === classId)?.name ?? "";
    const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? "";
    const examTypeLabel = EXAM_PURPOSES.find((p) => p.value === purpose)?.label ?? purpose;
    downloadQuestionTemplate(variant, { year: year.trim(), examType: examTypeLabel, className, subjectName });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload questions to the bank</DialogTitle>
          <DialogDescription>
            CSV columns: <code className="font-mono text-[11px]">question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, marks</code>.
            All uploaded rows attach to the chosen class, subject, and purpose.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Year" required>
              <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" />
            </Field>
            <Field label="Class" required>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Subject" required>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{subjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Exam type" required>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as ExamPurpose)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EXAM_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="text-xs font-medium">Download template</div>
            <div className="text-[11px] text-muted-foreground">Year, exam type and class above are baked into the sample rows.</div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate("basic")}>1 · Instructions + easy (no pictures)</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate("with_pictures")}>2 · Instructions + easy with pictures</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate("with_pictures_equations")}>3 · Instructions + pictures + equations</Button>
              <Button type="button" size="sm" variant="default" onClick={() => downloadTemplate("rich")}>4 · Rich (passages + figures + equations)</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="max-w-xs" />
            {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
            <Button type="button" size="sm" variant="outline" onClick={() => {
              if (!classId || !subjectId) { toast.error("Choose class and subject first."); return; }
              setWordOpen(true);
            }}>Import from Word (.docx)</Button>
          </div>
          {preview && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div><span className="font-medium">Ready:</span> {preview.ok} question{preview.ok === 1 ? "" : "s"}</div>
              {preview.errors.length > 0 && (
                <div className="text-destructive">
                  <div className="font-medium">{preview.errors.length} row(s) skipped:</div>
                  <ul className="list-disc ml-4 max-h-32 overflow-y-auto">
                    {preview.errors.slice(0, 20).map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || !classId || !subjectId || parsedRows.length === 0}>
            {upload.isPending ? "Uploading…" : `Upload ${parsedRows.length || ""} question${parsedRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
      <WordImportWizard
        open={wordOpen}
        onClose={() => setWordOpen(false)}
        title="Import bank questions from Word"
        onImport={async (rows) => {
          if (!classId || !subjectId) throw new Error("Choose class and subject.");
          const payload = rows.map((r) => ({
            class_id: classId,
            subject_id: subjectId,
            purpose,
            question_type: r.question_type,
            question_text: r.question_text,
            options: r.options,
            correct_answer: r.correct_answer,
            marks: r.marks,
            created_by: userId,
            media: r.media,
          }));
          const { error } = await supabase.from("question_bank").insert(payload);
          if (error) throw error;
          onSaved(); onClose();
        }}
      />
    </Dialog>
  );
}



/* ============= EXAM QUESTIONS UPLOAD (per-exam CSV) ============= */
function ExamQuestionsUploadDialog({ examId, sectionId, examType, startPosition, onClose, onSaved }: {
  examId: string; sectionId?: string | null; examType: ExamType; startPosition: number; onClose: () => void; onSaved: () => void;
}) {
  const allowedTypes = useMemo(() => allowedTypesForExam(examType), [examType]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [tplClass, setTplClass] = useState("");
  const [tplExamType, setTplExamType] = useState<ExamPurpose>("exam");
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [preview, setPreview] = useState<{ ok: number; errors: string[] } | null>(null);
  const [wordOpen, setWordOpen] = useState(false);

  async function handleFile(f: File) {
    setFile(f);
    const text = await f.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { setPreview({ ok: 0, errors: ["CSV is empty or missing a header row."] }); setParsedRows([]); return; }
    const header = rows[0].map((h) => h.trim().toLowerCase());
    for (const r of ["question_type", "question_text"]) {
      if (!header.includes(r)) { setPreview({ ok: 0, errors: [`Missing required column: ${r}`] }); setParsedRows([]); return; }
    }
    const objs: Record<string, string>[] = [];
    const errs: string[] = [];
    for (let i = 1; i < rows.length; i++) {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => { obj[h] = (rows[i][idx] ?? "").trim(); });
      const qt = obj.question_type as QuestionType;
      if (!QUESTION_TYPES.find((t) => t.value === qt)) { errs.push(`Row ${i + 1}: invalid question_type "${obj.question_type}"`); continue; }
      if (!allowedTypes.includes(qt)) { errs.push(`Row ${i + 1}: question_type "${qt}" is not allowed for ${examType.toUpperCase()} exams (allowed: ${allowedTypes.join(", ")})`); continue; }
      if (!obj.question_text) { errs.push(`Row ${i + 1}: empty question_text`); continue; }
      if (qt === "mcq") {
        const o = [obj.option_a, obj.option_b, obj.option_c, obj.option_d].filter(Boolean);
        if (o.length < 2) { errs.push(`Row ${i + 1}: MCQ needs at least 2 options`); continue; }
        if (!normalizeMcqAnswer(obj.correct_answer, o)) { errs.push(`Row ${i + 1}: correct_answer must match one option`); continue; }
      } else if (qt === "fill_gap" || qt === "short_answer") {
        if (!obj.correct_answer) { errs.push(`Row ${i + 1}: ${qt} needs correct_answer`); continue; }
      }
      objs.push(obj);
    }
    setParsedRows(objs);
    setPreview({ ok: objs.length, errors: errs });
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (parsedRows.length === 0) throw new Error("Nothing to upload.");

      // Section title map to cache exam_sections created during upload
      const secTitleMap = new Map<string, string>();
      if (sectionId) {
        secTitleMap.set("__default__", sectionId);
      }

      const payload: any[] = [];

      for (let idx = 0; idx < parsedRows.length; idx++) {
        const r = parsedRows[idx];
        const qt = r.question_type as QuestionType;
        const opts = qt === "mcq" ? [r.option_a, r.option_b, r.option_c, r.option_d].filter(Boolean) : null;
        const secName = (r.section || r.section_label || "").trim();
        const secInstruction = (r.section_instruction || "").trim() || null;

        let targetSecId: string | null = sectionId ?? null;
        if (secName) {
          const key = secName.toLowerCase();
          if (secTitleMap.has(key)) {
            targetSecId = secTitleMap.get(key)!;
          } else {
            // Check existing or create new section
            const { data: existingSec } = await supabase
              .from("exam_sections")
              .select("id")
              .eq("exam_id", examId)
              .ilike("title", secName)
              .maybeSingle();

            if (existingSec?.id) {
              targetSecId = existingSec.id;
            } else {
              const { data: newSec } = await supabase
                .from("exam_sections")
                .insert({
                  exam_id: examId,
                  title: secName,
                  instruction: secInstruction,
                  section_order: secTitleMap.size + 1,
                })
                .select("id")
                .single();
              if (newSec?.id) targetSecId = newSec.id;
            }
            if (targetSecId) secTitleMap.set(key, targetSecId);
          }
        }

        payload.push({
          exam_id: examId,
          section_id: targetSecId,
          question_type: qt,
          question_text: r.question_text,
          options: opts,
          correct_answer: qt === "mcq" ? normalizeMcqAnswer(r.correct_answer, opts) : r.correct_answer || null,
          marks: Number(r.marks) || 1,
          position: startPosition + idx,
        });
      }

      const { error } = await supabase.from("questions").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => { toast.success(`Uploaded ${n} question${n === 1 ? "" : "s"}.`); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  function downloadTemplate(variant: TemplateVariant) {
    if (!year.trim()) { toast.error("Enter the year first."); return; }
    if (!tplClass.trim()) { toast.error("Enter the class first."); return; }
    const examTypeLabel = EXAM_PURPOSES.find((p) => p.value === tplExamType)?.label ?? tplExamType;
    downloadQuestionTemplate(variant, { year: year.trim(), examType: examTypeLabel, className: tplClass.trim() });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload questions to this exam</DialogTitle>
          <DialogDescription>
            CSV columns: <code className="font-mono text-[11px]">question_type, question_text, option_a, option_b, option_c, option_d, correct_answer, marks</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="text-xs font-medium">Download template</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Field label="Year" required>
                <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2025" />
              </Field>
              <Field label="Exam type" required>
                <Select value={tplExamType} onValueChange={(v) => setTplExamType(v as ExamPurpose)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXAM_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Class" required>
                <Input value={tplClass} onChange={(e) => setTplClass(e.target.value)} placeholder="e.g. Year 3 Zinnia A" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate("basic")}>1 · Instructions + easy (no pictures)</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate("with_pictures")}>2 · Instructions + easy with pictures</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => downloadTemplate("with_pictures_equations")}>3 · Instructions + pictures + equations</Button>
              <Button type="button" size="sm" variant="default" onClick={() => downloadTemplate("rich")}>4 · Rich (passages + figures + equations)</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="max-w-xs" />
            {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
            <Button type="button" size="sm" variant="outline" onClick={() => setWordOpen(true)}>
              Import from Word (.docx)
            </Button>
          </div>
          {preview && (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div><span className="font-medium">Ready:</span> {preview.ok} question{preview.ok === 1 ? "" : "s"}</div>
              {preview.errors.length > 0 && (
                <div className="text-destructive">
                  <div className="font-medium">{preview.errors.length} row(s) skipped:</div>
                  <ul className="list-disc ml-4 max-h-32 overflow-y-auto">
                    {preview.errors.slice(0, 20).map((er, i) => <li key={i}>{er}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => upload.mutate()} disabled={upload.isPending || parsedRows.length === 0}>
            {upload.isPending ? "Uploading…" : `Upload ${parsedRows.length || ""} question${parsedRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
      <WordImportWizard
        open={wordOpen}
        onClose={() => setWordOpen(false)}
        title="Import exam questions from Word"
        onImport={async (rows: WordImportPayload[]) => {
          if (rows.length === 0) throw new Error("Nothing to import.");

          // Split rows: MCQ -> CBT exam, Theory -> Written exam.
          // fill_gap / short_answer follow whichever exam already accepts them,
          // preferring the current exam's own allowed types.
          const cbtAllowed = allowedTypesForExam("cbt");
          const cbtRows: WordImportPayload[] = [];
          const writtenRows: WordImportPayload[] = [];
          const currentAllowed = allowedTypesForExam(examType);
          for (const r of rows) {
            const qt = r.question_type as QuestionType;
            if (qt === "mcq") cbtRows.push(r);
            else if (qt === "theory") writtenRows.push(r);
            else if (currentAllowed.includes(qt)) {
              (examType === "cbt" ? cbtRows : writtenRows).push(r);
            } else if (cbtAllowed.includes(qt)) cbtRows.push(r);
            else writtenRows.push(r);
          }

          const currentIsCbt = examType === "cbt";
          const currentRows = currentIsCbt ? cbtRows : writtenRows;
          const siblingRows = currentIsCbt ? writtenRows : cbtRows;
          const siblingType: ExamType = currentIsCbt ? "written" : "cbt";

          const { data: curExam, error: exErr } = await supabase
            .from("exams")
            .select("title, class_id, subject_id, term_id, session_id, academic_session_id, purpose, max_score, duration_minutes, created_by")
            .eq("id", examId)
            .single();
          if (exErr) throw exErr;

          const summary: string[] = [];

          if (currentRows.length > 0) {
            const payload = currentRows.map((r, idx) => ({
              exam_id: examId,
              question_type: r.question_type as QuestionType,
              question_text: r.question_text,
              options: r.options,
              correct_answer: r.correct_answer,
              marks: r.marks,
              position: startPosition + idx,
              section_label: r.section_label,
              section_instruction: r.section_instruction,
              media: r.media,
            }));
            const { error } = await supabase.from("questions").insert(payload);
            if (error) throw error;
            summary.push(`${payload.length} → this ${examType.toUpperCase()} exam`);
          }

          if (siblingRows.length > 0) {
            const siblingTitle = `${curExam.title} (${siblingType === "cbt" ? "CBT" : "Written"})`;
            const { data: newExam, error: insErr } = await supabase
              .from("exams")
              .insert({
                title: siblingTitle,
                type: siblingType,
                class_id: curExam.class_id,
                subject_id: curExam.subject_id,
                term_id: curExam.term_id,
                session_id: curExam.session_id,
                academic_session_id: curExam.academic_session_id ?? curExam.session_id,
                purpose: curExam.purpose,
                max_score: curExam.max_score ?? 100,
                duration_minutes: curExam.duration_minutes,
                question_source: "manual",
                created_by: curExam.created_by,
              })
              .select("id")
              .single();
            if (insErr) throw insErr;
            const payload = siblingRows.map((r, idx) => ({
              exam_id: newExam.id,
              question_type: r.question_type as QuestionType,
              question_text: r.question_text,
              options: r.options,
              correct_answer: r.correct_answer,
              marks: r.marks,
              position: 1 + idx,
              section_label: r.section_label,
              section_instruction: r.section_instruction,
              media: r.media,
            }));
            const { error: qErr } = await supabase.from("questions").insert(payload);
            if (qErr) throw qErr;
            summary.push(`${payload.length} → new ${siblingType.toUpperCase()} exam "${siblingTitle}"`);
          }

          if (summary.length === 0) throw new Error("No importable questions were found.");
          toast.success(`Imported: ${summary.join("; ")}.`);
          onSaved(); onClose();
        }}
      />
    </Dialog>
  );
}

/* ============= BULK DELETE QUESTIONS ============= */
function BulkDeleteQuestionsDialog({ classes, subjects, terms, sessions, onClose, onDone }: {
  classes: ClassRow[]; subjects: SubjectRow[]; terms: TermRow[]; sessions: SessionRow[];
  onClose: () => void; onDone: () => void;
}) {
  const [classId, setClassId] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [termId, setTermId] = useState<string>("all");
  const [sessionId, setSessionId] = useState<string>("all");
  const [examType, setExamType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const allFiltersAll =
    classId === "all" && subjectId === "all" && termId === "all" &&
    sessionId === "all" && examType === "all" && !dateFrom && !dateTo;

  const { data: matching, refetch, isFetching } = useQuery({
    queryKey: ["bulk-del-match", classId, subjectId, termId, sessionId, examType, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase.from("exams").select("id");
      if (classId !== "all") q = q.eq("class_id", classId);
      if (subjectId !== "all") q = q.eq("subject_id", subjectId);
      if (termId !== "all") q = q.eq("term_id", termId);
      if (sessionId !== "all") q = q.eq("session_id", sessionId);
      if (examType !== "all") q = q.eq("type", examType as ExamType);
      if (dateFrom) q = q.gte("exam_date", dateFrom);
      if (dateTo) q = q.lte("exam_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return { examIds: [] as string[], questionCount: 0 };
      const { count, error: e2 } = await supabase.from("questions")
        .select("id", { count: "exact", head: true })
        .in("exam_id", ids);
      if (e2) throw e2;
      return { examIds: ids, questionCount: count ?? 0 };
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!matching || matching.examIds.length === 0) return 0;
      const { error } = await supabase.from("questions").delete().in("exam_id", matching.examIds);
      if (error) throw error;
      return matching.questionCount;
    },
    onSuccess: (n) => {
      toast.success(`Deleted ${n} question${n === 1 ? "" : "s"}.`);
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk delete questions</DialogTitle>
          <DialogDescription>
            Delete all questions attached to exams matching the filters below. This affects exam questions only (not the question bank).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Exam type">
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {EXAM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Class">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terms</SelectItem>
                {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Session / Year">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sessions</SelectItem>
                {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div />
          <Field label="Date from">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="Date to">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {isFetching ? "Counting…" : matching ? (
            <>
              Matches <strong>{matching.examIds.length}</strong> exam{matching.examIds.length === 1 ? "" : "s"} containing{" "}
              <strong>{matching.questionCount}</strong> question{matching.questionCount === 1 ? "" : "s"}.
            </>
          ) : "Apply filters then preview."}
          <Button size="sm" variant="ghost" className="ml-2 h-7" onClick={() => refetch()} disabled={isFetching}>
            Refresh
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={del.isPending || !matching || matching.questionCount === 0}
            onClick={() => setConfirmOpen(true)}
          >
            {del.isPending ? "Deleting…" : `Delete ${matching?.questionCount ?? 0} questions`}
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {matching?.questionCount ?? 0} questions?</AlertDialogTitle>
              <AlertDialogDescription>
                {allFiltersAll
                  ? "No filters applied — this will delete every exam question in the system. Continue?"
                  : "This permanently removes the matching questions. The exams themselves are kept."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { setConfirmOpen(false); del.mutate(); }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/* ============= CBT ATTEMPT BREAKDOWN ============= */
function AttemptBreakdownDialog({ exam, student, attempt, onClose }: {
  exam: ExamRow; student: StudentRosterRow; attempt: any; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: settings } = useSchoolSettings();
  const initialAnswers: any[] = Array.isArray(attempt.answers)
    ? attempt.answers.filter((a: any) => !a?.__meta)
    : [];
  const meta = Array.isArray(attempt.answers)
    ? attempt.answers.find((a: any) => a?.__meta)
    : null;

  // Load questions.content_json for this exam to surface model answer /
  // marking guide + enforce per-unit max marks during grading.
  const { data: qRows } = useQuery({
    queryKey: ["grade-questions", exam.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, content_json")
        .eq("exam_id", exam.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Build lookup: sub_key -> { marks, modelAnswer, markingGuide }
  const guides = useMemo(() => {
    const map = new Map<string, { marks: number; modelAnswer?: string; markingGuide?: string }>();
    (qRows ?? []).forEach((row: any) => {
      const item = parseContentJson(row.content_json) as BuilderItem | null;
      if (!item) return;
      const walkQuestion = (q: BuilderQuestion, qId?: string) => {
        if (q.subQuestions.length > 0) {
          q.subQuestions.forEach((s) => {
            map.set(ansKey(row.id, { qId, subId: s.id }), {
              marks: Number(s.marks) || 0,
              modelAnswer: s.modelAnswer,
              markingGuide: s.markingGuide,
            });
          });
        } else {
          map.set(ansKey(row.id, { qId }), { marks: Number(q.marks) || 0 });
        }
      };
      if (item.kind === "question") walkQuestion(item.question);
      else item.group.questions.forEach((q) => walkQuestion(q, q.id));
    });
    return map;
  }, [qRows]);

  // Local edit state: teacher_score per answer index (only for needs_grading rows).
  const [scores, setScores] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    initialAnswers.forEach((a, i) => {
      if (a?.needs_grading && a.teacher_score != null) init[i] = String(a.teacher_score);
    });
    return init;
  });

  const autoCorrectMarks = initialAnswers
    .filter((a) => !a.needs_grading && a.is_correct)
    .reduce((sum, a) => sum + (Number(a.marks) || 0), 0);
  const gradedNow = initialAnswers.reduce((sum, a, i) => {
    if (!a.needs_grading) return sum;
    const cap = (guides.get(a.sub_key ?? "")?.marks ?? Number(a.marks)) || 0;
    const v = Number(scores[i] ?? a.teacher_score ?? NaN);
    return Number.isFinite(v) ? sum + Math.min(Math.max(0, v), cap) : sum;
  }, 0);
  const gradingUnits = initialAnswers.filter((a) => a.needs_grading);
  const gradedCount = gradingUnits.reduce((n, a, i) => {
    const idx = initialAnswers.indexOf(a);
    const raw = scores[idx] ?? (a.teacher_score != null ? String(a.teacher_score) : "");
    return raw.trim() !== "" ? n + 1 : n;
    void i;
  }, 0);

  const newRaw = autoCorrectMarks + gradedNow;
  // The server denominator already includes manual and automatic units.
  const totalMarks = Number(attempt.total_marks ?? 0);
  const denom = totalMarks || 1;
  const newPct = (newRaw / denom) * 100;
  const finalScore = exam.max_score > 0 ? Math.round((newPct / 100) * exam.max_score * 100) / 100 : 0;
  const dur = Number(attempt.duration_seconds ?? 0);
  const mins = Math.floor(dur / 60), secs = dur % 60;
  const autoCorrect = initialAnswers.filter((a) => !a.needs_grading && a.is_correct).length;
  const autoWrong = initialAnswers.filter((a) => !a.needs_grading && !a.is_correct).length;

  const save = useMutation({
    mutationFn: async () => {
      // Persist teacher_score onto each graded answer + refresh raw/percentage.
      const newAnswers = initialAnswers.map((a, i) => {
        if (!a.needs_grading) return a;
        const cap = (guides.get(a.sub_key ?? "")?.marks ?? Number(a.marks)) || 0;
        const raw = scores[i] ?? (a.teacher_score != null ? String(a.teacher_score) : "");
        if (raw.trim() === "") return { ...a, teacher_score: null };
        const v = Math.min(Math.max(0, Number(raw)), cap);
        return { ...a, teacher_score: v };
      });
      const payload = meta ? [...newAnswers, meta] : newAnswers;
      const { error: e1 } = await supabase.from("exam_attempts")
        .update({
          answers: payload,
          raw_score: newRaw,
          total_marks: totalMarks || Number(attempt.total_marks) || 0,
          percentage: Math.round(newPct * 100) / 100,
        })
        .eq("id", attempt.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("results").upsert({
        student_id: student.id,
        exam_id: exam.id,
        score: finalScore,
        grade: letterGrade(newPct, settings),
        remark: `CBT graded (${(newPct).toFixed(1)}%)`,
        academic_session_id: exam.academic_session_id ?? exam.session_id ?? "",
      }, { onConflict: "student_id,exam_id" });
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Grades saved.");
      qc.invalidateQueries({ queryKey: ["grade-attempts", exam.id] });
      qc.invalidateQueries({ queryKey: ["grade-results", exam.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student.full_name} — {exam.title}</DialogTitle>
          <DialogDescription>
            {student.admission_no} · submitted {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 text-sm">
          <Card className="p-3"><p className="text-xs text-muted-foreground">Raw</p><p className="font-semibold">{newRaw}/{totalMarks || attempt.total_marks}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Percentage</p><p className="font-semibold">{newPct.toFixed(1)}%</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Scaled</p><p className="font-semibold">{finalScore}/{exam.max_score}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Grade</p><p className="font-semibold">{letterGrade(newPct, settings)}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Duration</p><p className="font-semibold">{mins}m {secs}s</p></Card>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="default" className="bg-green-600 hover:bg-green-600">Auto-correct: {autoCorrect}</Badge>
          <Badge variant="destructive">Auto-wrong: {autoWrong}</Badge>
          {gradingUnits.length > 0 && (
            <Badge variant="outline">Needs grading: {gradedCount}/{gradingUnits.length}</Badge>
          )}
          {meta?.violations ? <Badge variant="outline">Violations: {meta.violations}</Badge> : null}
        </div>

        <div className="space-y-2">
          {initialAnswers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No answer log recorded.</p>
          ) : initialAnswers.map((a, i) => {
            const opts = a.options;
            const entries: Array<[string, string]> = Array.isArray(opts)
              ? opts.map((o: any, idx: number) => [String.fromCharCode(65 + idx), String(o)])
              : opts && typeof opts === "object"
                ? Object.entries(opts).map(([k, v]) => [k, String(v)])
                : [];
            const guide = guides.get(a.sub_key ?? "");
            const capMarks = (guide?.marks ?? Number(a.marks)) || 0;
            if (a.needs_grading) {
              return (
                <Card key={i} className="p-3 border-l-4 border-l-amber-500 space-y-2">
                  <div className="flex justify-between gap-2">
                    <div className="flex-1 min-w-0"><RichView content={a.question_text} className="text-sm font-medium" /></div>
                    <Badge variant="outline">Needs grading · {capMarks} mk</Badge>
                  </div>
                  <div className="rounded border bg-muted/30 p-2 text-xs">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Student answer</p>
                    <p className="whitespace-pre-wrap">{a.student_answer || <em className="text-muted-foreground">(blank)</em>}</p>
                  </div>
                  {(guide?.modelAnswer || guide?.markingGuide) && (
                    <div className="grid gap-2 md:grid-cols-2">
                      {guide?.modelAnswer && (
                        <div className="rounded border bg-emerald-50 dark:bg-emerald-950/30 p-2 text-xs">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Model answer</p>
                          <div className="qb-prose" dangerouslySetInnerHTML={{ __html: guide.modelAnswer }} />
                        </div>
                      )}
                      {guide?.markingGuide && (
                        <div className="rounded border bg-blue-50 dark:bg-blue-950/30 p-2 text-xs">
                          <p className="text-[10px] uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">Marking guide</p>
                          <div className="qb-prose" dangerouslySetInnerHTML={{ __html: guide.markingGuide }} />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Award marks</Label>
                    <Input
                      className="w-24"
                      type="number"
                      min={0}
                      max={capMarks}
                      step="0.5"
                      value={scores[i] ?? (a.teacher_score != null ? String(a.teacher_score) : "")}
                      onChange={(e) => setScores({ ...scores, [i]: e.target.value })}
                      placeholder={`/${capMarks}`}
                    />
                    <span className="text-xs text-muted-foreground">of {capMarks}</span>
                  </div>
                </Card>
              );
            }
            return (
              <Card key={i} className={`p-3 border-l-4 ${a.is_correct ? "border-l-green-500" : "border-l-destructive"}`}>
                <div className="flex justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0"><RichView content={a.question_text} className="text-sm font-medium" /></div>
                  <Badge variant={a.is_correct ? "default" : "destructive"} className={a.is_correct ? "bg-green-600 hover:bg-green-600" : ""}>
                    {a.is_correct ? "Correct" : "Wrong"} · {a.marks} mk
                  </Badge>
                </div>
                {entries.length > 0 ? (
                  <ul className="text-xs space-y-0.5 ml-3">
                    {entries.map(([k, v]) => {
                      const isCorrect = k === a.correct_answer;
                      const isStudent = k === a.student_answer;
                      return (
                        <li key={k} className={isCorrect ? "text-green-700 font-medium" : isStudent ? "text-destructive" : "text-muted-foreground"}>
                          <strong>{k}.</strong> <RichView content={v} className="inline" />{isCorrect ? " ✓" : ""}{isStudent && !isCorrect ? " ← chosen" : ""}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-xs space-y-0.5 ml-3">
                    <p>Student: <span className={a.is_correct ? "text-green-700 font-medium" : "text-destructive"}>{a.student_answer ?? "(blank)"}</span></p>
                    <p>Correct: <span className="text-green-700 font-medium">{a.correct_answer}</span></p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {gradingUnits.length > 0 && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save grades & score"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============= RETAKE ============= */
function RetakeDialog({ exam, onClose, onDone }: {
  exam: ExamRow; onClose: () => void; onDone: () => void;
}) {
  const [scope, setScope] = useState<"student" | "class">("student");
  const [studentId, setStudentId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);

  const { data: roster } = useQuery({
    queryKey: ["retake-roster", exam.class_id, exam.id],
    queryFn: async () => {
      const [rs, ra] = await Promise.all([
        supabase.from("students").select("id, full_name, admission_no")
          .eq("class_id", exam.class_id).eq("status", "active").order("full_name"),
        supabase.from("exam_attempts").select("student_id").eq("exam_id", exam.id),
      ]);
      if (rs.error) throw rs.error;
      if (ra.error) throw ra.error;
      const attempted = new Set((ra.data ?? []).map((r: any) => r.student_id));
      return (rs.data ?? []).map((s: any) => ({ ...s, attempted: attempted.has(s.id) }));
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      const targets = scope === "student"
        ? (studentId ? [studentId] : [])
        : (roster ?? []).filter((s: any) => s.attempted).map((s: any) => s.id);
      if (targets.length === 0) throw new Error("No matching attempts to reset.");
      const { error: e1 } = await supabase.from("exam_attempts")
        .delete().eq("exam_id", exam.id).in("student_id", targets);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("results")
        .delete().eq("exam_id", exam.id).in("student_id", targets);
      if (e2) throw e2;
      return targets.length;
    },
    onSuccess: (n) => { toast.success(`Retake enabled for ${n} student${n === 1 ? "" : "s"}.`); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const attemptedRoster = (roster ?? []).filter((s: any) => s.attempted);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set up retake — {exam.title}</DialogTitle>
          <DialogDescription>
            Clears the existing attempt and graded result for the selected students so they can take this exam again. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="student">A specific student</SelectItem>
                <SelectItem value="class">Entire class ({attemptedRoster.length} attempted)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "student" && (
            <div>
              <Label className="text-xs">Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Choose a student" /></SelectTrigger>
                <SelectContent>
                  {attemptedRoster.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">No students have attempted yet.</div>
                  ) : attemptedRoster.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.admission_no})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={run.isPending || (scope === "student" && !studentId) || (scope === "class" && attemptedRoster.length === 0)}
            onClick={() => setConfirming(true)}
          >
            Reset attempts
          </Button>
        </DialogFooter>

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset attempts?</AlertDialogTitle>
              <AlertDialogDescription>
                {scope === "student"
                  ? `The chosen student's attempt and graded result for "${exam.title}" will be deleted.`
                  : `Attempts and graded results for ${attemptedRoster.length} student(s) on "${exam.title}" will be deleted.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setConfirming(false); run.mutate(); }}>Yes, reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/* ============= MIXED WORD IMPORT (creates CBT + Written from one .docx) ============= */
function MixedExamImportDialog({
  classes, subjects, terms, sessions, userId, restrictPairs, onClose, onSaved,
}: {
  classes: ClassRow[]; subjects: SubjectRow[]; terms: TermRow[]; sessions: SessionRow[];
  userId: string | null;
  restrictPairs?: Array<{ class_id: string; subject_id: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const currentTerm = terms.find((t) => t.is_current);
  const currentSession = sessions.find((s) => s.is_current);
  const [classId, setClassId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [termId, setTermId] = useState<string>(currentTerm?.id ?? "");
  const [sessionId, setSessionId] = useState<string>(currentSession?.id ?? "");
  const [title, setTitle] = useState<string>("");
  const [purpose, setPurpose] = useState<ExamPurpose>("exam");
  const [maxScore, setMaxScore] = useState<string>("100");
  const [duration, setDuration] = useState<string>("60");
  const [wordOpen, setWordOpen] = useState(false);
  // After parsing, we hold rows here so the user can reassign each question
  // to CBT / Written / Skip before we actually create the exams.
  type Assignment = "cbt" | "written" | "skip";
  type PendingRow = WordImportPayload & { _id: string; _assign: Assignment; _origin: Assignment };
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [creating, setCreating] = useState(false);

  const allowedSubjectIdsByClass = useMemo(() => {
    if (!restrictPairs) return null;
    const m = new Map<string, Set<string>>();
    restrictPairs.forEach((p) => {
      if (!m.has(p.class_id)) m.set(p.class_id, new Set());
      m.get(p.class_id)!.add(p.subject_id);
    });
    return m;
  }, [restrictPairs]);

  const subjectOptions = useMemo(() => {
    let list = classId ? subjects.filter((s) => s.class_id === classId) : subjects;
    if (allowedSubjectIdsByClass && classId) {
      const allowed = allowedSubjectIdsByClass.get(classId) ?? new Set<string>();
      list = list.filter((s) => allowed.has(s.id));
    }
    return list;
  }, [subjects, classId, allowedSubjectIdsByClass]);

  const ready = classId && subjectId && termId && title.trim().length > 0;

  function classify(t: WordImportPayload["question_type"]): Assignment {
    if (t === "mcq") return "cbt";
    if (t === "theory") return "written";
    return "cbt"; // fill_gap / short_answer default to CBT (auto-markable).
  }

  async function stageRowsForReview(rows: WordImportPayload[]) {
    if (!ready) throw new Error("Fill in class, subject, term and title first.");
    if (rows.length === 0) throw new Error("No questions detected in the document.");
    const staged: PendingRow[] = rows.map((r, i) => {
      const a = classify(r.question_type);
      return { ...r, _id: `pr_${i}_${Math.random().toString(36).slice(2, 8)}`, _assign: a, _origin: a };
    });
    setPendingRows(staged);
  }

  const cbtCount = pendingRows?.filter((r) => r._assign === "cbt").length ?? 0;
  const writtenCount = pendingRows?.filter((r) => r._assign === "written").length ?? 0;
  const skipCount = pendingRows?.filter((r) => r._assign === "skip").length ?? 0;

  const splitErrors = useMemo(() => {
    if (!pendingRows) return [];
    const errs: string[] = [];
    const kept = pendingRows.filter((r) => r._assign !== "skip");
    if (kept.length === 0) errs.push("Every question is set to Skip — nothing would be created.");
    if (cbtCount === 0)
      errs.push("No CBT (Objective) questions assigned — the CBT exam would be empty. Reassign at least one question to CBT, or use the regular importer.");
    if (writtenCount === 0)
      errs.push("No Written (Theory) questions assigned — the Written exam would be empty. Reassign at least one question to Written, or use the regular importer.");
    for (const r of kept) {
      if (r._assign === "cbt" && r.question_type === "theory")
        errs.push(`Q "${truncStr(r.question_text, 60)}" is a theory question routed to CBT — CBT questions must be auto-markable (MCQ / fill-in).`);
      if (r._assign === "cbt" && r.question_type === "mcq") {
        const opts = r.options ?? [];
        if (opts.length < 2) errs.push(`MCQ "${truncStr(r.question_text, 60)}" has fewer than 2 options.`);
        if (!r.correct_answer) errs.push(`MCQ "${truncStr(r.question_text, 60)}" has no correct answer marked.`);
      }
    }
    return Array.from(new Set(errs));
  }, [pendingRows, cbtCount, writtenCount]);

  function moveRow(id: string, to: Assignment) {
    setPendingRows((prev) => prev?.map((r) => r._id === id ? { ...r, _assign: to } : r) ?? prev);
  }
  function resetSplit() {
    setPendingRows((prev) => prev?.map((r) => ({ ...r, _assign: r._origin })) ?? prev);
  }

  async function createExams() {
    if (!pendingRows) return;
    if (splitErrors.length > 0) {
      toast.error("Fix the split issues before creating exams.");
      return;
    }
    setCreating(true);
    try {
      const cbtRows = pendingRows.filter((r) => r._assign === "cbt");
      const writtenRows = pendingRows.filter((r) => r._assign === "written");

      const baseExam = {
        class_id: classId,
        subject_id: subjectId,
        term_id: termId,
        session_id: sessionId,
        academic_session_id: sessionId,
        purpose,
        max_score: Number(maxScore) || 100,
        duration_minutes: Number(duration) || null,
        question_source: "manual" as const,
        created_by: userId,
      };

      const summary: string[] = [];
      const cleanTitle = title.trim();

      async function createExamWith(kind: ExamType, qRows: PendingRow[], suffix: string) {
        const examTitle = `${cleanTitle} (${suffix})`;
        const { data: newExam, error: exErr } = await supabase
          .from("exams")
          .insert({ ...baseExam, title: examTitle, type: kind })
          .select("id")
          .single();
        if (exErr) throw exErr;
        const payload = qRows.map((r, idx) => ({
          exam_id: newExam.id,
          question_type: r.question_type,
          question_text: r.question_text,
          options: r.options,
          correct_answer: r.correct_answer,
          marks: r.marks,
          position: 1 + idx,
          section_label: r.section_label,
          section_instruction: r.section_instruction,
          media: r.media,
        }));
        const { error: qErr } = await supabase.from("questions").insert(payload);
        if (qErr) throw qErr;
        summary.push(`${payload.length} → ${suffix} exam "${examTitle}"`);
      }

      if (cbtRows.length > 0) await createExamWith("cbt", cbtRows, "CBT");
      if (writtenRows.length > 0) await createExamWith("written", writtenRows, "Written");

      toast.success(`Created ${summary.length} exam${summary.length === 1 ? "" : "s"}: ${summary.join("; ")}.`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create exams.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import mixed exam from Word</DialogTitle>
          <DialogDescription>
            Upload a single .docx that contains both Objective (Section A) and Theory (Section B, C…) questions.
            The system creates <strong>two separate exams</strong> — one CBT (for MCQs) and one Written (for theory) —
            sharing the same session, term, class, subject and title. You can reassign individual questions
            between the two exams before final confirmation.
          </DialogDescription>
        </DialogHeader>

        {!pendingRows && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Class" required>
                <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Subject" required>
                <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
                  <SelectTrigger><SelectValue placeholder={classId ? "Select subject" : "Choose class first"} /></SelectTrigger>
                  <SelectContent>
                    {subjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Session">
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Term" required>
                <Select value={termId} onValueChange={setTermId}>
                  <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                  <SelectContent>
                    {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Purpose">
                <Select value={purpose} onValueChange={(v) => setPurpose(v as ExamPurpose)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXAM_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Exam title" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Third Term Examination 2025/2026 — Physics" maxLength={120} />
              </Field>
              <Field label="Max score">
                <Input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
              </Field>
              <Field label="Duration (minutes)">
                <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </Field>
            </div>

            <div className="rounded-md border p-3 bg-muted/30 text-xs text-muted-foreground">
              After you pick the file, you'll get a split-preview screen where you can move questions
              between the CBT and Written exams before anything is created.
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={!ready} onClick={() => setWordOpen(true)}>
                <FileUp className="h-4 w-4 mr-1" />Choose Word file…
              </Button>
            </DialogFooter>
          </>
        )}

        {pendingRows && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">CBT: {cbtCount}</Badge>
              <Badge variant="secondary">Written: {writtenCount}</Badge>
              {skipCount > 0 && <Badge variant="outline">Skipped: {skipCount}</Badge>}
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={resetSplit}>Reset split</Button>
              <Button size="sm" variant="outline" onClick={() => setPendingRows(null)}>Re-upload</Button>
            </div>

            {splitErrors.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                <div className="font-semibold">Cannot create exams yet:</div>
                <ul className="list-disc ml-5 space-y-0.5">
                  {splitErrors.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SplitBucket
                title={`CBT exam (${cbtCount})`}
                rows={pendingRows.filter((r) => r._assign === "cbt")}
                otherLabel="→ Written"
                onMove={(id) => moveRow(id, "written")}
                onSkip={(id) => moveRow(id, "skip")}
              />
              <SplitBucket
                title={`Written exam (${writtenCount})`}
                rows={pendingRows.filter((r) => r._assign === "written")}
                otherLabel="→ CBT"
                onMove={(id) => moveRow(id, "cbt")}
                onSkip={(id) => moveRow(id, "skip")}
              />
            </div>

            {skipCount > 0 && (
              <details className="rounded-md border p-2 text-xs">
                <summary className="cursor-pointer font-medium">Skipped questions ({skipCount})</summary>
                <ul className="mt-2 space-y-1">
                  {pendingRows.filter((r) => r._assign === "skip").map((r) => (
                    <li key={r._id} className="flex items-start gap-2">
                      <span className="flex-1 text-muted-foreground">{truncStr(r.question_text, 120)}</span>
                      <Button size="sm" variant="ghost" onClick={() => moveRow(r._id, "cbt")}>To CBT</Button>
                      <Button size="sm" variant="ghost" onClick={() => moveRow(r._id, "written")}>To Written</Button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={createExams} disabled={creating || splitErrors.length > 0}>
                {creating ? "Creating…" : `Create ${(cbtCount > 0 ? 1 : 0) + (writtenCount > 0 ? 1 : 0)} exam${((cbtCount > 0 ? 1 : 0) + (writtenCount > 0 ? 1 : 0)) === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </div>
        )}

        <WordImportWizard
          open={wordOpen}
          onClose={() => setWordOpen(false)}
          title="Import mixed exam from Word"
          onImport={stageRowsForReview}
        />
      </DialogContent>
    </Dialog>
  );
}

function SplitBucket({
  title, rows, otherLabel, onMove, onSkip,
}: {
  title: string;
  rows: Array<WordImportPayload & { _id: string }>;
  otherLabel: string;
  onMove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  return (
    <div className="rounded-md border p-2 space-y-2 max-h-[45vh] overflow-y-auto">
      <div className="text-sm font-semibold sticky top-0 bg-background pb-1">{title}</div>
      {rows.length === 0 && <div className="text-xs text-muted-foreground italic">No questions assigned.</div>}
      {rows.map((r) => (
        <div key={r._id} className="rounded border p-2 text-xs space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-[10px]">{r.question_type}</Badge>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onMove(r._id)}>{otherLabel}</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onSkip(r._id)}>Skip</Button>
            </div>
          </div>
          <div className="whitespace-pre-wrap">{truncStr(r.question_text, 200)}</div>
          {r.options && r.options.length > 0 && (
            <ol className="ml-4 list-[upper-alpha] text-muted-foreground">
              {r.options.map((o, i) => {
                const letter = String.fromCharCode(65 + i);
                return <li key={i} className={r.correct_answer === letter ? "font-semibold text-primary" : ""}>{o}</li>;
              })}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

function truncStr(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
