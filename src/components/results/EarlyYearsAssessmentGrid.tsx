import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Save, Smile, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedAssessmentStructure, validateComponentScore, computeDynamicTotalScore } from "@/lib/assessment-config";

interface StudentRow { id: string; full_name: string; admission_no: string | null }
interface SubjectRow { id: string; name: string }
interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; is_current: boolean; session_id: string }
interface SessionRow { id: string; name: string; is_current: boolean }

type RatingMap = Record<string, Record<string, number | null>>; // studentId -> { criteriaCode: score }

export function EarlyYearsAssessmentGrid() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [termId, setTermId] = useState<string | undefined>();
  const [classId, setClassId] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [ratings, setRatings] = useState<RatingMap>({});

  const { data: sessions } = useQuery({
    queryKey: ["ey-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const currentSession = (sessions ?? []).find((s) => s.is_current);

  const { data: terms } = useQuery({
    queryKey: ["ey-terms", sessionId],
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
    queryKey: ["ey-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["ey-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });

  const effSession = sessionId ?? currentSession?.id;
  const effTerm = termId ?? currentTerm?.id;
  const scopeReady = !!effSession && !!effTerm && !!classId && !!subjectId;

  // Resolve skill criteria for early-years class
  const { data: activeStructure } = useResolvedAssessmentStructure(classId, subjectId, effTerm, effSession);

  // Criteria fallback if no custom structure: Early Years default skills
  const criteriaList = useMemo(() => {
    if (activeStructure?.components && activeStructure.components.length > 0) {
      return activeStructure.components;
    }
    return [
      { id: "1", code: "COUNT_1_5", name: "Can count 1–5", max_score: 5, category: "skill_criterion", weight_percentage: 25, display_order: 1, is_mandatory: true },
      { id: "2", code: "WRITE_1_5", name: "Can write 1–5", max_score: 5, category: "skill_criterion", weight_percentage: 25, display_order: 2, is_mandatory: true },
      { id: "3", code: "IDENTIFY_NUM", name: "Can identify numbers", max_score: 5, category: "skill_criterion", weight_percentage: 25, display_order: 3, is_mandatory: true },
      { id: "4", code: "ADDITION", name: "Can perform simple addition", max_score: 5, category: "skill_criterion", weight_percentage: 25, display_order: 4, is_mandatory: true },
    ];
  }, [activeStructure]);

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ["ey-students", classId],
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

  // Fetch existing continuous assessment ratings for this scope
  const { data: existingRatings } = useQuery({
    queryKey: ["ey-existing-ratings", classId, subjectId, effTerm],
    enabled: scopeReady,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("continuous_assessments")
        .select("student_id,ca_type,score")
        .eq("class_id", classId!)
        .eq("subject_id", subjectId!)
        .eq("term_id", effTerm!);
      if (error) throw error;
      return data || [];
    },
  });

  // Pre-populate ratings from existing database scores
  useEffect(() => {
    if (!existingRatings || existingRatings.length === 0) return;
    const initial: RatingMap = {};
    for (const r of existingRatings) {
      if (!initial[r.student_id]) initial[r.student_id] = {};
      const code = (r.ca_type || "").toUpperCase();
      initial[r.student_id][code] = Number(r.score) || 0;
    }
    setRatings((prev) => ({ ...initial, ...prev }));
  }, [existingRatings]);

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!students) return [];
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.admission_no?.toLowerCase().includes(q)
    );
  }, [students, searchQuery]);

  function updateRating(studentId: string, criteriaCode: string, value: number | null) {
    setRatings((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [criteriaCode]: value,
      },
    }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const studentIds = Object.keys(ratings);
      if (studentIds.length === 0) return;

      const payload: any[] = [];
      for (const stId of studentIds) {
        const studentRatings = ratings[stId];
        for (const [code, val] of Object.entries(studentRatings)) {
          if (val != null) {
            const comp = criteriaList.find((c) => c.code === code);
            payload.push({
              student_id: stId,
              class_id: classId,
              subject_id: subjectId,
              term_id: effTerm,
              ca_type: code.toLowerCase(),
              score: val,
              max_score: comp?.max_score || 5,
            });
          }
        }
      }

      if (payload.length > 0) {
        const { error } = await supabase.from("continuous_assessments").upsert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Competency ratings saved successfully");
      setRatings({});
      qc.invalidateQueries({ queryKey: ["gradebook-ca"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Smile className="h-4 w-4 text-emerald-600" /> Early Years / Lower Grade Competency Assessment
            </h3>
            <p className="text-xs text-muted-foreground">
              Competency-based 1–5 skill ratings for Nursery / Early Years. Students as rows, skill criteria as columns.
            </p>
          </div>
          {scopeReady && Object.keys(ratings).length > 0 && (
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Ratings ({Object.keys(ratings).length})
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
              <SelectContent>{(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nursery Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Subject / Activity</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>{(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!scopeReady ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Select Session, Term, Class, and Subject to open the Early Years Competency Assessment grid.
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <div className="p-3 border-b flex items-center justify-between gap-3 bg-muted/20">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search student name or admission no…"
                className="pl-8 h-8 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Total Students: <span className="font-semibold text-foreground">{filteredStudents.length}</span>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="min-w-[200px]">Student Name</TableHead>
                <TableHead className="w-28">Admission No</TableHead>
                {criteriaList.map((c) => (
                  <TableHead key={c.code} className="min-w-[140px] text-center" title={`${c.name} (Max: ${c.max_score})`}>
                    <div className="font-semibold text-xs text-primary">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">Max Rating: {c.max_score}</div>
                  </TableHead>
                ))}
                <TableHead className="w-24 text-center">Subject Total</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loadingStudents ? (
                <TableRow><TableCell colSpan={criteriaList.length + 3} className="text-center py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading students…</TableCell></TableRow>
              ) : filteredStudents.length === 0 ? (
                <TableRow><TableCell colSpan={criteriaList.length + 3} className="text-center py-8 text-sm text-muted-foreground">No students found in this class.</TableCell></TableRow>
              ) : (
                filteredStudents.map((st) => {
                  const studentRatings = ratings[st.id] || {};
                  const computedVal = computeDynamicTotalScore(criteriaList as import("@/lib/assessment-config").AssessmentComponent[], studentRatings);
                  const hasAnyRating = computedVal != null;
                  const rowTotal = computedVal ?? 0;

                  return (
                    <TableRow key={st.id}>
                      <TableCell className="font-medium text-xs">
                        {st.full_name}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {st.admission_no || "—"}
                      </TableCell>
                      {criteriaList.map((c) => {
                        const val = studentRatings[c.code];
                        const err = validateComponentScore(val, c.max_score, c.code);
                        const isInvalid = !!err;

                        return (
                          <TableCell key={c.code} className="text-center">
                            <Input
                              type="number"
                              min={1}
                              max={c.max_score}
                              className={`h-8 w-20 mx-auto text-center font-bold text-xs tabular-nums ${
                                isInvalid ? "border-red-500 bg-red-50 text-red-700" : ""
                              }`}
                              placeholder={`1–${c.max_score}`}
                              title={err || `Rating 1 to ${c.max_score}`}
                              value={val ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") { updateRating(st.id, c.code, null); return; }
                                const n = Number(raw);
                                if (!isNaN(n)) updateRating(st.id, c.code, n);
                              }}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-bold text-xs tabular-nums text-primary">
                        {hasAnyRating ? rowTotal : "—"}
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
