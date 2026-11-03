import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, Lock, Send, Eye, Save, FileSpreadsheet, Upload, RefreshCw } from "lucide-react";

import { useSchoolSettings } from "@/lib/scoring";
import { useResolvedAssessmentStructure } from "@/lib/assessment-config";
import {
  validateBroadsheetRows,
  broadsheetColumns,
  publishBroadsheetAndOpenPortal,
  unpublishBroadsheetAndClosePortal,
  populateBroadsheetFromCbtAndCas,
} from "@/lib/broadsheet";
import { exportBroadsheetToExcel, parseBroadsheetExcel } from "@/lib/broadsheet-excel";
export const Route = createFileRoute("/_authenticated/broadsheet")({
  component: BroadsheetPage,
});

interface Session { id: string; name: string; is_current: boolean }
interface Term { id: string; name: string; session_id: string; is_current: boolean }
interface Klass { id: string; name: string; level: string }
interface Student { id: string; full_name: string; admission_no?: string | null }
interface Subject { id: string; name: string }
interface Header {
  id: string; status: "draft" | "validated" | "published";
  validated_at: string | null; published_at: string | null;
}
interface BRow {
  id?: string; student_id: string; subject_id: string;
  ca1: number | null; ca2: number | null; ca3: number | null; exam_score: number | null;
  total_ca?: number | null; total_score?: number | null;
}
interface StudentComment {
  student_id: string; teacher_comment: string | null; principal_comment: string | null;
}

