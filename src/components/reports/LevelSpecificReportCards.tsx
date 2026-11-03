import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, FileText, Smile, GraduationCap, Award, BookOpen, UserCheck, Calendar, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useResolvedAssessmentStructure,
  useResolvedGradingScale,
  gradeForDynamicScale,
  computeDynamicTotalScore,
} from "@/lib/assessment-config";
import { formatTermName } from "@/lib/scoring";
import { buildSubjectScoreMap, mergeBroadsheetScores } from "@/lib/broadsheet";

import { PermissionGuard } from "@/components/auth/PermissionGuard";

interface StudentRow { id: string; full_name: string; admission_no: string | null; class_id: string | null }
interface ClassRow { id: string; name: string; level?: string }
interface SubjectRow { id: string; name: string }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string }
interface SessionRow { id: string; name: string; is_current: boolean }

type ReportLevelTemplate = "early_years" | "primary" | "junior_secondary" | "senior_secondary";

const TEMPLATE_MODES: { value: ReportLevelTemplate; label: string; desc: string }[] = [
  { value: "early_years", label: "Early Years / Kindergarten", desc: "Competency skill ratings (Can count 1–5, Can write 1–5), affective domain ratings, teacher comments." },
  { value: "primary", label: "Primary School", desc: "Subject breakdown (CA1, CA2, Exam, Total, Grade, Position), attendance, headmaster remarks." },
  { value: "junior_secondary", label: "Junior Secondary (JSS)", desc: "Subject summary, BECE grade scale (A–F), psychomotor/affective traits, principal remarks." },
  { value: "senior_secondary", label: "Senior Secondary (SSS)", desc: "Subject summary, WAEC grade scale (A1–F9), cumulative average %, academic director remarks." },
];

export function LevelSpecificReportCards() {
  return (
    <PermissionGuard module="reports" submodule="level-report-cards" action="read">
      <LevelSpecificReportCardsContent />
    </PermissionGuard>
  );
}

