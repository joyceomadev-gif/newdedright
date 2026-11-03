import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";

/* ============================== Types ============================== */
interface ClassRow { id: string; name: string; level: string }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string }
interface SessionRow { id: string; name: string; is_current: boolean }
interface SubjectRow { id: string; name: string; class_id: string | null }
interface StudentRow { id: string; admission_no: string; full_name: string; class_id: string | null }

type LevelKey = "nursery" | "primary" | "secondary";
type ExamTypeKey = "cbt" | "written" | "practical" | "oral";

const LEVEL_OPTS: { value: LevelKey; label: string; matches: string[] }[] = [
  { value: "nursery", label: "Nursery", matches: ["nursery", "creche"] },
  { value: "primary", label: "Primary", matches: ["primary"] },
  { value: "secondary", label: "High / Secondary", matches: ["jss", "sss", "secondary", "high"] },
];

const EXAM_TYPES: { value: ExamTypeKey; label: string }[] = [
  { value: "written", label: "Written / Theory" },
  { value: "cbt", label: "CBT" },
  { value: "practical", label: "Practical" },
  { value: "oral", label: "Oral" },
];

const IMPORT_HEADERS = [
  "Admission No", "Student Name", "Subject", "CA1", "CA2", "CA3", "Exam", "Total",
] as const;

interface ParsedRow {
  admission: string;
  name: string;
  subject: string;
  ca1: number | null;
  ca2: number | null;
  ca3: number | null;
  exam: number | null;
  total: number | null;
  errors: string[];
  studentId?: string;
}