function BroadsheetPage() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string>("");
  const [termId, setTermId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: sessions } = useQuery({
    queryKey: ["bs-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error; return (data ?? []) as Session[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["bs-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,session_id,is_current").order("start_date", { ascending: false });
      if (error) throw error; return (data ?? []) as Term[];
    },
  });
  const { data: classes } = useQuery({
    queryKey: ["bs-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").order("name");
      if (error) throw error; return (data ?? []) as Klass[];
    },
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) setSessionId(sessions.find((s) => s.is_current)?.id ?? sessions[0].id);
  }, [sessions, sessionId]);
  useEffect(() => {
    if (!termId && terms?.length) {
      const t = terms.find((x) => x.session_id === sessionId && x.is_current) ?? terms.find((x) => x.session_id === sessionId);
      if (t) setTermId(t.id);
    }
  }, [terms, sessionId, termId]);

  const termsForSession = useMemo(() => (terms ?? []).filter((t) => t.session_id === sessionId), [terms, sessionId]);
  const currentClass = (classes ?? []).find((c) => c.id === classId);
  const isNursery = currentClass?.level === "nursery";
  const ready = Boolean(sessionId && termId && classId);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Broadsheet Result Entry</h1>
        <p className="text-sm text-muted-foreground">
          Spreadsheet-style result compilation. Once published, this becomes the official source for report cards, analytics, rankings and promotion.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="min-w-[180px]">
          <Label className="mb-1 block">Academic Session</Label>
          <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setTermId(""); }}>
            <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>{(sessions ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>
            ))}</SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="mb-1 block">Term</Label>
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
            <SelectContent>{termsForSession.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>
            ))}</SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Label className="mb-1 block">Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>{(classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name} <span className="text-xs text-muted-foreground">({c.level})</span></SelectItem>
            ))}</SelectContent>
          </Select>
        </div>
        {ready && (
          <Badge variant="secondary" className="ml-auto">
            {isNursery ? "Nursery Assessment mode" : "Score-based mode"}
          </Badge>
        )}
      </Card>

      {!ready && (
        <Card className="p-8 text-center text-muted-foreground">
          Select a session, term and class to begin.
        </Card>
      )}

      {ready && !isNursery && (
        <NumericBroadsheet
          sessionId={sessionId} termId={termId} classId={classId}
          onPreview={() => setPreviewOpen(true)}
        />
      )}
      {ready && isNursery && (
        <NurseryBroadsheet
          sessionId={sessionId} termId={termId} classId={classId}
          onPreview={() => setPreviewOpen(true)}
        />
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Sample Report Card</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Once this broadsheet is published, report cards for each student in this class are generated from the values entered here.
            Open <strong>Reports & Analytics → Report Cards & Broadsheet</strong> to view or print the full report cards using the class's assigned report template.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ Numeric grid (primary / secondary) ============================ */

export function NumericBroadsheet({ sessionId, termId, classId, onPreview }: {
  sessionId: string; termId: string; classId: string; onPreview: () => void;
}) {
  const qc = useQueryClient();

  const { data: students } = useQuery({
    queryKey: ["bs-students", classId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,admission_no").eq("class_id", classId).eq("status", "active").order("full_name");
      if (error) throw error; return (data ?? []) as Student[];
    },
    enabled: !!classId,
  });
  const { data: subjects } = useQuery({
    queryKey: ["bs-subjects", classId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects")
        .select("id,name").eq("class_id", classId).order("name");
      if (error) throw error; return (data ?? []) as Subject[];
    },
    enabled: !!classId,
  });

  const { data: header, refetch: refetchHeader } = useQuery({
    queryKey: ["bs-header", sessionId, termId, classId],
    queryFn: async () => {
      const { data, error } = await supabase.from("broadsheet_headers")
        .select("id,status,validated_at,published_at")
        .eq("session_id", sessionId).eq("term_id", termId).eq("class_id", classId).maybeSingle();
      if (error) throw error; return (data as Header | null);
    },
  });

  const { data: rows, refetch: refetchRows } = useQuery({
    queryKey: ["bs-rows", header?.id],
    queryFn: async () => {
      if (!header?.id) return [] as BRow[];
      const { data, error } = await supabase.from("broadsheets")
        .select("id,student_id,subject_id,ca1,ca2,ca3,exam_score,teacher_comment,principal_comment,total_ca,total_score")
        .eq("header_id", header.id);
      if (error) throw error; return (data ?? []) as BRow[];
    },
    enabled: !!header?.id,
  });

  const rowIndex = useMemo(() => {
    const m = new Map<string, BRow>();
    (rows ?? []).forEach((r) => m.set(`${r.student_id}|${r.subject_id}`, r));
    return m;
  }, [rows]);

  const { data: comments, refetch: refetchComments } = useQuery({
    queryKey: ["bs-comments", header?.id],
    queryFn: async () => {
      if (!header?.id) return [] as StudentComment[];
      const { data, error } = await supabase.from("broadsheet_student_comments")
        .select("student_id,teacher_comment,principal_comment").eq("header_id", header.id);
      if (error) throw error; return (data ?? []) as StudentComment[];
    },
    enabled: !!header?.id,
  });

  const [dirty, setDirty] = useState<Record<string, BRow>>({});
  const [dirtyComments, setDirtyComments] = useState<Record<string, StudentComment>>({});
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readOnly = header?.status !== "draft" && !!header;

  const { data: classObj } = useQuery({
    queryKey: ["bs-class-obj", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").eq("id", classId).single();
      if (error) throw error;
      return data as Klass;
    },
  });

  const { data: sessionObj } = useQuery({
    queryKey: ["bs-session-obj", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name").eq("id", sessionId).single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });

  const { data: termObj } = useQuery({
    queryKey: ["bs-term-obj", termId],
    enabled: !!termId,
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name").eq("id", termId).single();
      if (error) throw error;
      return data as { id: string; name: string };
    },
  });

  // Dynamic assessment structure: resolve by class level (e.g. primary)
  const { data: activeStructure } = useResolvedAssessmentStructure(classId, null, termId, sessionId, classObj?.level);
  const { data: settings } = useSchoolSettings();

  const showCa1 = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components.some((c) => c.code.toUpperCase() === "CA1") || (rows ?? []).some((r) => r.ca1 != null);
    }
    return (settings?.ca1_weight ?? 15) > 0 || (rows ?? []).some((r) => r.ca1 != null);
  }, [activeStructure, settings, rows]);

  const showCa2 = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components.some((c) => c.code.toUpperCase() === "CA2") || (rows ?? []).some((r) => r.ca2 != null);
    }
    return (settings?.ca2_weight ?? 15) > 0 || (rows ?? []).some((r) => r.ca2 != null);
  }, [activeStructure, settings, rows]);

  const showCa3 = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components.some((c) => c.code.toUpperCase() === "CA3") || (rows ?? []).some((r) => r.ca3 != null);
    }
    return (settings?.ca3_weight ?? 0) > 0 || (rows ?? []).some((r) => r.ca3 != null);
  }, [activeStructure, settings, rows]);

  const showExam = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components.some((c) => c.code.toUpperCase() === "EXAM") || (rows ?? []).some((r) => r.exam_score != null);
    }
    return (settings?.exam_weight ?? 70) > 0 || (rows ?? []).some((r) => r.exam_score != null);
  }, [activeStructure, settings, rows]);

  const activeColCount = [showCa1, showCa2, showCa3, showExam].filter(Boolean).length + 2; // +2 for ∑CA and Total

  function keyFor(s: string, sub: string) { return `${s}|${sub}`; }
  function get(sId: string, subId: string): BRow {
    const k = keyFor(sId, subId);
    return dirty[k] ?? rowIndex.get(k) ?? {
      student_id: sId, subject_id: subId,
      ca1: null, ca2: null, ca3: null, exam_score: null,
    };
  }
  function edit(sId: string, subId: string, patch: Partial<BRow>) {
    if (readOnly) return;
    const k = keyFor(sId, subId);
    setDirty((d) => ({ ...d, [k]: { ...get(sId, subId), ...patch } }));
  }

  const commentIndex = useMemo(() => {
    const m = new Map<string, StudentComment>();
    (comments ?? []).forEach((c) => m.set(c.student_id, c));
    return m;
  }, [comments]);
  function getComment(sId: string): StudentComment {
    return dirtyComments[sId] ?? commentIndex.get(sId) ?? { student_id: sId, teacher_comment: null, principal_comment: null };
  }
  function editComment(sId: string, patch: Partial<StudentComment>) {
    if (readOnly) return;
    setDirtyComments((d) => ({ ...d, [sId]: { ...getComment(sId), ...patch } }));
  }

  const createHeader = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("broadsheet_headers")
        .insert({ session_id: sessionId, term_id: termId, class_id: classId, status: "draft", created_by: u.user?.id })
        .select("id,status,validated_at,published_at").single();
      if (error) throw error;

      // Auto-populate from existing CBT exams and CAs
      const popRes = await populateBroadsheetFromCbtAndCas(
        supabase,
        {
          headerId: data.id,
          sessionId,
          termId,
          classId,
        },
        {
          componentMax,
          persistToDb: true,
        }
      ).catch((err) => {
        console.warn("Auto-population warning:", err);
        return { populatedCount: 0, matchedStudents: 0, caScoresCount: 0, examScoresCount: 0, patches: {} };
      });

      return { header: data as Header, popRes };
    },
    onSuccess: ({ popRes }) => {
      if (popRes.populatedCount > 0) {
        toast.success(
          `Broadsheet started. Auto-populated ${popRes.populatedCount} score(s) across ${popRes.matchedStudents} student(s) from CBT exams & CAs.`
        );
      } else {
        toast.success("Broadsheet started. Ready for manual score entry or Excel import.");
      }
      refetchHeader();
      refetchRows();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to start"),
  });

  const syncCbtMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("No broadsheet yet");
      return await populateBroadsheetFromCbtAndCas(
        supabase,
        {
          headerId: header.id,
          sessionId,
          termId,
          classId,
        },
        {
          componentMax,
          persistToDb: false,
        }
      );
    },
    onSuccess: (res) => {
      if (res.populatedCount === 0) {
        toast.info("No CBT exam attempts or CA records found for this class and term.");
        return;
      }
      setDirty((prev) => {
        const next = { ...prev };
        for (const [key, patch] of Object.entries(res.patches)) {
          const existing = next[key] ?? rowIndex.get(key) ?? {
            student_id: patch.student_id,
            subject_id: patch.subject_id,
            ca1: null,
            ca2: null,
            ca3: null,
            exam_score: null,
          };
          const updated: BRow = { ...existing };
          if (patch.ca1 != null && existing.ca1 == null) updated.ca1 = patch.ca1;
          if (patch.ca2 != null && existing.ca2 == null) updated.ca2 = patch.ca2;
          if (patch.ca3 != null && existing.ca3 == null) updated.ca3 = patch.ca3;
          if (patch.exam_score != null && existing.exam_score == null) updated.exam_score = patch.exam_score;
          next[key] = updated;
        }
        return next;
      });
      toast.success(
        `Synced from CBT & CAs: ${res.populatedCount} score(s) across ${res.matchedStudents} student(s). Unsaved cells updated.`
      );
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to sync CBT & CA scores"),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("No broadsheet yet");
      const payload = Object.values(dirty).map((r) => ({
        header_id: header.id, session_id: sessionId, term_id: termId, class_id: classId,
        student_id: r.student_id, subject_id: r.subject_id,
        ca1: numOrNull(r.ca1), ca2: numOrNull(r.ca2), ca3: numOrNull(r.ca3),
        exam_score: numOrNull(r.exam_score),
      }));
      let count = 0;
      if (payload.length) {
        const { error } = await supabase.from("broadsheets").upsert(payload, {
          onConflict: "session_id,term_id,class_id,student_id,subject_id",
        });
        if (error) throw error;
        count += payload.length;
      }
      const commentPayload = Object.entries(dirtyComments).map(([student_id, c]) => ({
        header_id: header.id, session_id: sessionId, term_id: termId, class_id: classId,
        student_id, teacher_comment: c.teacher_comment || null, principal_comment: c.principal_comment || null,
      }));
      if (commentPayload.length) {
        const { error } = await supabase.from("broadsheet_student_comments").upsert(commentPayload, {
          onConflict: "session_id,term_id,class_id,student_id",
        });
        if (error) throw error;
        count += commentPayload.length;
      }
      return { count };
    },
    onSuccess: (r) => { toast.success(`Saved ${r.count} row(s)`); setDirty({}); setDirtyComments({}); refetchRows(); refetchComments(); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  // Resolve max_score for a component code from the active structure
  const componentMax = (code: string): number => {
    const comp = activeStructure?.components?.find(
      (c) => c.code.toUpperCase() === code.toUpperCase()
    );
    return comp?.max_score ?? (code.toUpperCase().startsWith("EXAM") ? 70 : 15);
  };

  function validate() {
    // Merge dirty + existing to compute
    const all: BRow[] = [];
    (students ?? []).forEach((st) => (subjects ?? []).forEach((sb) => all.push(get(st.id, sb.id))));

    return validateBroadsheetRows(all, {
      showCa1,
      showCa2,
      showCa3,
      showExam,
      componentMax,
      studentName: (id) => students?.find((s) => s.id === id)?.full_name ?? id,
      subjectName: (id) => subjects?.find((s) => s.id === id)?.name ?? id,
    });
  }

  const validateMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("Nothing to validate");
      if (Object.keys(dirty).length) await saveAll.mutateAsync();
      const bad = validate();
      if (bad.length) throw new Error(`Score entry out of bounds. Fix:\n${bad.slice(0, 5).join("\n")}${bad.length > 5 ? `\n…and ${bad.length - 5} more` : ""}`);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("broadsheet_headers")
        .update({ status: "validated", validated_at: new Date().toISOString(), validated_by: u.user?.id })
        .eq("id", header.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Broadsheet validated and locked"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Validation failed"),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("Nothing to publish");
      const { data: u } = await supabase.auth.getUser();
      // Flip status, copy comments into report_cards, and open the portal gate.
      await publishBroadsheetAndOpenPortal(supabase as any, {
        headerId: header.id,
        sessionId,
        termId,
        classId,
        publishedBy: u.user?.id ?? null,
      });
    },
    onSuccess: () => { toast.success("Broadsheet published — now the official source for reports"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Publish failed"),
  });

  const unlockMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) return;
      await unpublishBroadsheetAndClosePortal(supabase as any, {
        headerId: header.id,
        sessionId,
        termId,
        classId,
        publishedBy: null,
      });
    },
    onSuccess: () => { toast.success("Reopened for editing"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Unlock failed (admins only)"),
  });

  if (!header) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="font-medium text-foreground">No broadsheet exists for this session/term/class yet.</p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Start the broadsheet to begin grading. Any existing CBT exam scores and Continuous Assessments will be automatically loaded into the draft sheet. If none exist, you can enter grades manually or import them via Excel.
        </p>
        <Button onClick={() => createHeader.mutate()} disabled={createHeader.isPending}>
          {createHeader.isPending ? "Initializing..." : "Start Broadsheet"}
        </Button>
      </Card>
    );
  }

  if (!students?.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">No active students in this class.</p>
        <p className="text-sm">Add students to this class in <strong>Student Management</strong>, then return here.</p>
      </Card>
    );
  }
  if (!subjects?.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">No subjects configured for this class.</p>
        <p className="text-sm">Add subjects for this class in <strong>Academics</strong>, then return here.</p>
      </Card>
    );
  }

  const activeSubject = (subjects ?? []).find((s) => s.id === activeSubjectId);
  const activeStudent = (students ?? []).find((s) => s.id === activeStudentId);

  const handleExportExcel = () => {
    if (!students?.length || !subjects?.length) {
      toast.error("No student or subject data available to export");
      return;
    }
    const sessName = sessionObj?.name;
    const trmName = termObj?.name;
    try {
      exportBroadsheetToExcel({
        className: classObj?.name || "Class",
        sessionName: sessName,
        termName: trmName,
        students,
        subjects,
        showCa1,
        showCa2,
        showCa3,
        showExam,
        getScores: (stId, subId) => get(stId, subId),
        getComment: (stId) => getComment(stId),
      });
      toast.success("Broadsheet exported to Excel successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to export Excel file");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const buffer = await file.arrayBuffer();
      const result = parseBroadsheetExcel(buffer, {
        students: students || [],
        subjects: subjects || [],
        componentMax,
      });

      if (result.stats.matchedStudents === 0) {
        toast.error("No matching students found in the uploaded file. Check student names or admission numbers.");
        return;
      }

      setDirty((prev) => {
        const next = { ...prev };
        for (const [key, patch] of Object.entries(result.scorePatches)) {
          const existing = next[key] ?? rowIndex.get(key) ?? {
            student_id: patch.student_id,
            subject_id: patch.subject_id,
            ca1: null,
            ca2: null,
            ca3: null,
            exam_score: null,
          };
          next[key] = {
            ...existing,
            ...(patch.ca1 !== undefined ? { ca1: patch.ca1 } : {}),
            ...(patch.ca2 !== undefined ? { ca2: patch.ca2 } : {}),
            ...(patch.ca3 !== undefined ? { ca3: patch.ca3 } : {}),
            ...(patch.exam_score !== undefined ? { exam_score: patch.exam_score } : {}),
          };
        }
        return next;
      });

      setDirtyComments((prev) => {
        const next = { ...prev };
        for (const [sId, patch] of Object.entries(result.commentPatches)) {
          const existing = next[sId] ?? commentIndex.get(sId) ?? {
            student_id: sId,
            teacher_comment: null,
            principal_comment: null,
          };
          next[sId] = {
            ...existing,
            ...(patch.teacher_comment !== undefined ? { teacher_comment: patch.teacher_comment } : {}),
            ...(patch.principal_comment !== undefined ? { principal_comment: patch.principal_comment } : {}),
          };
        }
        return next;
      });

      toast.success(
        `Imported ${result.stats.updatedScores} score(s) across ${result.stats.matchedStudents} student(s). Review and click "Save" to persist.`
      );

      if (result.stats.warnings.length > 0) {
        toast.warning(
          `${result.stats.warnings.length} warning(s):\n${result.stats.warnings.slice(0, 3).join("\n")}${
            result.stats.warnings.length > 3 ? `\n…and ${result.stats.warnings.length - 3} more` : ""
          }`,
          { duration: 8000 }
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to parse Excel file");
    }
  };

  return (
    <Card className="p-3 space-y-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls"
        className="hidden"
      />
      <StatusBar
        status={header.status}
        onSave={() => saveAll.mutate()} saving={saveAll.isPending}
        dirtyCount={Object.keys(dirty).length + Object.keys(dirtyComments).length}
        onValidate={() => validateMut.mutate()} validating={validateMut.isPending}
        onPublish={() => publishMut.mutate()} publishing={publishMut.isPending}
        onUnlock={() => unlockMut.mutate()}
        onPreview={onPreview}
        onExport={handleExportExcel}
        onImport={handleImportClick}
        onSyncCbt={() => syncCbtMut.mutate()}
        syncingCbt={syncCbtMut.isPending}
      />

      {activeSubject && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-md text-xs text-primary font-medium animate-in fade-in duration-150">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span>Currently entering:</span>
          <span className="font-bold underline">{activeSubject.name}</span>
          {activeStudent && (
            <>
              <span className="text-muted-foreground">for</span>
              <span className="font-semibold text-foreground">{activeStudent.full_name}</span>
            </>
          )}
        </div>
      )}

      <div className="overflow-auto border rounded max-h-[70vh]">
        <table className="text-sm border-collapse min-w-max">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-20 bg-muted px-3 py-2 text-left border-r-2 border-r-primary/40 border-b min-w-[220px] align-bottom shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                Student
              </th>
              {subjects.map((sb, sbIdx) => {
                const isEven = sbIdx % 2 === 0;
                const isActive = activeSubjectId === sb.id;
                return (
                  <th
                    key={sb.id}
                    colSpan={activeColCount}
                    className={`px-3 py-2 text-center border-l border-b border-r-2 border-r-primary/40 font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-primary/25 text-primary ring-2 ring-primary ring-inset shadow-sm"
                        : isEven
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/90 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10px] font-mono font-medium uppercase px-1.5 py-0.5 rounded bg-background/80 border text-muted-foreground shadow-xs">
                        Subject {sbIdx + 1}
                      </span>
                      <span className="tracking-wide">{sb.name}</span>
                    </div>
                  </th>
                );
              })}
              <th colSpan={2} className="px-2 py-2 text-center border-l-2 border-l-primary/40 border-r border-b bg-muted/70 text-muted-foreground font-semibold whitespace-nowrap">
                Comments
              </th>
            </tr>
            <tr>
              {subjects.map((sb, sbIdx) => (
                <SubjectSubHeader
                  key={sb.id}
                  showCa1={showCa1}
                  showCa2={showCa2}
                  showCa3={showCa3}
                  showExam={showExam}
                  isEven={sbIdx % 2 === 0}
                  isActive={activeSubjectId === sb.id}
                />
              ))}
              <th className="px-2 py-1 text-[11px] font-semibold border-l-2 border-l-primary/40 border-r border-b text-center bg-muted whitespace-nowrap min-w-[160px]">Teacher Comment</th>
              <th className="px-2 py-1 text-[11px] font-semibold border-l border-r border-b text-center bg-muted whitespace-nowrap min-w-[160px]">Principal Comment</th>
            </tr>
          </thead>
          <tbody>
            {students.map((st) => {
              const c = getComment(st.id);
              return (
                <tr key={st.id} className="border-t hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background border-r-2 border-r-primary/40 px-3 py-1 whitespace-nowrap font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]">
                    {st.full_name}
                  </td>
                  {subjects.map((sb, sbIdx) => {
                    const r = get(st.id, sb.id);
                    const ca1Val = showCa1 && r.ca1 != null ? Number(r.ca1) : 0;
                    const ca2Val = showCa2 && r.ca2 != null ? Number(r.ca2) : 0;
                    const ca3Val = showCa3 && r.ca3 != null ? Number(r.ca3) : 0;
                    const examVal = showExam && r.exam_score != null ? Number(r.exam_score) : 0;
                    const totalCa = Math.round((ca1Val + ca2Val + ca3Val) * 100) / 100;
                    const total = Math.round((totalCa + examVal) * 100) / 100;
                    const has = [showCa1 && r.ca1 != null, showCa2 && r.ca2 != null, showCa3 && r.ca3 != null, showExam && r.exam_score != null].some(Boolean);
                    const invalid = Boolean(
                      (showCa1 && r.ca1 != null && (r.ca1 < 0 || r.ca1 > componentMax("CA1"))) ||
                      (showCa2 && r.ca2 != null && (r.ca2 < 0 || r.ca2 > componentMax("CA2"))) ||
                      (showCa3 && r.ca3 != null && (r.ca3 < 0 || r.ca3 > componentMax("CA3"))) ||
                      (showExam && r.exam_score != null && (r.exam_score < 0 || r.exam_score > componentMax("EXAM")))
                    );
                    return (
                      <NumericSubjectCells
                        key={sb.id}
                        row={r}
                        totalCa={totalCa}
                        total={total}
                        has={has}
                        invalid={invalid}
                        disabled={readOnly}
                        onEdit={(patch) => edit(st.id, sb.id, patch)}
                        showCa1={showCa1}
                        showCa2={showCa2}
                        showCa3={showCa3}
                        showExam={showExam}
                        isEven={sbIdx % 2 === 0}
                        isActive={activeSubjectId === sb.id}
                        subjectName={sb.name}
                        studentName={st.full_name}
                        onFocusCell={() => {
                          setActiveSubjectId(sb.id);
                          setActiveStudentId(st.id);
                        }}
                        onBlurCell={() => {
                          setActiveSubjectId(null);
                          setActiveStudentId(null);
                        }}
                        componentMax={componentMax}
                      />
                    );
                  })}
                  <TextCell className="border-l-2 border-l-primary/40" value={c.teacher_comment} onChange={(v) => editComment(st.id, { teacher_comment: v })} disabled={readOnly} placeholder="Teacher…" wide />
                  <TextCell value={c.principal_comment} onChange={(v) => editComment(st.id, { principal_comment: v })} disabled={readOnly} placeholder="Principal…" wide />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Columns per subject: {showCa1 && <>CA1 · </>}{showCa2 && <>CA2 · </>}{showCa3 && <>CA3 · </>}ΣCA (auto) · {showExam && <>Exam · </>}Total (auto). Thick borders and alternating colors clearly delineate each subject group. Teacher and Principal comments are entered once per student at the end of the row. Validation verifies that all entered marks are within configured component bounds.
      </p>
    </Card>
  );
}

function NumericSubjectCells({
  row,
  totalCa,
  total,
  has,
  invalid,
  disabled,
  onEdit,
  showCa1,
  showCa2,
  showCa3,
  showExam,
  isEven,
  isActive,
  subjectName,
  studentName,
  onFocusCell,
  onBlurCell,
  componentMax,
}: {
  row: BRow;
  totalCa: number;
  total: number;
  has: boolean;
  invalid: boolean;
  disabled?: boolean;
  onEdit: (patch: Partial<BRow>) => void;
  showCa1: boolean;
  showCa2: boolean;
  showCa3: boolean;
  showExam: boolean;
  isEven: boolean;
  isActive: boolean;
  subjectName: string;
  studentName: string;
  onFocusCell?: () => void;
  onBlurCell?: () => void;
  componentMax: (code: string) => number;
}) {
  const cols = broadsheetColumns(showCa1, showCa2, showCa3, showExam);
  return (
    <>
      {cols.map((col, idx) => {
        const isLast = idx === cols.length - 1;
        const rightBorder = isLast ? "border-r-2 border-r-primary/40" : "border-r border-border/60";
        const groupBg = isEven ? "" : "bg-muted/[0.08]";

        if (col.kind === "CA1") {
          return (
            <NumCell
              key={col.kind}
              value={row.ca1}
              onChange={(v) => onEdit({ ca1: v })}
              disabled={disabled}
              className={`${rightBorder} ${groupBg}`}
              title={`${subjectName} · CA1 (${studentName}) - Max: ${componentMax("CA1")}`}
              placeholder={`≤${componentMax("CA1")}`}
              onFocus={onFocusCell}
              onBlur={onBlurCell}
            />
          );
        }
        if (col.kind === "CA2") {
          return (
            <NumCell
              key={col.kind}
              value={row.ca2}
              onChange={(v) => onEdit({ ca2: v })}
              disabled={disabled}
              className={`${rightBorder} ${groupBg}`}
              title={`${subjectName} · CA2 (${studentName}) - Max: ${componentMax("CA2")}`}
              placeholder={`≤${componentMax("CA2")}`}
              onFocus={onFocusCell}
              onBlur={onBlurCell}
            />
          );
        }
        if (col.kind === "CA3") {
          return (
            <NumCell
              key={col.kind}
              value={row.ca3}
              onChange={(v) => onEdit({ ca3: v })}
              disabled={disabled}
              className={`${rightBorder} ${groupBg}`}
              title={`${subjectName} · CA3 (${studentName}) - Max: ${componentMax("CA3")}`}
              placeholder={`≤${componentMax("CA3")}`}
              onFocus={onFocusCell}
              onBlur={onBlurCell}
            />
          );
        }
        if (col.kind === "EXAM") {
          return (
            <NumCell
              key={col.kind}
              value={row.exam_score}
              onChange={(v) => onEdit({ exam_score: v })}
              disabled={disabled}
              className={`${rightBorder} ${groupBg}`}
              title={`${subjectName} · Exam (${studentName}) - Max: ${componentMax("EXAM")}`}
              placeholder={`≤${componentMax("EXAM")}`}
              onFocus={onFocusCell}
              onBlur={onBlurCell}
            />
          );
        }
        if (col.kind === "SUM_CA") {
          return (
            <td
              key={col.kind}
              title={`${subjectName} · Sum CA (${studentName})`}
              className={`border-l ${rightBorder} bg-muted/25 text-center px-2 py-1 text-xs font-medium tabular-nums min-w-[56px] ${groupBg}`}
            >
              {has ? totalCa : ""}
            </td>
          );
        }
        return (
          <td
            key={col.kind}
            title={`${subjectName} · Total (${studentName})`}
            className={`border-l ${rightBorder} bg-muted/40 text-center px-2 py-1 text-sm font-semibold tabular-nums min-w-[60px] ${
              invalid ? "text-destructive" : ""
            } ${groupBg}`}
          >
            {has ? total : ""}
          </td>
        );
      })}
    </>
  );
}

function SubjectSubHeader({
  showCa1,
  showCa2,
  showCa3,
  showExam,
  isEven,
  isActive,
}: {
  showCa1: boolean;
  showCa2: boolean;
  showCa3: boolean;
  showExam: boolean;
  isEven: boolean;
  isActive: boolean;
}) {
  const cols = broadsheetColumns(showCa1, showCa2, showCa3, showExam);
  return (
    <>
      {cols.map((c, idx) => {
        const isLast = idx === cols.length - 1;
        const rightBorder = isLast ? "border-r-2 border-r-primary/40" : "border-r border-border/60";
        return (
          <th
            key={c.kind}
            className={`px-2 py-1 text-[11px] font-semibold border-l ${rightBorder} border-b text-center whitespace-nowrap transition-colors ${c.w} ${
              isActive
                ? "bg-primary/15 text-primary"
                : isEven
                ? "bg-primary/5 text-foreground"
                : "bg-muted/60 text-foreground"
            }`}
          >
            {c.h}
          </th>
        );
      })}
    </>
  );
}

function NumCell({
  value,
  onChange,
  disabled,
  className,
  title,
  placeholder,
  onFocus,
  onBlur,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <td className={`border-l p-0 ${className ?? "border-r"}`}>
      <input
        type="number"
        step="any"
        disabled={disabled}
        title={title}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        onFocus={onFocus}
        onBlur={onBlur}
        className="w-full h-9 px-2 text-right text-sm bg-background outline-none placeholder:text-[10px] placeholder:text-muted-foreground/50 focus:bg-primary/10 focus:ring-2 focus:ring-primary focus:z-10 relative disabled:bg-muted/40 transition-colors"
      />
    </td>
  );
}
function TextCell({
  value,
  onChange,
  disabled,
  placeholder,
  wide,
  className,
}: {
  value: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  wide?: boolean;
  className?: string;
}) {
  return (
    <td className={`border-l border-r p-0 ${className ?? ""}`}>
      <input
        type="text" disabled={disabled} placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-9 px-2 text-sm bg-background outline-none focus:bg-primary/10 focus:ring-1 focus:ring-primary disabled:bg-muted/40 ${wide ? "min-w-[140px]" : ""}`}
      />
    </td>
  );
}

function numOrNull(v: any): number | null {
  if (v === "" || v === null || v === undefined || Number.isNaN(v)) return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
}

function StatusBar({
  status,
  onSave,
  saving,
  dirtyCount,
  onValidate,
  validating,
  onPublish,
  publishing,
  onUnlock,
  onPreview,
  onExport,
  onImport,
  onSyncCbt,
  syncingCbt,
}: {
  status: string;
  onSave: () => void;
  saving: boolean;
  dirtyCount: number;
  onValidate: () => void;
  validating: boolean;
  onPublish: () => void;
  publishing: boolean;
  onUnlock: () => void;
  onPreview: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onSyncCbt?: () => void;
  syncingCbt?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={status === "published" ? "default" : status === "validated" ? "secondary" : "outline"}>
        Status: {status}
      </Badge>
      {dirtyCount > 0 && <Badge variant="destructive">{dirtyCount} unsaved</Badge>}
      <div className="ml-auto flex gap-2 flex-wrap items-center">
        {onSyncCbt && status === "draft" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onSyncCbt}
            disabled={syncingCbt}
            title="Pull latest CBT exam results and CA scores into broadsheet"
          >
            <RefreshCw className={`h-4 w-4 mr-1 text-purple-600 ${syncingCbt ? "animate-spin" : ""}`} />
            Sync CBT & CAs
          </Button>
        )}
        {onExport && (
          <Button size="sm" variant="outline" onClick={onExport} title="Export spreadsheet matching on-screen broadsheet">
            <FileSpreadsheet className="h-4 w-4 mr-1 text-emerald-600" />
            Export Excel
          </Button>
        )}
        {onImport && status === "draft" && (
          <Button size="sm" variant="outline" onClick={onImport} title="Import marks from an edited Excel spreadsheet">
            <Upload className="h-4 w-4 mr-1 text-blue-600" />
            Import Excel
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onPreview}><Eye className="h-4 w-4 mr-1" />View Sample Report Card</Button>
        {status === "draft" && (
          <>
            <Button size="sm" variant="outline" onClick={onSave} disabled={saving || !dirtyCount}><Save className="h-4 w-4 mr-1" />Save</Button>
            <Button size="sm" onClick={onValidate} disabled={validating}><CheckCircle2 className="h-4 w-4 mr-1" />Validate</Button>
          </>
        )}
        {status === "validated" && (
          <>
            <Button size="sm" variant="outline" onClick={onUnlock}><Lock className="h-4 w-4 mr-1" />Reopen</Button>
            <Button size="sm" onClick={onPublish} disabled={publishing}><Send className="h-4 w-4 mr-1" />Approve & Publish</Button>
          </>
        )}
        {status === "published" && (
          <Button size="sm" variant="outline" onClick={onUnlock}><Lock className="h-4 w-4 mr-1" />Reopen (admin)</Button>
        )}
      </div>
    </div>
  );
}

/* ============================ Nursery grid ============================ */

interface NRow {
  id?: string; student_id: string; area_title: string; item_key: string;
  item_text: string | null; rating: number | null; subject_id: string | null;
}

function NurseryBroadsheet({ sessionId, termId, classId, onPreview }: {
  sessionId: string; termId: string; classId: string; onPreview: () => void;
}) {
  const { data: students } = useQuery({
    queryKey: ["nb-students", classId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name").eq("class_id", classId).eq("status", "active").order("full_name");
      if (error) throw error; return (data ?? []) as Student[];
    },
  });

  // Resolve the template to get competency items
  const { data: template } = useQuery({
    queryKey: ["nb-template", classId, termId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_report_template", { _class_id: classId, _term_id: termId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row?.layout ?? null;
    },
  });

  // Flatten competency items from template layout
  const items = useMemo(() => {
    const out: { area: string; key: string; text: string }[] = [];
    const layout = (template ?? {}) as any;
    const areas = (layout.competencyAreas ?? []) as Array<{ id?: string; title: string; items: string[] }>;
    for (const a of areas) {
      (a.items || []).forEach((it, idx) => {
        out.push({ area: a.title, key: `${a.id ?? a.title}::${idx}`, text: it });
      });
    }
    // fallback: any assessmentSections
    const secs = (layout.assessmentSections ?? []) as Array<{ id?: string; title: string; items: string[] }>;
    for (const a of secs) {
      (a.items || []).forEach((it, idx) => {
        out.push({ area: a.title, key: `${a.id ?? a.title}::${idx}`, text: it });
      });
    }
    return out;
  }, [template]);

  const { data: header, refetch: refetchHeader } = useQuery({
    queryKey: ["nb-header", sessionId, termId, classId],
    queryFn: async () => {
      const { data, error } = await supabase.from("nursery_broadsheet_headers")
        .select("id,status,validated_at,published_at")
        .eq("session_id", sessionId).eq("term_id", termId).eq("class_id", classId).maybeSingle();
      if (error) throw error; return (data as Header | null);
    },
  });

  const { data: rows, refetch: refetchRows } = useQuery({
    queryKey: ["nb-rows", header?.id],
    queryFn: async () => {
      if (!header?.id) return [] as NRow[];
      const { data, error } = await supabase.from("nursery_broadsheets")
        .select("id,student_id,area_title,item_key,item_text,rating,subject_id")
        .eq("header_id", header.id);
      if (error) throw error; return (data ?? []) as NRow[];
    },
    enabled: !!header?.id,
  });

  const { data: comments, refetch: refetchComments } = useQuery({
    queryKey: ["nb-comments", header?.id],
    queryFn: async () => {
      if (!header?.id) return [] as { student_id: string; teacher_comment: string | null }[];
      const { data, error } = await supabase.from("nursery_broadsheet_comments")
        .select("student_id,teacher_comment").eq("header_id", header.id);
      if (error) throw error; return data ?? [];
    },
    enabled: !!header?.id,
  });

  const ratingIndex = useMemo(() => {
    const m = new Map<string, number | null>();
    (rows ?? []).forEach((r) => m.set(`${r.student_id}|${r.area_title}|${r.item_key}`, r.rating));
    return m;
  }, [rows]);
  const commentIndex = useMemo(() => {
    const m = new Map<string, string>();
    (comments ?? []).forEach((c: any) => m.set(c.student_id, c.teacher_comment ?? ""));
    return m;
  }, [comments]);

  const [dirtyRatings, setDirtyRatings] = useState<Record<string, number | null>>({});
  const [dirtyComments, setDirtyComments] = useState<Record<string, string>>({});
  const readOnly = header?.status !== "draft" && !!header;

  function getRating(sId: string, area: string, key: string) {
    const k = `${sId}|${area}|${key}`;
    if (k in dirtyRatings) return dirtyRatings[k];
    return ratingIndex.get(k) ?? null;
  }
  function setRating(sId: string, area: string, key: string, r: number | null) {
    if (readOnly) return;
    setDirtyRatings((d) => ({ ...d, [`${sId}|${area}|${key}`]: r }));
  }
  function getComment(sId: string) {
    if (sId in dirtyComments) return dirtyComments[sId];
    return commentIndex.get(sId) ?? "";
  }
  function setComment(sId: string, v: string) {
    if (readOnly) return;
    setDirtyComments((d) => ({ ...d, [sId]: v }));
  }

  const createHeader = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("nursery_broadsheet_headers")
        .insert({ session_id: sessionId, term_id: termId, class_id: classId, status: "draft", created_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assessment started"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to start"),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("No assessment yet");
      const ratingPayload = Object.entries(dirtyRatings).map(([k, rating]) => {
        const [student_id, area_title, item_key] = k.split("|");
        const item = items.find((i) => i.area === area_title && i.key === item_key);
        return {
          header_id: header.id, session_id: sessionId, term_id: termId, class_id: classId,
          student_id, area_title, item_key, item_text: item?.text ?? null, rating,
        };
      });
      if (ratingPayload.length) {
        const { error } = await supabase.from("nursery_broadsheets").upsert(ratingPayload, {
          onConflict: "header_id,student_id,area_title,item_key",
        });
        if (error) throw error;
      }
      const commentPayload = Object.entries(dirtyComments).map(([student_id, teacher_comment]) => ({
        header_id: header.id, class_id: classId, student_id, teacher_comment,
      }));
      if (commentPayload.length) {
        const { error } = await supabase.from("nursery_broadsheet_comments").upsert(commentPayload, {
          onConflict: "header_id,student_id",
        });
        if (error) throw error;
      }
      return ratingPayload.length + commentPayload.length;
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} change(s)`);
      setDirtyRatings({}); setDirtyComments({}); refetchRows(); refetchComments();
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const validateMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("Nothing to validate");
      if (Object.keys(dirtyRatings).length || Object.keys(dirtyComments).length) await saveAll.mutateAsync();
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("nursery_broadsheet_headers")
        .update({ status: "validated", validated_at: new Date().toISOString(), validated_by: u.user?.id })
        .eq("id", header.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assessment validated and locked"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Validation failed"),
  });
  const publishMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) throw new Error("Nothing to publish");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("nursery_broadsheet_headers")
        .update({ status: "published", published_at: new Date().toISOString(), published_by: u.user?.id })
        .eq("id", header.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Assessment published"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Publish failed"),
  });
  const unlockMut = useMutation({
    mutationFn: async () => {
      if (!header?.id) return;
      const { error } = await supabase.from("nursery_broadsheet_headers")
        .update({ status: "draft", validated_at: null, published_at: null })
        .eq("id", header.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Reopened"); refetchHeader(); },
    onError: (e: any) => toast.error(e.message ?? "Unlock failed (admins only)"),
  });

  if (!header) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p>No assessment exists for this session/term/class yet.</p>
        <Button onClick={() => createHeader.mutate()} disabled={createHeader.isPending}>
          Input Assessment
        </Button>
      </Card>
    );
  }

  if (!items.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No competency items defined. Set up a nursery report template first in <strong>Report Templates</strong>, then return here.
      </Card>
    );
  }

  if (!students?.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">No active students in this class.</p>
        <p className="text-sm">Add students to this class in <strong>Student Management</strong>, then return here — the rating boxes appear once students exist.</p>
      </Card>
    );
  }

  // Group items by area
  const areaMap = new Map<string, { key: string; text: string }[]>();
  for (const it of items) {
    if (!areaMap.has(it.area)) areaMap.set(it.area, []);
    areaMap.get(it.area)!.push({ key: it.key, text: it.text });
  }
  const dirtyCount = Object.keys(dirtyRatings).length + Object.keys(dirtyComments).length;

  return (
    <Card className="p-3 space-y-3">
      <StatusBar
        status={header.status}
        onSave={() => saveAll.mutate()} saving={saveAll.isPending}
        dirtyCount={dirtyCount}
        onValidate={() => validateMut.mutate()} validating={validateMut.isPending}
        onPublish={() => publishMut.mutate()} publishing={publishMut.isPending}
        onUnlock={() => unlockMut.mutate()}
        onPreview={onPreview}
      />

      <div className="text-xs text-muted-foreground">
        Key: <span className="font-semibold">3</span> Excellent · <span className="font-semibold">2</span> Developing · <span className="font-semibold">1</span> Beginning · click again to clear.
      </div>

      <div className="overflow-auto border rounded">
        <table className="text-xs min-w-max">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 bg-muted px-2 py-2 text-left border-r min-w-[320px]">Competency Item</th>
              {(students ?? []).map((s) => (
                <th key={s.id} className="px-2 py-2 text-center border-l min-w-[110px] whitespace-nowrap">{s.full_name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(areaMap.entries()).map(([area, list]) => (
              <>
                <tr key={`area-${area}`} className="bg-primary/5">
                  <td colSpan={(students?.length ?? 0) + 1} className="px-2 py-1 font-semibold text-primary">{area}</td>
                </tr>
                {list.map((it) => (
                  <tr key={`${area}-${it.key}`} className="border-t">
                    <td className="sticky left-0 bg-background border-r px-2 py-1">{it.text}</td>
                    {(students ?? []).map((s) => {
                      const r = getRating(s.id, area, it.key);
                      return (
                        <td key={s.id} className="border-l p-1 text-center">
                          <RatingPicker value={r} disabled={readOnly} onChange={(v) => setRating(s.id, area, it.key, v)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
            <tr className="bg-primary/5 border-t">
              <td className="sticky left-0 bg-primary/5 px-2 py-1 font-semibold border-r">Teacher's Comment</td>
              {(students ?? []).map((s) => (
                <td key={s.id} className="border-l p-1">
                  <Textarea
                    className="text-xs min-h-[60px]" rows={2}
                    value={getComment(s.id)}
                    disabled={readOnly}
                    onChange={(e) => setComment(s.id, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RatingPicker({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const btn = (n: number, label: string) => (
    <button
      type="button" disabled={disabled}
      onClick={() => onChange(value === n ? null : n)}
      className={`w-7 h-7 rounded-full text-xs font-semibold border transition ${
        value === n ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
      } disabled:opacity-50`}
      title={label}
    >
      {n}
    </button>
  );
  return (
    <div className="flex gap-1 justify-center">
      {btn(3, "Excellent")}
      {btn(2, "Developing")}
      {btn(1, "Beginning")}
    </div>
  );
}
