import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Lock, Pencil, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolSettings, gradeFor } from "@/lib/scoring";
import { useResolvedAssessmentStructure, useResolvedGradingScale, gradeForDynamicScale, computeDynamicTotalScore } from "@/lib/assessment-config";

interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; session_id: string; is_current: boolean }
interface SessionRow { id: string; name: string; is_current: boolean }
interface StudentRow { id: string; full_name: string; admission_no: string | null }
interface SubjectRow { id: string; name: string }
interface ProcRow {
  id: string; student_id: string; subject_id: string;
  ca1_score: number | null; ca2_score: number | null; ca3_score: number | null;
  ca_total: number | null; exam_score: number | null; total_score: number;
  grade: string | null; remark: string | null;
  subject_position: number | null; class_position: number | null;
  student_average: number | null; class_average: number | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type EditMap = Record<string, Partial<ProcRow>>;

export function ProcessedResultsReviewPanel() {
  const qc = useQueryClient();
  const { data: settings } = useSchoolSettings();

  const { data: sessions } = useQuery({
    queryKey: ["rev-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["rev-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,session_id,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: classes } = useQuery({
    queryKey: ["rev-classes"],
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
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "approved" | "published">("all");
  const [studentQuery, setStudentQuery] = useState("");
  const [edits, setEdits] = useState<EditMap>({});

  const effSession = sessionId ?? currentSession?.id;
  const effTerm = termId ?? currentTerm?.id;

  const termsForSession = useMemo(
    () => (terms ?? []).filter((t) => !effSession || t.session_id === effSession),
    [terms, effSession],
  );

  const scopeReady = !!effSession && !!effTerm && !!classId;

  // Resolve dynamic assessment structure & grading scale for selected scope
  const { data: activeStructure } = useResolvedAssessmentStructure(classId, null, effTerm, effSession);
  const { data: activeGradingScale } = useResolvedGradingScale(classId, null);

  // Load current publication status for this scope (draft/approved/published or none).
  const { data: pubStatus } = useQuery({
    queryKey: ["rev-pubstatus", effSession, effTerm, classId, examType],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("result_publications")
        .select("status,approved_at,published_at")
        .eq("session_id", effSession!).eq("term_id", effTerm!).eq("class_id", classId!).eq("exam_type", examType)
        .maybeSingle();
      if (error) throw error;
      return data as { status: "draft" | "approved" | "published"; approved_at: string | null; published_at: string | null } | null;
    },
  });

  const { data: proc, isFetching } = useQuery({
    queryKey: ["rev-processed", effSession, effTerm, classId, examType],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("processed_results")
        .select("id,student_id,subject_id,ca1_score,ca2_score,ca3_score,ca_total,exam_score,total_score,grade,remark,subject_position,class_position,student_average,class_average")
        .eq("session_id", effSession!).eq("term_id", effTerm!).eq("class_id", classId!).eq("exam_type", examType);
      if (error) throw error;
      return (data ?? []) as ProcRow[];
    },
  });

  const { data: studentMap } = useQuery({
    queryKey: ["rev-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,full_name,admission_no").eq("class_id", classId!);
      if (error) throw error;
      const map = new Map<string, StudentRow>();
      (data ?? []).forEach((s) => map.set(s.id, s as StudentRow));
      return map;
    },
  });
  const { data: subjectMap } = useQuery({
    queryKey: ["rev-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name");
      if (error) throw error;
      const map = new Map<string, SubjectRow>();
      (data ?? []).forEach((s) => map.set(s.id, s as SubjectRow));
      return map;
    },
  });

  useEffect(() => { setEdits({}); }, [effSession, effTerm, classId, examType]);

  const status = pubStatus?.status ?? "draft";
  const isLocked = status === "published"; // published rows are read-only
  const isApprovedView = status === "approved" || status === "published";

  const rows = useMemo(() => {
    let list = (proc ?? []).map((r) => ({
      ...r,
      ...edits[r.id],
      student: studentMap?.get(r.student_id),
      subject: subjectMap?.get(r.subject_id),
    }));
    if (statusFilter !== "all" && statusFilter !== status) list = [];
    if (studentQuery.trim()) {
      const q = studentQuery.toLowerCase();
      list = list.filter((r) => r.student?.full_name?.toLowerCase().includes(q)
        || r.student?.admission_no?.toLowerCase().includes(q)
        || r.subject?.name?.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const an = a.student?.full_name ?? ""; const bn = b.student?.full_name ?? "";
      if (an !== bn) return an.localeCompare(bn);
      return (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "");
    });
  }, [proc, edits, studentMap, subjectMap, studentQuery, statusFilter, status]);

  const dirtyIds = Object.keys(edits);
  const dirtyCount = dirtyIds.length;

  function updateField(id: string, patch: Partial<ProcRow>) {
    setEdits((prev) => {
      const base = prev[id] ?? {};
      const merged = { ...base, ...patch };
      // Auto-recompute ca_total & total_score & grade when component parts change and settings available
      const rowNow = { ...(proc?.find((r) => r.id === id) ?? {}), ...merged } as ProcRow;
      const ca1 = rowNow.ca1_score ?? 0;
      const ca2 = rowNow.ca2_score ?? 0;
      const ca3 = rowNow.ca3_score ?? 0;
      const caTotal = ca1 + ca2 + ca3;
      merged.ca_total = caTotal;
      if (activeGradingScale?.bands && activeGradingScale.bands.length > 0) {
        // Recompute total_score from component scores using the active structure
        const scoreMap: Record<string, number | null> = {};
        if (rowNow.ca1_score != null) scoreMap["CA1"] = rowNow.ca1_score;
        if (rowNow.ca2_score != null) scoreMap["CA2"] = rowNow.ca2_score;
        if (rowNow.ca3_score != null) scoreMap["CA3"] = rowNow.ca3_score;
        if (rowNow.exam_score != null) scoreMap["EXAM"] = rowNow.exam_score;
        const recomputed = activeStructure?.components
          ? computeDynamicTotalScore(activeStructure.components, scoreMap)
          : null;
        if (recomputed != null) merged.total_score = recomputed;
        const g = gradeForDynamicScale(activeGradingScale.bands, merged.total_score ?? null);
        merged.grade = g?.grade ?? merged.grade ?? null;
        merged.remark = g?.remark ?? merged.remark ?? null;
      } else if (settings) {
        // Convention: stored ca/exam values are already the weighted contribution
        // (e.g. CA1 out of ca1_weight, Exam out of exam_weight) so total = sum.
        const total = caTotal + (rowNow.exam_score ?? 0);
        merged.total_score = Number(total.toFixed(2));
        const g = gradeFor(settings, merged.total_score);
        merged.grade = g?.grade ?? merged.grade ?? null;
        merged.remark = g?.remark ?? merged.remark ?? null;
      }
      return { ...prev, [id]: merged };
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const updates = dirtyIds.map((id) => {
        const patch = edits[id];
        return supabase.from("processed_results").update({
          ca1_score: patch.ca1_score,
          ca2_score: patch.ca2_score,
          ca3_score: patch.ca3_score,
          ca_total: patch.ca_total,
          exam_score: patch.exam_score,
          total_score: patch.total_score,
          grade: patch.grade,
          remark: patch.remark,
        }).eq("id", id);
      });
      const results = await Promise.all(updates);
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
    },
    onSuccess: () => {
      toast.success(`${dirtyCount} row(s) saved`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["rev-processed"] });
      qc.invalidateQueries({ queryKey: ["proc-runs"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Review Processed Results
            </h2>
            <p className="text-sm text-muted-foreground">
              Inspect and correct any computation before approval. Published results become read-only.
            </p>
          </div>
          {scopeReady && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={status === "published" ? "default" : status === "approved" ? "outline" : "secondary"}>
                {status.toUpperCase()}
              </Badge>
              {isLocked && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> read-only</span>}
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Session">
            <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setTermId(undefined); setClassId(undefined); }}>
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
          <Field label="Show">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All (current scope)</SelectItem>
                <SelectItem value="draft">Only if draft (pre-approval)</SelectItem>
                <SelectItem value="approved">Only if approved</SelectItem>
                <SelectItem value="published">Only if published</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <div className="relative w-full max-w-sm">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search student or subject…" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {rows.length} row(s){dirtyCount ? ` • ${dirtyCount} unsaved` : ""}
            </span>
            <Button onClick={() => save.mutate()} disabled={isLocked || dirtyCount === 0 || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save changes
            </Button>
          </div>
        </div>

        {!scopeReady && <p className="text-sm text-muted-foreground">Select session, term and class to load processed results.</p>}
        {isApprovedView && !isLocked && (
          <p className="text-xs text-amber-600">
            These results are already approved. Editing here will not automatically re-approve — you can unapprove & re-run processing from the Approve & Publish tab if a major recomputation is needed.
          </p>
        )}
      </Card>

      {scopeReady && (
        <Card className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Student</TableHead>
                <TableHead className="min-w-[140px]">Subject</TableHead>
                {activeStructure?.components && activeStructure.components.length > 0 ? (
                  activeStructure.components.map((c) => (
                    <TableHead key={c.code} className="w-20" title={`${c.name} (Max: ${c.max_score}, Weight: ${c.weight_percentage}%)`}>
                      {c.code} <span className="text-[10px] text-muted-foreground">({c.max_score})</span>
                    </TableHead>
                  ))
                ) : (
                  <>
                    <TableHead className="w-16">CA1</TableHead>
                    <TableHead className="w-16">CA2</TableHead>
                    <TableHead className="w-16">CA3</TableHead>
                    <TableHead className="w-16">CA Tot</TableHead>
                    <TableHead className="w-20">Exam</TableHead>
                  </>
                )}
                <TableHead className="w-20">Total</TableHead>
                <TableHead className="w-16">Grade</TableHead>
                <TableHead className="w-24">Remark</TableHead>
                <TableHead className="w-20">Subj Pos</TableHead>
                <TableHead className="w-20">Cls Pos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isFetching && rows.length === 0 && (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isFetching && rows.length === 0 && (
                <TableRow><TableCell colSpan={14} className="text-center py-8 text-sm text-muted-foreground">
                  No processed rows found for this scope. Run Process Results first.
                </TableCell></TableRow>
              )}
              {rows.map((r) => {
                const dirty = !!edits[r.id];
                return (
                  <TableRow key={r.id} className={dirty ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}>
                    <TableCell className="font-medium">
                      <div>{r.student?.full_name ?? "—"}</div>
                      {r.student?.admission_no && <div className="text-xs text-muted-foreground">{r.student.admission_no}</div>}
                    </TableCell>
                    <TableCell>{r.subject?.name ?? "—"}</TableCell>
                    {activeStructure?.components && activeStructure.components.length > 0 ? (
                      activeStructure.components.map((c) => {
                        const val = (r as any)[c.code.toLowerCase() + "_score"] ?? (c.code.toLowerCase().startsWith("exam") ? r.exam_score : (c.code === "CA1" ? r.ca1_score : c.code === "CA2" ? r.ca2_score : c.code === "CA3" ? r.ca3_score : null));
                        return (
                          <NumCell
                            key={c.code}
                            disabled={isLocked}
                            maxScore={c.max_score}
                            value={val}
                            onChange={(v) => updateField(r.id, { [(c.code.toLowerCase().startsWith("exam") ? "exam" : c.code.toLowerCase()) + "_score"]: v })}
                          />
                        );
                      })
                    ) : (
                      <>
                        <NumCell disabled={isLocked} maxScore={15} value={r.ca1_score} onChange={(v) => updateField(r.id, { ca1_score: v })} />
                        <NumCell disabled={isLocked} maxScore={15} value={r.ca2_score} onChange={(v) => updateField(r.id, { ca2_score: v })} />
                        <NumCell disabled={isLocked} maxScore={15} value={r.ca3_score} onChange={(v) => updateField(r.id, { ca3_score: v })} />
                        <TableCell className="text-sm tabular-nums">{r.ca_total ?? "—"}</TableCell>
                        <NumCell disabled={isLocked} maxScore={70} value={r.exam_score} onChange={(v) => updateField(r.id, { exam_score: v })} />
                      </>
                    )}
                    <NumCell disabled={isLocked} maxScore={100} value={r.total_score} onChange={(v) => updateField(r.id, { total_score: v ?? 0 })} step="0.01" />
                    <TableCell>
                      <Input disabled={isLocked} className="h-8 w-14" value={r.grade ?? ""} onChange={(e) => updateField(r.id, { grade: e.target.value || null })} />
                    </TableCell>
                    <TableCell>
                      <Input disabled={isLocked} className="h-8 w-24" value={r.remark ?? ""} onChange={(e) => updateField(r.id, { remark: e.target.value || null })} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{r.subject_position ?? "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums">{r.class_position ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function NumCell({
  value, onChange, disabled, step, maxScore,
}: { value: number | null | undefined; onChange: (v: number | null) => void; disabled?: boolean; step?: string; maxScore?: number }) {
  const isInvalid = value != null && maxScore != null && (value < 0 || value > maxScore);

  return (
    <TableCell>
      <Input
        type="number"
        step={step ?? "1"}
        disabled={disabled}
        className={`h-8 w-16 tabular-nums ${isInvalid ? "border-red-500 bg-red-50 text-red-700 font-bold focus:ring-red-500" : ""}`}
        title={isInvalid ? `Score (${value}) exceeds maximum allowed (${maxScore})` : undefined}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") { onChange(null); return; }
          const n = Number(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </TableCell>
  );
}