function LevelSpecificReportCardsContent() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [termId, setTermId] = useState<string | undefined>();
  const [classId, setClassId] = useState<string | undefined>();
  const [studentId, setStudentId] = useState<string | undefined>();
  const [templateMode, setTemplateMode] = useState<ReportLevelTemplate>("primary");

  const { data: schoolSetting } = useQuery({
    queryKey: ["lsrc-school-setting"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("school_name").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as { school_name: string | null } | null;
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["lsrc-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const currentSession = (sessions ?? []).find((s) => s.is_current);

  const { data: terms } = useQuery({
    queryKey: ["lsrc-terms", sessionId],
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
    queryKey: ["lsrc-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name,level").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["lsrc-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["lsrc-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,admission_no,class_id")
        .eq("class_id", classId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const effSession = sessionId ?? currentSession?.id;
  const effTerm = termId ?? currentTerm?.id;
  const scopeReady = !!effSession && !!effTerm && !!classId && !!studentId;

  const selectedStudentObj = (students ?? []).find((s) => s.id === studentId);
  const selectedClassObj = (classes ?? []).find((c) => c.id === classId);

  // Auto-detect template mode based on class level
  const resolvedTemplateMode = useMemo(() => {
    if (!selectedClassObj?.level) return templateMode;
    const lvl = selectedClassObj.level.toLowerCase();
    if (lvl.includes("nursery") || lvl.includes("creche")) return "early_years";
    if (lvl.includes("primary")) return "primary";
    if (lvl.includes("jss")) return "junior_secondary";
    if (lvl.includes("sss") || lvl.includes("secondary")) return "senior_secondary";
    return templateMode;
  }, [selectedClassObj, templateMode]);

  // Resolve structure & grading scale for selected scope (consistent args across consumers: I1)
  const { data: activeStructure } = useResolvedAssessmentStructure(classId, null, effTerm, effSession, selectedClassObj?.level);
  const { data: activeGradingScale } = useResolvedGradingScale(classId, null, selectedClassObj?.level);

  // Fetch assessment scores for selected student
  const { data: studentScores } = useQuery({
    queryKey: ["lsrc-student-scores", studentId, effTerm],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("continuous_assessments")
        .select("subject_id,ca_type,score,max_score,title,created_at")
        .eq("student_id", studentId!)
        .eq("term_id", effTerm!);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch saved teacher / principal comments for student
  const { data: reportCardComments } = useQuery({
    queryKey: ["lsrc-comments", studentId, effTerm],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase.from("report_cards")
        .select("teacher_comment, principal_comment")
        .eq("student_id", studentId!)
        .eq("term_id", effTerm!)
        .maybeSingle();
      if (error) return null;
      return data as { teacher_comment: string | null; principal_comment: string | null } | null;
    },
  });

  // Fallback: comments entered on the broadsheet entry page (I4)
  const { data: broadsheetComments } = useQuery({
    queryKey: ["lsrc-broadsheet-comments", studentId, effTerm],
    enabled: !!studentId && !!effTerm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadsheet_student_comments")
        .select("teacher_comment, principal_comment")
        .eq("student_id", studentId!)
        .eq("term_id", effTerm!)
        .maybeSingle();
      if (error) return null;
      return data as { teacher_comment: string | null; principal_comment: string | null } | null;
    },
  });
  const effectiveComments = {
    teacher_comment: reportCardComments?.teacher_comment ?? broadsheetComments?.teacher_comment ?? null,
    principal_comment: reportCardComments?.principal_comment ?? broadsheetComments?.principal_comment ?? null,
  };

  // Fetch broadsheet scores (fallback for CA scores entered via Broadsheet tab)
  const { data: broadsheetScores } = useQuery({
    queryKey: ["lsrc-broadsheet-scores", classId, studentId, effTerm, effSession],
    enabled: !!classId && !!effTerm && !!effSession && !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("broadsheets")
        .select("student_id,subject_id,ca1,ca2,ca3,exam_score")
        .eq("student_id", studentId!)
        .eq("class_id", classId!)
        .eq("term_id", effTerm!)
        .eq("session_id", effSession!);
      if (error) throw error;
      return data || [];
    },
  });

  // Deduped, legacy-rescaled CA map + authoritative broadsheet merge (shared helpers: I5)
  const subjectMap = useMemo(
    () => buildSubjectScoreMap(studentScores ?? [], activeStructure?.components ?? []),
    [studentScores, activeStructure]
  );
  const mergedSubjectMap = useMemo(
    () => mergeBroadsheetScores(subjectMap, broadsheetScores ?? []),
    [subjectMap, broadsheetScores]
  );

  /** Only subjects the selected student actually offers (has any recorded score for). */
  const offeredSubjects = useMemo(() => {
    const all = subjects ?? [];
    return all.filter((s) => {
      const scores = mergedSubjectMap[s.id];
      return !!scores && Object.values(scores).some((v) => v != null);
    });
  }, [subjects, mergedSubjectMap]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4 print:hidden">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Level-Specific Report Card Generator
            </h3>
            <p className="text-xs text-muted-foreground">
              Generate level-tailored report card templates for Early Years / Kindergarten, Primary, Junior Secondary, and Senior Secondary.
            </p>
          </div>
          {scopeReady && (
            <Button size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print Report Card
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
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
            <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId(undefined); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Student</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={!classId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>{(students ?? []).map((st) => <SelectItem key={st.id} value={st.id}>{st.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!scopeReady ? (
        <Card className="p-6 text-center text-sm text-muted-foreground print:hidden">
          Select Session, Term, Class, and Student to view and print the level-specific report card.
        </Card>
      ) : (
        <Card id="report-card-printable" className="report-card p-6 space-y-6 print:shadow-none print:border-none print:p-0">
          {/* Header */}
          <div className="border-b pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <h2 className="text-lg font-bold">{schoolSetting?.school_name || "De-Bright Group of Schools"}</h2>
                <p className="text-xs text-muted-foreground capitalize">
                  {resolvedTemplateMode.replace("_", " ")} Report Card
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-mono uppercase">
              {resolvedTemplateMode} Mode
            </Badge>
          </div>

          {/* Student Info Box */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-muted/30 rounded-lg text-xs">
            <div><span className="text-muted-foreground">Student Name:</span> <div className="font-bold text-sm">{selectedStudentObj?.full_name}</div></div>
            <div><span className="text-muted-foreground">Admission No:</span> <div className="font-mono font-semibold">{selectedStudentObj?.admission_no || "—"}</div></div>
            <div><span className="text-muted-foreground">Class:</span> <div className="font-semibold">{selectedClassObj?.name}</div></div>
            <div><span className="text-muted-foreground">Session / Term:</span> <div className="font-semibold">{(sessions ?? []).find(s => s.id === effSession)?.name} - {formatTermName((terms ?? []).find(t => t.id === effTerm)?.name)}</div></div>
          </div>

          {/* Early Years Skill Competency Template */}
          {resolvedTemplateMode === "early_years" ? (
            <div className="space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Smile className="h-4 w-4 text-emerald-600" /> Early Years Skill Competency Ratings
              </h4>
              <Table className="border text-xs">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Skill / Competency Criterion</TableHead>
                    <TableHead className="w-28 text-center">Max Rating</TableHead>
                    <TableHead className="w-28 text-center">Score / Rating</TableHead>
                    <TableHead className="w-32 text-center">Competency Band</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((activeStructure?.components && activeStructure.components.length > 0)
                    ? activeStructure.components
                    : [
                        { id: "1", code: "COUNT_1_5", name: "Can count 1–5", max_score: 5 },
                        { id: "2", code: "WRITE_1_5", name: "Can write 1–5", max_score: 5 },
                        { id: "3", code: "IDENTIFY_NUM", name: "Can identify numbers", max_score: 5 },
                        { id: "4", code: "ADDITION", name: "Can perform simple addition", max_score: 5 },
                      ]
                  ).map((comp) => {
                    let scoreVal: number | null = null;
                    for (const subScores of Object.values(mergedSubjectMap)) {
                      if (subScores[comp.code] != null) {
                        scoreVal = subScores[comp.code];
                        break;
                      }
                    }
                    const pctVal = scoreVal != null ? (scoreVal / comp.max_score) * 100 : null;

                    return (
                      <TableRow key={comp.code}>
                        <TableCell className="font-medium">{comp.name}</TableCell>
                        <TableCell className="text-center font-mono">{comp.max_score}</TableCell>
                        <TableCell className="text-center font-bold font-mono text-primary">
                          {scoreVal != null ? scoreVal : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {pctVal != null ? (
                            <Badge variant={pctVal >= 70 ? "default" : "secondary"} className="text-[10px]">
                              {pctVal >= 80 ? "Exceeds Expectations" : pctVal >= 60 ? "Meets Expectations" : "Developing"}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* Primary / Secondary Subject Assessment Breakdown Template */
            <div className="space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> Subject Academic Performance
              </h4>
              <Table className="border text-xs">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Subject Title</TableHead>
                    {(activeStructure?.components || [
                      { code: "CA1", name: "CA1" },
                      { code: "CA2", name: "CA2" },
                      { code: "EXAM", name: "Exam" },
                    ]).map((c) => (
                      <TableHead key={c.code} className="w-20 text-center font-mono">{c.code}</TableHead>
                    ))}
                    <TableHead className="w-24 text-center font-bold">Total Score</TableHead>
                    <TableHead className="w-20 text-center font-bold">Grade</TableHead>
                    <TableHead className="w-32 text-center">Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offeredSubjects.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        No subject scores recorded for this student in the selected session and term.
                      </TableCell>
                    </TableRow>
                  )}
                  {offeredSubjects.map((sub) => {
                    const subScores = mergedSubjectMap[sub.id] || {};
                    const comps = activeStructure?.components || [
                      { id: "1", code: "CA1", name: "CA1", max_score: 15, weight_percentage: 15, display_order: 1, is_mandatory: true },
                      { id: "2", code: "CA2", name: "CA2", max_score: 15, weight_percentage: 15, display_order: 2, is_mandatory: true },
                      { id: "3", code: "EXAM", name: "Exam", max_score: 70, weight_percentage: 70, display_order: 3, is_mandatory: true },
                    ];

                    const computedVal = computeDynamicTotalScore(comps, subScores);
                    const hasScore = computedVal != null;
                    const total = computedVal ?? 0;

                    const evaluatedGrade = activeGradingScale?.bands
                      ? gradeForDynamicScale(activeGradingScale.bands, hasScore ? total : null)
                      : null;

                    return (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.name}</TableCell>
                        {comps.map((c) => (
                          <TableCell key={c.code} className="text-center font-mono">
                            {subScores[c.code] != null ? subScores[c.code] : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-bold font-mono text-primary">
                          {hasScore ? total : "—"}
                        </TableCell>
                        <TableCell className="text-center font-bold font-mono">
                          {evaluatedGrade?.grade ? (
                            <Badge variant="outline" className="text-[10px]">
                              {evaluatedGrade.grade}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-[11px]">
                          {evaluatedGrade?.remark || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Teacher & Academic Remarks */}
          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t text-xs">
            <div className="space-y-2 p-3 border rounded-md bg-muted/10">
              <span className="font-semibold text-primary">Class Teacher's Remark:</span>
              <p className="italic text-muted-foreground">
                "{effectiveComments.teacher_comment || "Demonstrates strong academic performance and active class participation. Recommended for continued progress."}"
              </p>
            </div>
            <div className="space-y-2 p-3 border rounded-md bg-muted/10">
              <span className="font-semibold text-primary">Headmaster / Principal's Remark:</span>
              <p className="italic text-muted-foreground">
                "{effectiveComments.principal_comment || "Satisfactory academic conduct and consistent improvement across all subject assessment components."}"
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
