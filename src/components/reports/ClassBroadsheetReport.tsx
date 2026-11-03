import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, FileSpreadsheet, FileText, Search, Building2, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useResolvedAssessmentStructure,
  useResolvedGradingScale,
  gradeForDynamicScale,
  computeDynamicTotalScore,
  AssessmentComponent,
} from "@/lib/assessment-config";
import { formatTermName } from "@/lib/scoring";
import { buildScoreMatrix } from "@/lib/broadsheet";

interface StudentRow { id: string; full_name: string; admission_no: string | null }
interface SubjectRow { id: string; name: string }
interface ClassRow { id: string; name: string; level?: string }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string }
interface SessionRow { id: string; name: string; is_current: boolean }
interface SchoolSettingRow { school_name: string | null }

export function ClassBroadsheetReport() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [termId, setTermId] = useState<string | undefined>();
  const [classId, setClassId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: schoolSetting } = useQuery({
    queryKey: ["broadsheet-school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("school_name").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data || { school_name: "School" }) as SchoolSettingRow;
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["broadsheet-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const currentSession = (sessions ?? []).find((s) => s.is_current);

  const { data: terms } = useQuery({
    queryKey: ["broadsheet-terms", sessionId],
    enabled: !!(sessionId ?? currentSession?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("terms")
        .select("id,name,is_current,session_id")
        .eq("session_id", (sessionId ?? currentSession?.id)!)
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const currentTerm = (terms ?? []).find((t) => t.is_current);

  const { data: classes } = useQuery({
    queryKey: ["broadsheet-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const selectedClassObj = (classes ?? []).find((c) => c.id === classId);

  const effSession = sessionId ?? currentSession?.id;
  const effTerm = termId ?? currentTerm?.id;
  const scopeReady = !!effSession && !!effTerm && !!classId;

  const { data: rawSubjects } = useQuery({
    queryKey: ["broadsheet-subjects", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,class_id")
        .or(`class_id.eq.${classId},class_id.is.null`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });

  const subjects = useMemo(() => {
    if (!rawSubjects) return [];
    const seen = new Set<string>();
    const unique: SubjectRow[] = [];
    for (const s of rawSubjects) {
      const key = s.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    }
    return unique;
  }, [rawSubjects]);

  // Resolve assessment structure and grading scale (passing class level e.g. 'primary')
  const { data: activeStructure } = useResolvedAssessmentStructure(classId, null, effTerm, effSession, selectedClassObj?.level);
  const { data: activeGradingScale } = useResolvedGradingScale(classId, null, selectedClassObj?.level);

  const rawComponentsList: AssessmentComponent[] = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components;
    }
    return [
      { id: "1", code: "CA1", name: "Continuous Assessment 1", max_score: 15, weight_percentage: 15, display_order: 1, is_mandatory: true },
      { id: "2", code: "CA2", name: "Continuous Assessment 2", max_score: 15, weight_percentage: 15, display_order: 2, is_mandatory: true },
      { id: "3", code: "EXAM", name: "End of Term Exam", max_score: 70, weight_percentage: 70, display_order: 3, is_mandatory: true },
    ];
  }, [activeStructure]);

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ["broadsheet-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,admission_no")
        .eq("class_id", classId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  // Query assessment scores from continuous_assessments, broadsheets & processed_results
  const { data: assessmentScores } = useQuery({
    queryKey: ["broadsheet-ca-scores", classId, effTerm],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("continuous_assessments")
        .select("student_id,subject_id,ca_type,score,max_score,title,created_at")
        .eq("class_id", classId!)
        .eq("term_id", effTerm!);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: broadsheetRows } = useQuery({
    queryKey: ["broadsheet-direct-rows", classId, effTerm, effSession],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("broadsheets")
        .select("student_id,subject_id,ca1,ca2,ca3,exam_score")
        .eq("class_id", classId!)
        .eq("term_id", effTerm!)
        .eq("session_id", effSession!);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: processedRows } = useQuery({
    queryKey: ["broadsheet-proc-rows", classId, effTerm, effSession],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("processed_results")
        .select("student_id,subject_id,ca1_score,ca2_score,ca3_score,exam_score")
        .eq("class_id", classId!)
        .eq("term_id", effTerm!)
        .eq("session_id", effSession!);
      if (error) throw error;
      return data || [];
    },
  });

  // Map scores: studentId -> subjectId -> compCode -> score
  // Shared builder: processed (rescaled 0-100%) → CA (deduped, legacy-rescaled) → raw broadsheet rows (authoritative)
  const scoreMatrix = useMemo(() => {
    const compMax = (code: string): number => {
      const c = rawComponentsList.find((x) => x.code.toUpperCase() === code.toUpperCase());
      return c?.max_score ?? (code.toUpperCase().startsWith("EXAM") ? 70 : 15);
    };
    return buildScoreMatrix(processedRows ?? [], assessmentScores ?? [], broadsheetRows ?? [], compMax);
  }, [assessmentScores, broadsheetRows, processedRows, rawComponentsList]);

  // Final componentsList: if structure is resolved for the level, use it directly; if fallback, omit empty unconfigured components (like CA2 with no scores)
  const componentsList = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components;
    }
    const codesWithData = new Set<string>();
    for (const stMap of Object.values(scoreMatrix)) {
      for (const subMap of Object.values(stMap)) {
        for (const [code, val] of Object.entries(subMap)) {
          if (val != null && !Number.isNaN(val)) codesWithData.add(code.toUpperCase());
        }
      }
    }
    return rawComponentsList.filter((c) => codesWithData.has(c.code.toUpperCase()) || c.code.toUpperCase() === "CA1" || c.code.toUpperCase() === "EXAM");
  }, [activeStructure, rawComponentsList, scoreMatrix]);

  // computeDynamicTotalScore is normalized to 0-100 when weights exist, so averages
  // consume it directly; only weight-less component lists need max-sum normalization.
  const hasWeights = componentsList.some((c) => Number(c.weight_percentage) > 0);

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.admission_no?.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  const selectedSessionName = (sessions ?? []).find((s) => s.id === effSession)?.name || "";
  const rawTermName = (terms ?? []).find((t) => t.id === effTerm)?.name || "";
  const selectedTermName = formatTermName(rawTermName);

  // Export to Excel
  function exportToExcel() {
    if (!scopeReady || !students || students.length === 0) {
      toast.error("No data available to export");
      return;
    }

    const headerRow1 = ["Admission No", "Student Name"];
    const headerRow2 = ["", ""];

    (subjects || []).forEach((sub) => {
      componentsList.forEach((c) => {
        headerRow1.push(sub.name);
        headerRow2.push(c.code);
      });
      headerRow1.push(sub.name); headerRow2.push("Total");
      headerRow1.push(sub.name); headerRow2.push("Grade");
    });
    headerRow1.push("Summary"); headerRow2.push("Average (%)");

    const dataRows: any[][] = [headerRow1, headerRow2];

    filteredStudents.forEach((st) => {
      const row: any[] = [st.admission_no || "—", st.full_name];
      let grandTotal = 0;
      let countedSubj = 0;

      (subjects || []).forEach((sub) => {
        const subMap = scoreMatrix[st.id]?.[sub.id] || {};
        const computedVal = computeDynamicTotalScore(componentsList, subMap);
        const hasSub = computedVal != null;
        const subTotal = computedVal ?? 0;
        const totalStructureWeight = componentsList.reduce((a, b) => a + (b.weight_percentage || b.max_score || 0), 0) || 100;

        componentsList.forEach((c) => {
          const val = subMap[c.code];
          row.push(val != null ? val : "—");
        });

        if (hasSub) {
          const normalizedPct = hasWeights ? subTotal : (subTotal / totalStructureWeight) * 100;
          grandTotal += normalizedPct;
          countedSubj += 1;
          row.push(subTotal);
          const g = activeGradingScale?.bands ? gradeForDynamicScale(activeGradingScale.bands, subTotal)?.grade : "—";
          row.push(g || "—");
        } else {
          row.push("—"); row.push("—");
        }
      });

      const avg = countedSubj > 0 ? (Math.round((grandTotal / countedSubj) * 100) / 100) + "%" : "—";
      row.push(avg);
      dataRows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Class Broadsheet");
    XLSX.writeFile(wb, `Class_Broadsheet_${selectedClassObj?.name || "Report"}.xlsx`);
    toast.success("Excel broadsheet exported successfully");
  }

  // Export to PDF
  function exportToPDF() {
    if (!scopeReady || !students || students.length === 0) {
      toast.error("No data available to export");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const schoolName = schoolSetting?.school_name || "Academic Institution";

    doc.setFontSize(16);
    doc.text(schoolName, 14, 15);
    doc.setFontSize(11);
    doc.text(`Class Performance Broadsheet — ${selectedClassObj?.name || ""} (${selectedSessionName} - ${selectedTermName})`, 14, 22);

    const head1: any[] = ["Adm No", "Student Name"];
    const head2: any[] = ["", ""];

    (subjects || []).forEach((sub) => {
      componentsList.forEach((c) => {
        head1.push(sub.name);
        head2.push(c.code);
      });
      head1.push(sub.name); head2.push("Tot");
      head1.push(sub.name); head2.push("Grd");
    });
    head1.push("Overall"); head2.push("Avg %");

    const body: any[][] = [];

    filteredStudents.forEach((st) => {
      const row: any[] = [st.admission_no || "—", st.full_name];
      let grandTotal = 0;
      let countedSubj = 0;

      (subjects || []).forEach((sub) => {
        const subMap = scoreMatrix[st.id]?.[sub.id] || {};
        const computedVal = computeDynamicTotalScore(componentsList, subMap);
        const hasSub = computedVal != null;
        const subTotal = computedVal ?? 0;
        const totalStructureWeight = componentsList.reduce((a, b) => a + (b.weight_percentage || b.max_score || 0), 0) || 100;

        componentsList.forEach((c) => {
          const val = subMap[c.code];
          row.push(val != null ? val : "—");
        });

        if (hasSub) {
          const normalizedPct = hasWeights ? subTotal : (subTotal / totalStructureWeight) * 100;
          grandTotal += normalizedPct;
          countedSubj += 1;
          row.push(subTotal);
          const g = activeGradingScale?.bands ? gradeForDynamicScale(activeGradingScale.bands, subTotal)?.grade : "—";
          row.push(g || "—");
        } else {
          row.push("—"); row.push("—");
        }
      });

      const avg = countedSubj > 0 ? (Math.round((grandTotal / countedSubj) * 100) / 100) + "%" : "—";
      row.push(avg);
      body.push(row);
    });

    autoTable(doc, {
      head: [head1, head2],
      body: body,
      startY: 28,
      styles: { fontSize: 7, cellPadding: 1.5, halign: "center" } as any,
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" } as any,
    });

    doc.save(`Broadsheet_${selectedClassObj?.name || "Report"}.pdf`);
    toast.success("PDF broadsheet generated successfully");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Class Broadsheet Performance Report
            </h3>
            <p className="text-xs text-muted-foreground">
              Comprehensive class-level performance broadsheet with dynamic assessment components, totals, average %, and export capabilities.
            </p>
          </div>
          {scopeReady && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={exportToExcel} className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel
              </Button>
              <Button size="sm" onClick={exportToPDF} className="gap-1.5">
                <FileText className="h-4 w-4" /> Export PDF
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Session</Label>
            <Select value={sessionId ?? currentSession?.id} onValueChange={setSessionId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>{(sessions ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Term</Label>
            <Select value={termId ?? currentTerm?.id} onValueChange={setTermId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>{(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{formatTermName(t.name)}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!scopeReady ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Select Session, Term, and Class to generate the Class Broadsheet Report.
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <div className="p-3 border-b flex items-center justify-between gap-3 bg-muted/20">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search student name or adm no…"
                className="pl-8 h-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Class: <span className="font-semibold text-foreground">{selectedClassObj?.name}</span> • Students: <span className="font-semibold text-foreground">{filteredStudents.length}</span>
            </div>
          </div>

          <Table className="text-xs">
            <TableHeader>
              <TableRow className="bg-muted/60 divide-x">
                <TableHead className="min-w-[180px]" rowSpan={2}>Student Name</TableHead>
                <TableHead className="w-24" rowSpan={2}>Adm No</TableHead>
                {(subjects || []).map((sub) => (
                  <TableHead key={sub.id} colSpan={componentsList.length + 2} className="text-center font-bold text-primary border-l">
                    {sub.name}
                  </TableHead>
                ))}
                <TableHead className="w-28 text-center" rowSpan={2}>Overall Avg (%)</TableHead>
              </TableRow>

              <TableRow className="bg-muted/30 divide-x">
                {(subjects || []).flatMap((sub) => [
                  ...componentsList.map((c) => (
                    <TableHead key={`${sub.id}-${c.code}`} className="text-center w-14 px-1 font-mono text-[10px]">
                      {c.code}
                    </TableHead>
                  )),
                  <TableHead key={`${sub.id}-total`} className="text-center w-14 px-1 font-bold">Tot</TableHead>,
                  <TableHead key={`${sub.id}-grade`} className="text-center w-12 px-1 font-bold">Grd</TableHead>,
                ])}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loadingStudents ? (
                <TableRow><TableCell colSpan={((subjects?.length || 0) * (componentsList.length + 2)) + 3} className="text-center py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading broadsheet data…</TableCell></TableRow>
              ) : filteredStudents.length === 0 ? (
                <TableRow><TableCell colSpan={((subjects?.length || 0) * (componentsList.length + 2)) + 3} className="text-center py-8 text-sm text-muted-foreground">No student records found.</TableCell></TableRow>
              ) : (
                filteredStudents.map((st) => {
                  let grandTotal = 0;
                  let countedSubj = 0;

                  return (
                    <TableRow key={st.id} className="divide-x">
                      <TableCell className="font-medium text-xs">
                        {st.full_name}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {st.admission_no || "—"}
                      </TableCell>

                      {(subjects || []).map((sub) => {
                        const subMap = scoreMatrix[st.id]?.[sub.id] || {};
                        const computedVal = computeDynamicTotalScore(componentsList, subMap);
                        const hasSub = computedVal != null;
                        const subTotal = computedVal ?? 0;
                        const totalStructureWeight = componentsList.reduce((a, b) => a + (b.weight_percentage || b.max_score || 0), 0) || 100;

                        if (hasSub) {
                          const normalizedPct = hasWeights ? subTotal : (subTotal / totalStructureWeight) * 100;
                          grandTotal += normalizedPct;
                          countedSubj += 1;
                        }

                        const evaluatedGrade = activeGradingScale?.bands
                          ? gradeForDynamicScale(activeGradingScale.bands, hasSub ? subTotal : null)
                          : null;

                        return (
                          <>
                            {componentsList.map((c) => {
                              const val = subMap[c.code];
                              return (
                                <TableCell key={`${sub.id}-${c.code}`} className="p-1 text-center font-mono">
                                  {val != null ? val : "—"}
                                </TableCell>
                              );
                            })}

                            <TableCell className="text-center font-bold text-xs tabular-nums text-primary bg-muted/10">
                              {hasSub ? subTotal : "—"}
                            </TableCell>

                            <TableCell className="text-center font-bold text-xs">
                              {evaluatedGrade?.grade ? (
                                <Badge variant="outline" className="px-1 py-0 text-[10px] font-mono">
                                  {evaluatedGrade.grade}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                          </>
                        );
                      })}

                      <TableCell className="text-center font-bold text-xs tabular-nums text-primary bg-primary/5">
                        {countedSubj > 0 ? (Math.round((grandTotal / countedSubj) * 100) / 100) + "%" : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
