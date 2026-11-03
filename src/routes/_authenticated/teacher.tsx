import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  BookOpen, Users, FileText, ClipboardList, MessageSquare, CalendarCheck,
  GraduationCap, Plane, Wallet, Loader2, Inbox, CheckCircle2, ExternalLink,
  CalendarDays, School,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/teacher")({
  component: TeacherPortal,
});

type StaffMe = { id: string; full_name: string; position: string; email: string | null };
type ClassRow = { id: string; name: string; level: string };
type SubjectRow = { id: string; name: string; class_id: string | null };
type StudentRow = { id: string; full_name: string; admission_no: string; class_id: string | null; photo_url: string | null };
type TermRow = { id: string; name: string; is_current: boolean };

function useMe() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id,full_name,position,email")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as StaffMe | null;
    },
  });
}

function TeacherPortal() {
  const { user, isStaff } = useAuth();
  const { data: me, isLoading: meLoading } = useMe();

  if (!user) return null;
  if (!isStaff) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        This portal is for teaching staff.
      </Card>
    );
  }
  if (meLoading) {
    return <div className="py-10 flex items-center justify-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>;
  }
  if (!me) {
    return (
      <Card className="p-8 text-center space-y-2">
        <p className="font-medium">Your account is not linked to a staff record.</p>
        <p className="text-sm text-muted-foreground">Ask an admin to link your login on the Staff page so your classes and students appear here.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Teacher Portal</h1>
        <p className="text-muted-foreground text-sm">Welcome back, {me.full_name}. Manage your classes, students, and day-to-day tasks.</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><School className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="classes"><BookOpen className="h-3.5 w-3.5 mr-1" />My classes</TabsTrigger>
          <TabsTrigger value="students"><Users className="h-3.5 w-3.5 mr-1" />Students</TabsTrigger>
          <TabsTrigger value="lessons"><FileText className="h-3.5 w-3.5 mr-1" />Lessons</TabsTrigger>
          <TabsTrigger value="assessments"><ClipboardList className="h-3.5 w-3.5 mr-1" />Assessments</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarCheck className="h-3.5 w-3.5 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="messages"><MessageSquare className="h-3.5 w-3.5 mr-1" />Messages</TabsTrigger>
          <TabsTrigger value="admin"><Plane className="h-3.5 w-3.5 mr-1" />Admin tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab me={me} /></TabsContent>
        <TabsContent value="classes" className="mt-4"><MyClassesTab me={me} /></TabsContent>
        <TabsContent value="students" className="mt-4"><MyStudentsTab me={me} /></TabsContent>
        <TabsContent value="lessons" className="mt-4"><LessonsTab me={me} /></TabsContent>
        <TabsContent value="assessments" className="mt-4"><AssessmentsTab me={me} /></TabsContent>
        <TabsContent value="attendance" className="mt-4"><AttendanceTab me={me} /></TabsContent>
        <TabsContent value="messages" className="mt-4"><MessagesTab /></TabsContent>
        <TabsContent value="admin" className="mt-4"><AdminTasksTab me={me} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ shared hooks ============ */

function useMyClasses(me: StaffMe) {
  return useQuery({
    queryKey: ["teacher-classes", me.id],
    queryFn: async () => {
      const ownedRes = await supabase.from("classes").select("id,name,level").eq("class_teacher_id", me.id);
      const subjRes = await supabase.from("subjects").select("class_id").eq("teacher_id", me.id).not("class_id", "is", null);
      const extraIds = Array.from(new Set((subjRes.data ?? []).map((s) => s.class_id).filter(Boolean) as string[]));
      let extra: ClassRow[] = [];
      if (extraIds.length) {
        const r = await supabase.from("classes").select("id,name,level").in("id", extraIds);
        extra = (r.data ?? []) as ClassRow[];
      }
      const map = new Map<string, ClassRow>();
      ([...(ownedRes.data ?? []), ...extra] as ClassRow[]).forEach((c) => map.set(c.id, c));
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

function useMySubjects(me: StaffMe) {
  return useQuery({
    queryKey: ["teacher-subjects", me.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects").select("id,name,class_id").eq("teacher_id", me.id).order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });
}

function useCurrentTerm() {
  return useQuery({
    queryKey: ["teacher-current-term"],
    queryFn: async () => {
      const { data } = await supabase.from("terms").select("id,name,is_current").eq("is_current", true).maybeSingle();
      return data as TermRow | null;
    },
  });
}

/* ============ OVERVIEW ============ */

function OverviewTab({ me }: { me: StaffMe }) {
  const { data: classes } = useMyClasses(me);
  const { data: subjects } = useMySubjects(me);
  const classIds = (classes ?? []).map((c) => c.id);

  const { data: stats } = useQuery({
    queryKey: ["teacher-overview", me.id, classIds.join(",")],
    queryFn: async () => {
      const studentsP = classIds.length
        ? supabase.from("students").select("id", { count: "exact", head: true }).in("class_id", classIds).eq("status", "active")
        : Promise.resolve({ count: 0 });
      const todayAttP = classIds.length
        ? supabase.from("attendance").select("id", { count: "exact", head: true }).in("class_id", classIds).eq("date", new Date().toISOString().slice(0, 10))
        : Promise.resolve({ count: 0 });
      const pendingAssignP = supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("status", "submitted").is("graded_at", null);
      const unreadMsgP = supabase.from("messages").select("id", { count: "exact", head: true }).eq("receiver_id", me.id).is("read_at", null);
      const [s, a, p, u] = await Promise.all([studentsP, todayAttP, pendingAssignP, unreadMsgP]);
      return {
        students: s.count ?? 0,
        todayAttendance: a.count ?? 0,
        pendingGrading: p.count ?? 0,
        unread: u.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "My classes", value: classes?.length ?? 0, icon: BookOpen, to: "/teacher" },
    { label: "My subjects", value: subjects?.length ?? 0, icon: GraduationCap, to: "/academics" },
    { label: "Active students", value: stats?.students ?? 0, icon: Users, to: "/students" },
    { label: "Today's attendance entries", value: stats?.todayAttendance ?? 0, icon: CalendarCheck, to: "/teacher" },
    { label: "Submissions to grade", value: stats?.pendingGrading ?? 0, icon: ClipboardList, to: "/academics" },
    { label: "Unread messages", value: stats?.unread ?? 0, icon: MessageSquare, to: "/communication" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold mt-1">{c.value}</p>
              </div>
              <c.icon className="h-5 w-5 text-muted-foreground" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link to="/academics">Open academics</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/students">Manage students</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/classes">Class roster</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/communication">Messages</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/exams">Exams / CBT</Link></Button>
        </div>
      </Card>
    </div>
  );
}

/* ============ MY CLASSES ============ */

function MyClassesTab({ me }: { me: StaffMe }) {
  const { data: classes, isLoading } = useMyClasses(me);
  const { data: subjects } = useMySubjects(me);
  if (isLoading) return <Loader />;
  if (!classes?.length) return <Empty msg="You aren't the class teacher or subject teacher for any class yet." />;
  const bySubject = new Map<string, SubjectRow[]>();
  (subjects ?? []).forEach((s) => {
    const k = s.class_id ?? "__all__";
    const arr = bySubject.get(k) ?? [];
    arr.push(s);
    bySubject.set(k, arr);
  });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {classes.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-xs text-muted-foreground uppercase">{c.level}</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link to="/classes">Open<ExternalLink className="h-3 w-3 ml-1" /></Link></Button>
          </div>
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">My subjects in this class</p>
            <div className="flex flex-wrap gap-1">
              {(bySubject.get(c.id) ?? []).map((s) => (
                <Badge key={s.id} variant="secondary">{s.name}</Badge>
              ))}
              {!(bySubject.get(c.id)?.length) && <span className="text-xs text-muted-foreground italic">None assigned</span>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ============ MY STUDENTS ============ */

function MyStudentsTab({ me }: { me: StaffMe }) {
  const { data: classes } = useMyClasses(me);
  const classIds = (classes ?? []).map((c) => c.id);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");

  const { data: students, isLoading } = useQuery({
    queryKey: ["teacher-students", classIds.join(",")],
    enabled: classIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,full_name,admission_no,class_id,photo_url")
        .in("class_id", classIds)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const classMap = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const filtered = (students ?? []).filter((s) => {
    if (classFilter !== "all" && s.class_id !== classFilter) return false;
    if (search && !s.full_name.toLowerCase().includes(search.toLowerCase()) && !s.admission_no.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!classIds.length) return <Empty msg="No classes assigned, so no students to show." />;
  if (isLoading) return <Loader />;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-2 mb-3">
        <Input placeholder="Search name or admission no…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All my classes</SelectItem>
            {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button asChild size="sm" variant="outline"><Link to="/students">Full directory<ExternalLink className="h-3 w-3 ml-1" /></Link></Button>
      </div>
      {filtered.length === 0 ? (
        <Empty msg="No students match." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Admission no.</TableHead>
              <TableHead>Class</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.full_name}</TableCell>
                  <TableCell>{s.admission_no}</TableCell>
                  <TableCell>{s.class_id ? classMap.get(s.class_id) ?? "—" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/* ============ LESSONS ============ */

function LessonsTab({ me }: { me: StaffMe }) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-lessons", me.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_plans")
        .select("id,topic,lesson_date,week_number,class_id,subject_id,classes:class_id(name),subjects:subject_id(name)")
        .eq("teacher_id", me.id)
        .order("lesson_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <Loader />;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Recent lesson plans</h3>
        <Button asChild size="sm"><Link to="/academics">New / edit in Academics</Link></Button>
      </div>
      {!data?.length ? <Empty msg="No lesson plans yet. Create one under Academics → Lesson plans." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Week</TableHead><TableHead>Topic</TableHead><TableHead>Class</TableHead><TableHead>Subject</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r) => {
                type L = { id: string; topic: string; lesson_date: string | null; week_number: number | null; classes: { name: string } | null; subjects: { name: string } | null };
                const row = r as unknown as L;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.lesson_date ?? "—"}</TableCell>
                    <TableCell>{row.week_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">{row.topic}</TableCell>
                    <TableCell>{row.classes?.name ?? "—"}</TableCell>
                    <TableCell>{row.subjects?.name ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/* ============ ASSESSMENTS ============ */

function AssessmentsTab({ me }: { me: StaffMe }) {
  const { data: subjects } = useMySubjects(me);
  const subjIds = (subjects ?? []).map((s) => s.id);

  const { data: cas, isLoading } = useQuery({
    queryKey: ["teacher-cas", subjIds.join(",")],
    enabled: subjIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("continuous_assessments")
        .select("id,title,score,max_score,assessment_date,ca_type,students:student_id(full_name),subjects:subject_id(name)")
        .in("subject_id", subjIds)
        .order("assessment_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!subjIds.length) return <Empty msg="You have no subjects assigned, so there are no assessments to show." />;
  if (isLoading) return <Loader />;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Recent assessments</h3>
        <Button asChild size="sm"><Link to="/academics">Record in Academics</Link></Button>
      </div>
      {!cas?.length ? <Empty msg="No assessments recorded yet." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Title</TableHead><TableHead>Student</TableHead><TableHead>Subject</TableHead><TableHead>Score</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {cas.map((r) => {
                type C = { id: string; title: string | null; score: number; max_score: number; assessment_date: string; ca_type: string; students: { full_name: string } | null; subjects: { name: string } | null };
                const row = r as unknown as C;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.assessment_date}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{row.ca_type}</Badge></TableCell>
                    <TableCell>{row.title ?? "—"}</TableCell>
                    <TableCell>{row.students?.full_name ?? "—"}</TableCell>
                    <TableCell>{row.subjects?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono">{row.score}/{row.max_score}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/* ============ ATTENDANCE ============ */

function AttendanceTab({ me }: { me: StaffMe }) {
  const qc = useQueryClient();
  const { data: classes } = useMyClasses(me);
  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const { data: students } = useQuery({
    queryKey: ["teacher-attendance-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students").select("id,full_name,admission_no")
        .eq("class_id", classId).eq("status", "active").order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; admission_no: string }[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["teacher-attendance-existing", classId, date],
    enabled: !!classId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance").select("id,student_id,status,remark")
        .eq("class_id", classId).eq("date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [marks, setMarks] = useState<Record<string, "present" | "absent" | "late" | "excused">>({});
  const existingMap = useMemo(() => {
    const m = new Map<string, { id: string; status: string }>();
    (existing ?? []).forEach((e) => m.set(e.student_id, { id: e.id, status: e.status }));
    return m;
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!classId) throw new Error("Select a class");
      const rows = (students ?? []).map((s) => {
        const status = marks[s.id] ?? (existingMap.get(s.id)?.status as "present" | "absent" | "late" | "excused" | undefined) ?? "present";
        return { student_id: s.id, class_id: classId, date, status, recorded_by: undefined };
      });
      // Delete prior entries for this class/date, then insert fresh.
      const { error: delErr } = await supabase.from("attendance").delete().eq("class_id", classId).eq("date", date);
      if (delErr) throw delErr;
      if (rows.length) {
        const { error } = await supabase.from("attendance").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Attendance saved");
      qc.invalidateQueries({ queryKey: ["teacher-attendance-existing"] });
      setMarks({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select class…" /></SelectTrigger>
            <SelectContent>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
        <div className="flex-1" />
        <Button onClick={() => save.mutate()} disabled={!classId || save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save attendance
        </Button>
      </div>
      {!classId ? <Empty msg="Pick a class to mark attendance." /> : !students?.length ? <Empty msg="No active students in this class." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {students.map((s) => {
                const current = marks[s.id] ?? (existingMap.get(s.id)?.status as "present" | "absent" | "late" | "excused" | undefined) ?? "present";
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.full_name} <span className="text-xs text-muted-foreground">({s.admission_no})</span></TableCell>
                    <TableCell>
                      <Select value={current} onValueChange={(v) => setMarks((m) => ({ ...m, [s.id]: v as "present" | "absent" | "late" | "excused" }))}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="late">Late</SelectItem>
                          <SelectItem value="excused">Excused</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/* ============ MESSAGES ============ */

function MessagesTab() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-messages", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,sender_id,receiver_id,subject,content,created_at,read_at")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <Loader />;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Recent messages</h3>
        <Button asChild size="sm"><Link to="/communication">Open inbox<ExternalLink className="h-3 w-3 ml-1" /></Link></Button>
      </div>
      {!data?.length ? <Empty msg="No messages." /> : (
        <div className="space-y-2">
          {data.map((m) => {
            const isIncoming = m.receiver_id === user?.id;
            return (
              <div key={m.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{m.subject ?? "(no subject)"}</span>
                  <div className="flex items-center gap-2">
                    {isIncoming && !m.read_at && <Badge>New</Badge>}
                    <Badge variant="outline">{isIncoming ? "Incoming" : "Sent"}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-muted-foreground line-clamp-2">{m.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ============ ADMIN TASKS ============ */

function AdminTasksTab({ me }: { me: StaffMe }) {
  return (
    <Tabs defaultValue="recommendations">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="recommendations"><GraduationCap className="h-3.5 w-3.5 mr-1" />Promotion recs</TabsTrigger>
        <TabsTrigger value="leave"><Plane className="h-3.5 w-3.5 mr-1" />Leave</TabsTrigger>
        <TabsTrigger value="payroll"><Wallet className="h-3.5 w-3.5 mr-1" />My payroll</TabsTrigger>
      </TabsList>
      <TabsContent value="recommendations" className="mt-4"><PromotionRecsTab me={me} /></TabsContent>
      <TabsContent value="leave" className="mt-4"><LeaveTab me={me} /></TabsContent>
      <TabsContent value="payroll" className="mt-4"><PayrollTab me={me} /></TabsContent>
    </Tabs>
  );
}

function PromotionRecsTab({ me }: { me: StaffMe }) {
  const qc = useQueryClient();
  const { data: classes } = useMyClasses(me);
  const { data: term } = useCurrentTerm();
  const { data: session } = useQuery({
    queryKey: ["current-session"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id,name").eq("is_current", true).maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });
  const classIds = (classes ?? []).map((c) => c.id);

  const { data: students } = useQuery({
    queryKey: ["teacher-rec-students", classIds.join(",")],
    enabled: classIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students").select("id,full_name,admission_no,class_id")
        .in("class_id", classIds).eq("status", "active").order("full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string; admission_no: string; class_id: string }[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["teacher-rec-existing", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotion_recommendations")
        .select("id,student_id,recommendation,status,note")
        .eq("session_id", session!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const existingMap = new Map((existing ?? []).map((r) => [r.student_id, r]));
  const classMap = new Map((classes ?? []).map((c) => [c.id, c.name]));

  const upsert = useMutation({
    mutationFn: async (input: { student_id: string; from_class_id: string; rec: "pass" | "repeat" | "graduate"; note: string }) => {
      if (!session?.id) throw new Error("No current session");
      const exists = existingMap.get(input.student_id);
      if (exists) {
        const { error } = await supabase.from("promotion_recommendations").update({
          recommendation: input.rec, note: input.note,
        }).eq("id", exists.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("promotion_recommendations").insert({
          student_id: input.student_id,
          session_id: session.id,
          from_class_id: input.from_class_id,
          recommendation: input.rec,
          note: input.note,
          recommended_by: (await supabase.auth.getUser()).data.user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Recommendation saved");
      qc.invalidateQueries({ queryKey: ["teacher-rec-existing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!session) return <Empty msg="No active session is set." />;
  if (!classIds.length) return <Empty msg="You need at least one class to submit recommendations." />;

  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm text-muted-foreground">
        Session: <strong>{session.name}</strong>{term ? <> · Current term: <strong>{term.name}</strong></> : null}
      </div>
      {!students?.length ? <Empty msg="No active students." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Recommendation</TableHead><TableHead>Note</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {students.map((s) => <RecRow key={s.id} student={s} className={classMap.get(s.class_id) ?? "—"} existing={existingMap.get(s.id)} onSave={(rec, note) => upsert.mutate({ student_id: s.id, from_class_id: s.class_id, rec, note })} />)}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function RecRow({ student, className, existing, onSave }: {
  student: { id: string; full_name: string; admission_no: string };
  className: string;
  existing?: { recommendation: string; status: string; note: string | null };
  onSave: (rec: "pass" | "repeat" | "graduate", note: string) => void;
}) {
  const [rec, setRec] = useState<"pass" | "repeat" | "graduate">((existing?.recommendation as "pass" | "repeat" | "graduate") ?? "pass");
  const [note, setNote] = useState(existing?.note ?? "");
  return (
    <TableRow>
      <TableCell><div className="font-medium">{student.full_name}</div><div className="text-xs text-muted-foreground">{student.admission_no}</div></TableCell>
      <TableCell>{className}</TableCell>
      <TableCell>
        <Select value={rec} onValueChange={(v) => setRec(v as "pass" | "repeat" | "graduate")}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">Promote</SelectItem>
            <SelectItem value="repeat">Repeat</SelectItem>
            <SelectItem value="graduate">Graduate</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional…" className="w-56" /></TableCell>
      <TableCell>{existing ? <Badge variant={existing.status === "approved" ? "default" : existing.status === "rejected" ? "destructive" : "secondary"}>{existing.status}</Badge> : <Badge variant="outline">Not submitted</Badge>}</TableCell>
      <TableCell><Button size="sm" onClick={() => onSave(rec, note)}>Save</Button></TableCell>
    </TableRow>
  );
}

function LeaveTab({ me }: { me: StaffMe }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-leave", me.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id,leave_type,start_date,end_date,reason,status,review_note,created_at")
        .eq("staff_id", me.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">My leave requests</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm">Request leave</Button></DialogTrigger>
          <LeaveDialog me={me} onClose={() => setOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["teacher-leave"] })} />
        </Dialog>
      </div>
      {isLoading ? <Loader /> : !data?.length ? <Empty msg="No leave requests yet." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Reviewer note</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="capitalize">{r.leave_type}</TableCell>
                  <TableCell>{r.start_date} → {r.end_date}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.reason ?? "—"}</TableCell>
                  <TableCell><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : r.status === "cancelled" ? "outline" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate">{r.review_note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function LeaveDialog({ me, onClose, onSaved }: { me: StaffMe; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ leave_type: "personal" as "annual"|"sick"|"personal"|"maternity"|"paternity"|"study"|"unpaid"|"other", start_date: "", end_date: "", reason: "" });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.start_date || !form.end_date) throw new Error("Pick start and end dates");
      if (form.end_date < form.start_date) throw new Error("End date must be on or after start date");
      const { error } = await supabase.from("leave_requests").insert({
        staff_id: me.id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Leave request submitted"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>New leave request</DialogTitle>
        <DialogDescription>Admins will review and approve or reject your request.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v as typeof form.leave_type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["annual","sick","personal","maternity","paternity","study","unpaid","other"] as const).map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1"><Label className="text-xs">Start date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">End date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
        </div>
        <div className="space-y-1"><Label className="text-xs">Reason</Label><Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional context…" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Submit</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PayrollTab({ me }: { me: StaffMe }) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-payroll", me.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll")
        .select("id,period_year,period_month,basic_salary,allowances,deductions,net_pay,status,paid_date")
        .eq("staff_id", me.id)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <Loader />;
  return (
    <Card className="p-4">
      <h3 className="font-medium mb-3">My payslips</h3>
      {!data?.length ? <Empty msg="No payslips yet." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Period</TableHead><TableHead>Basic</TableHead><TableHead>Allowances</TableHead><TableHead>Deductions</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead><TableHead>Paid</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.period_year}-{String(p.period_month).padStart(2, "0")}</TableCell>
                  <TableCell className="font-mono">{Number(p.basic_salary).toLocaleString()}</TableCell>
                  <TableCell className="font-mono">{Number(p.allowances).toLocaleString()}</TableCell>
                  <TableCell className="font-mono">{Number(p.deductions).toLocaleString()}</TableCell>
                  <TableCell className="font-mono font-semibold">{Number(p.net_pay).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={p.status === "paid" ? "default" : p.status === "approved" ? "secondary" : "outline"}>{p.status}</Badge></TableCell>
                  <TableCell>{p.paid_date ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/* ============ helpers ============ */
function Loader() {
  return <div className="py-10 flex items-center justify-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…</div>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="py-10 text-center text-muted-foreground text-sm"><Inbox className="h-6 w-6 mx-auto mb-2 opacity-50" />{msg}</div>;
}