/* ============================== Component ============================== */
export function ResultImportPanel() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [termId, setTermId] = useState<string | undefined>();
  const [classId, setClassId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [level, setLevel] = useState<LevelKey | undefined>();
  const [examType, setExamType] = useState<ExamTypeKey>("written");
  const [caMax, setCaMax] = useState<number>(10);
  const [examMax, setExamMax] = useState<number>(60);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: sessions } = useQuery({
    queryKey: ["rimp-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["rimp-terms", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("terms")
        .select("id,name,is_current,session_id").eq("session_id", sessionId!).order("start_date");
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: classes } = useQuery({
    queryKey: ["rimp-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const { data: subjects } = useQuery({
    queryKey: ["rimp-subjects", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name,class_id").eq("class_id", classId!).order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });
  const { data: students } = useQuery({
    queryKey: ["rimp-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,admission_no,full_name,class_id").eq("class_id", classId!).eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });
  const { data: logs, refetch: refetchLogs } = useQuery({
    queryKey: ["rimp-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("result_import_log")
        .select("id, created_at, total_rows, imported_rows, rejected_rows, exam_type, max_score, class_id, term_id, subject_id, imported_by")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedClass = classes?.find((c) => c.id === classId);
  const selectedSubject = subjects?.find((s) => s.id === subjectId);
  const selectedTerm = terms?.find((t) => t.id === termId);
  const totalMax = caMax * 3 + examMax;
  const ready = sessionId && termId && classId && subjectId && level && examType && caMax > 0 && examMax > 0;

  /* -------- Level auto-suggest from class -------- */
  const suggestedLevel = useMemo<LevelKey | undefined>(() => {
    const lvl = (selectedClass?.level ?? "").toLowerCase();
    return LEVEL_OPTS.find((o) => o.matches.some((m) => lvl.includes(m)))?.value;
  }, [selectedClass]);
  useEffect(() => { if (suggestedLevel && !level) setLevel(suggestedLevel); }, [suggestedLevel, level]);

  /* ============================ Template ============================ */
  const downloadTemplate = () => {
    if (!classId || !subjectId || !students || !selectedSubject) {
      toast.error("Choose class and subject first.");
      return;
    }
    const rows = students.map((s) => ({
      "Admission No": s.admission_no,
      "Student Name": s.full_name,
      "Subject": selectedSubject.name,
      "CA1": "",
      "CA2": "",
      "CA3": "",
      "Exam": "",
      "Total": "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...IMPORT_HEADERS] });
    // Header row hint via a second sheet
    const info = XLSX.utils.aoa_to_sheet([
      ["Instruction", "Value"],
      ["Session", sessions?.find((s) => s.id === sessionId)?.name ?? ""],
      ["Term", selectedTerm?.name ?? ""],
      ["Class", selectedClass?.name ?? ""],
      ["Subject", selectedSubject.name],
      ["Level", LEVEL_OPTS.find((o) => o.value === level)?.label ?? ""],
      ["Exam Type", EXAM_TYPES.find((o) => o.value === examType)?.label ?? ""],
      ["Max CA (each)", caMax],
      ["Max Exam", examMax],
      ["Max Total", totalMax],
      ["Note", "Fill CA1, CA2, CA3 and Exam. Total is computed on import if blank."],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scores");
    XLSX.utils.book_append_sheet(wb, info, "Info");
    const filename = `results-${selectedClass?.name ?? "class"}-${selectedSubject.name}-${selectedTerm?.name ?? "term"}.xlsx`
      .replace(/[^\w.-]+/g, "_");
    XLSX.writeFile(wb, filename);
  };

  /* ============================ Parse & Validate ============================ */
  const handleFile = async (f: File) => {
    setFile(f);
    setParsed(null);
    if (!classId || !subjectId || !students || !selectedSubject) {
      toast.error("Choose class and subject first.");
      return;
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets["Scores"] ?? wb.Sheets[wb.SheetNames[0]];
    if (!sheet) { toast.error("No sheet found."); return; }
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const byAdmission = new Map(students.map((s) => [s.admission_no.trim().toLowerCase(), s]));
    const seen = new Set<string>();

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(String(v).trim());
      return Number.isFinite(n) ? n : NaN;
    };

    const rows: ParsedRow[] = raw.map((r) => {
      const errors: string[] = [];
      const admission = String(r["Admission No"] ?? r["admission no"] ?? "").trim();
      const name = String(r["Student Name"] ?? r["student name"] ?? "").trim();
      const subject = String(r["Subject"] ?? r["subject"] ?? "").trim();
      const ca1 = num(r["CA1"] ?? r["Ca1"] ?? r["ca1"]);
      const ca2 = num(r["CA2"] ?? r["Ca2"] ?? r["ca2"]);
      const ca3 = num(r["CA3"] ?? r["Ca3"] ?? r["ca3"]);
      const exam = num(r["Exam"] ?? r["exam"]);
      let total = num(r["Total"] ?? r["total"]);

      if (!admission) errors.push("Missing admission no.");
      const stu = byAdmission.get(admission.toLowerCase());
      if (admission && !stu) errors.push("Student not in selected class.");
      if (subject && subject.toLowerCase() !== selectedSubject.name.toLowerCase()) errors.push(`Subject mismatch (expected ${selectedSubject.name}).`);
      const bounds: [string, number | null, number][] = [
        ["CA1", ca1, caMax], ["CA2", ca2, caMax], ["CA3", ca3, caMax], ["Exam", exam, examMax],
      ];
      for (const [lbl, val, mx] of bounds) {
        if (val === null) continue;
        if (Number.isNaN(val)) errors.push(`${lbl} is not numeric.`);
        else if (val < 0 || val > mx) errors.push(`${lbl} must be 0–${mx}.`);
      }
      const compTotal = [ca1, ca2, ca3, exam].every((x) => x === null)
        ? null
        : (ca1 ?? 0) + (ca2 ?? 0) + (ca3 ?? 0) + (exam ?? 0);
      if (total === null || total === 0) total = compTotal;
      else if (compTotal !== null && Math.abs((total ?? 0) - compTotal) > 0.5) {
        errors.push(`Total (${total}) doesn't match sum (${compTotal}).`);
        total = compTotal;
      }
      if (stu) {
        if (seen.has(stu.id)) errors.push("Duplicate row for this student.");
        seen.add(stu.id);
      }
      return {
        admission, name, subject,
        ca1: Number.isNaN(ca1 as number) ? null : ca1,
        ca2: Number.isNaN(ca2 as number) ? null : ca2,
        ca3: Number.isNaN(ca3 as number) ? null : ca3,
        exam: Number.isNaN(exam as number) ? null : exam,
        total,
        errors,
        studentId: stu?.id,
      };
    });
    setParsed(rows);
  };

  /* ============================ Import ============================ */
  const runImport = async () => {
    if (!parsed || !ready || !selectedSubject) return;
    setImporting(true);
    try {
      const valid = parsed.filter((r) => r.errors.length === 0 && r.studentId);
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;

      // Find or create the exam anchor for (subject, class, term, type)
      const title = `${selectedTerm?.name ?? "Term"} ${EXAM_TYPES.find((e) => e.value === examType)?.label ?? "Exam"} — ${selectedSubject.name}`;
      let examId: string | undefined;
      {
        const { data: existing } = await supabase.from("exams")
          .select("id").eq("subject_id", subjectId!).eq("class_id", classId!).eq("term_id", termId!).eq("type", examType)
          .is("deleted_at", null).limit(1);
        if (existing && existing.length > 0) {
          examId = existing[0].id;
          await supabase.from("exams").update({ max_score: examMax }).eq("id", examId);
        } else {
          const { data: created, error: ce } = await supabase.from("exams").insert({
            title, subject_id: subjectId!, class_id: classId!, term_id: termId!, session_id: sessionId!,
            academic_session_id: sessionId!, type: examType, max_score: examMax, purpose: "exam", created_by: uid,
          }).select("id").single();
          if (ce) throw ce;
          examId = created!.id;
        }
      }

      let imported = 0;
      const failures: { admission: string; message: string }[] = [];
      for (const row of valid) {
        try {
          // Upsert CA rows
          for (const [caKey, caVal] of [["ca1", row.ca1], ["ca2", row.ca2], ["ca3", row.ca3]] as const) {
            if (caVal === null) continue;
            await supabase.from("continuous_assessments")
              .delete()
              .eq("student_id", row.studentId!)
              .eq("subject_id", subjectId!)
              .eq("term_id", termId!)
              .eq("ca_type", caKey);
            const { error: ie } = await supabase.from("continuous_assessments").insert({
              student_id: row.studentId!, subject_id: subjectId!, term_id: termId!, class_id: classId!,
              academic_session_id: sessionId!, ca_type: caKey, score: caVal, max_score: caMax, recorded_by: uid,
            });
            if (ie) throw ie;
          }
          // Upsert exam result
          if (row.exam !== null) {
            const { error: re } = await supabase.from("results")
              .upsert({ student_id: row.studentId!, exam_id: examId!, score: row.exam, recorded_by: uid, academic_session_id: sessionId! },
                { onConflict: "student_id,exam_id" });
            if (re) throw re;
          }
          imported++;
        } catch (e) {
          failures.push({ admission: row.admission, message: (e as Error).message });
        }
      }

      const rejected = parsed.length - imported;
      await supabase.from("result_import_log").insert({
        imported_by: uid, session_id: sessionId!, term_id: termId!, class_id: classId!, subject_id: subjectId!,
        exam_id: examId!, exam_type: examType, max_score: totalMax,
        total_rows: parsed.length, imported_rows: imported, rejected_rows: rejected,
        notes: failures.length ? failures.slice(0, 20).map((f) => `${f.admission}: ${f.message}`).join("; ") : null,
      });
      toast.success(`Imported ${imported}, rejected ${rejected}.`);
      qc.invalidateQueries();
      refetchLogs();
      setParsed(null);
      setFile(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsed?.filter((r) => r.errors.length === 0 && r.studentId).length ?? 0;
  const errorCount = parsed ? parsed.length - validCount : 0;

  /* ============================ UI ============================ */
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Result Import</h3>
          <p className="text-xs text-muted-foreground">Import CA1, CA2, CA3 and Exam scores from an Excel file for a class-subject.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Academic Session</Label>
            <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setTermId(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {(sessions ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Term</Label>
            <Select value={termId} onValueChange={setTermId} disabled={!sessionId}>
              <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>
                {(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id} className="capitalize">{t.name}{t.is_current ? " (current)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(undefined); setLevel(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Level</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as LevelKey)}>
              <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
              <SelectContent>
                {LEVEL_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Examination Type</Label>
            <Select value={examType} onValueChange={(v) => setExamType(v as ExamTypeKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXAM_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max CA (each)</Label>
            <Input type="number" min={1} value={caMax} onChange={(e) => setCaMax(Math.max(1, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max Exam</Label>
            <Input type="number" min={1} value={examMax} onChange={(e) => setExamMax(Math.max(1, Number(e.target.value) || 0))} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md border p-3 bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Template columns: <span className="font-mono">{IMPORT_HEADERS.join(", ")}</span>.
            &nbsp;Max Total: <span className="font-semibold">{totalMax}</span>
            &nbsp;· Students in class: <span className="font-semibold">{students?.length ?? 0}</span>
          </div>
          <Button size="sm" variant="outline" onClick={downloadTemplate} disabled={!ready || !students?.length}>
            <Download className="h-4 w-4 mr-1" />Download Template
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Excel file (.xlsx)</Label>
            <Input type="file" accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              disabled={!ready} />
          </div>
          <Button onClick={runImport} disabled={!parsed || validCount === 0 || importing}>
            {importing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing…</> : <><Upload className="h-4 w-4 mr-1" />Import {validCount} valid</>}
          </Button>
        </div>

        {parsed && (
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              <span>Total: <b>{parsed.length}</b></span>
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" />Valid: {validCount}</span>
              <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-4 w-4" />Errors: {errorCount}</span>
            </div>
            <div className="rounded-md border overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Admission</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">CA1</TableHead>
                    <TableHead className="text-center">CA2</TableHead>
                    <TableHead className="text-center">CA3</TableHead>
                    <TableHead className="text-center">Exam</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((r, i) => (
                    <TableRow key={i} className={r.errors.length ? "bg-destructive/5" : ""}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{r.admission}</TableCell>
                      <TableCell className="truncate max-w-[220px]">{r.name}</TableCell>
                      <TableCell className="text-center">{r.ca1 ?? "—"}</TableCell>
                      <TableCell className="text-center">{r.ca2 ?? "—"}</TableCell>
                      <TableCell className="text-center">{r.ca3 ?? "—"}</TableCell>
                      <TableCell className="text-center">{r.exam ?? "—"}</TableCell>
                      <TableCell className="text-center">{r.total ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.errors.length === 0
                          ? <Badge variant="outline" className="text-green-700 border-green-300">OK</Badge>
                          : <span className="text-destructive">{r.errors.join(" ")}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-sm">Recent imports</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Imported</TableHead>
                <TableHead className="text-center">Rejected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs ?? []).length === 0
                ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No imports yet.</TableCell></TableRow>
                : (logs ?? []).map((l) => (
                  <TableRow key={l.id as string}>
                    <TableCell className="text-xs">{new Date(l.created_at as string).toLocaleString()}</TableCell>
                    <TableCell>{classes?.find((c) => c.id === l.class_id)?.name ?? "—"}</TableCell>
                    <TableCell>{subjects?.find((s) => s.id === l.subject_id)?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{terms?.find((t) => t.id === l.term_id)?.name ?? "—"}</TableCell>
                    <TableCell className="capitalize">{l.exam_type as string ?? "—"}</TableCell>
                    <TableCell className="text-center">{l.total_rows as number}</TableCell>
                    <TableCell className="text-center text-green-700">{l.imported_rows as number}</TableCell>
                    <TableCell className="text-center text-destructive">{l.rejected_rows as number}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
