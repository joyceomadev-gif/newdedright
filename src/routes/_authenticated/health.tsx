import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Pill, Send, Plus, Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { useCurrentSessionId } from "@/components/SessionSelect";

export const Route = createFileRoute("/_authenticated/health")({
  component: HealthPage,
});

interface Student { id: string; full_name: string; admission_no: string | null; class_id: string | null }

function useStudents() {
  return useQuery({
    queryKey: ["health-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, class_id")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Student[];
    },
  });
}

function StudentPicker({ value, onChange, students }: { value: string; onChange: (v: string) => void; students: Student[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {students.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.full_name}{s.admission_no ? ` (${s.admission_no})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HealthPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Stethoscope className="h-6 w-6" /> Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Student observations &amp; vitals, medications &amp; tests, referrals &amp; discharge records.
        </p>
      </div>
      <Tabs defaultValue="vitals">
        <TabsList>
          <TabsTrigger value="vitals"><Activity className="h-4 w-4 mr-1.5" />Observations &amp; Vitals</TabsTrigger>
          <TabsTrigger value="meds"><Pill className="h-4 w-4 mr-1.5" />Medications &amp; Tests</TabsTrigger>
          <TabsTrigger value="referrals"><Send className="h-4 w-4 mr-1.5" />Referrals &amp; Discharge</TabsTrigger>
        </TabsList>
        <TabsContent value="vitals" className="mt-4"><VitalsTab /></TabsContent>
        <TabsContent value="meds" className="mt-4"><MedsTab /></TabsContent>
        <TabsContent value="referrals" className="mt-4"><ReferralsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ VITALS ============================ */

interface Obs {
  id: string; student_id: string; recorded_at: string;
  temperature_c: number | null; pulse_bpm: number | null;
  bp_systolic: number | null; bp_diastolic: number | null;
  respiratory_rate: number | null; weight_kg: number | null; height_cm: number | null;
  symptoms: string | null; notes: string | null;
}

function VitalsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: students = [] } = useStudents();
  const [filterStudent, setFilterStudent] = useState<string>("");
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["health_observations", filterStudent],
    queryFn: async () => {
      let q = supabase.from("health_observations").select("*").order("recorded_at", { ascending: false }).limit(200);
      if (filterStudent) q = q.eq("student_id", filterStudent);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Obs[];
    },
  });

  const studentName = (id: string) => students.find((s) => s.id === id)?.full_name ?? "—";

  const [form, setForm] = useState({
    student_id: "", temperature_c: "", pulse_bpm: "", bp_systolic: "", bp_diastolic: "",
    respiratory_rate: "", weight_kg: "", height_cm: "", symptoms: "", notes: "",
  });

  const healthSessionId = useCurrentSessionId();
  const create = useMutation({
    mutationFn: async () => {
      if (!form.student_id) throw new Error("Select a student");
      const num = (v: string) => (v === "" ? null : Number(v));
      const { error } = await supabase.from("health_observations").insert({
        student_id: form.student_id,
        temperature_c: num(form.temperature_c),
        pulse_bpm: num(form.pulse_bpm),
        bp_systolic: num(form.bp_systolic),
        bp_diastolic: num(form.bp_diastolic),
        respiratory_rate: num(form.respiratory_rate),
        weight_kg: num(form.weight_kg),
        height_cm: num(form.height_cm),
        symptoms: form.symptoms || null,
        notes: form.notes || null,
        recorded_by: user?.id,
        ...(healthSessionId ? { academic_session_id: healthSessionId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Observation recorded");
      qc.invalidateQueries({ queryKey: ["health_observations"] });
      setOpen(false);
      setForm({ student_id: "", temperature_c: "", pulse_bpm: "", bp_systolic: "", bp_diastolic: "", respiratory_rate: "", weight_kg: "", height_cm: "", symptoms: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-1 min-w-[240px]">
          <Label className="text-xs">Filter by student</Label>
          <Select value={filterStudent || "_all"} onValueChange={(v) => setFilterStudent(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_all">All students</SelectItem>
              {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" />New observation</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record observation</DialogTitle>
              <DialogDescription>Vitals and clinical notes for a student.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-3 space-y-1">
                <Label>Student</Label>
                <StudentPicker value={form.student_id} onChange={(v) => setForm({ ...form, student_id: v })} students={students} />
              </div>
              {([
                ["temperature_c", "Temp (°C)"], ["pulse_bpm", "Pulse (bpm)"],
                ["respiratory_rate", "Resp. rate"], ["bp_systolic", "BP systolic"],
                ["bp_diastolic", "BP diastolic"], ["weight_kg", "Weight (kg)"],
                ["height_cm", "Height (cm)"],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label>{label}</Label>
                  <Input type="number" step="0.1" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="col-span-2 md:col-span-3 space-y-1">
                <Label>Symptoms</Label>
                <Textarea rows={2} value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} />
              </div>
              <div className="col-span-2 md:col-span-3 space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Temp</TableHead>
              <TableHead>Pulse</TableHead>
              <TableHead>BP</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Height</TableHead>
              <TableHead>Symptoms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No records yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.recorded_at).toLocaleString()}</TableCell>
                <TableCell>{studentName(r.student_id)}</TableCell>
                <TableCell>{r.temperature_c ?? "—"}</TableCell>
                <TableCell>{r.pulse_bpm ?? "—"}</TableCell>
                <TableCell>{r.bp_systolic && r.bp_diastolic ? `${r.bp_systolic}/${r.bp_diastolic}` : "—"}</TableCell>
                <TableCell>{r.weight_kg ?? "—"}</TableCell>
                <TableCell>{r.height_cm ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.symptoms ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* ============================ MEDICATIONS / TESTS ============================ */

interface Med {
  id: string; student_id: string; type: string; name: string;
  dose: string | null; route: string | null; result: string | null;
  ordered_at: string | null; administered_at: string | null; notes: string | null;
}

function MedsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: students = [] } = useStudents();
  const [filterStudent, setFilterStudent] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: "", type: "medication", name: "", dose: "", route: "", result: "", notes: "" });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["health_medications", filterStudent],
    queryFn: async () => {
      let q = supabase.from("health_medications").select("*").order("administered_at", { ascending: false }).limit(200);
      if (filterStudent) q = q.eq("student_id", filterStudent);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Med[];
    },
  });

  const studentName = (id: string) => students.find((s) => s.id === id)?.full_name ?? "—";

  const healthSessionId = useCurrentSessionId();
  const create = useMutation({
    mutationFn: async () => {
      if (!form.student_id || !form.name) throw new Error("Student and name are required");
      const { error } = await supabase.from("health_medications").insert({
        student_id: form.student_id, type: form.type, name: form.name,
        dose: form.dose || null, route: form.route || null, result: form.result || null,
        notes: form.notes || null, recorded_by: user?.id,
        ...(healthSessionId ? { academic_session_id: healthSessionId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["health_medications"] });
      setOpen(false);
      setForm({ student_id: "", type: "medication", name: "", dose: "", route: "", result: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-1 min-w-[240px]">
          <Label className="text-xs">Filter by student</Label>
          <Select value={filterStudent || "_all"} onValueChange={(v) => setFilterStudent(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_all">All students</SelectItem>
              {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" />New entry</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Medication or test</DialogTitle>
              <DialogDescription>Log a medication administered or a test ordered/result.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Student</Label>
                <StudentPicker value={form.student_id} onChange={(v) => setForm({ ...form, student_id: v })} students={students} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medication">Medication</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{form.type === "test" ? "Test name" : "Drug name"}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Dose</Label>
                <Input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder="e.g. 500mg" />
              </div>
              <div className="space-y-1">
                <Label>Route</Label>
                <Input value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} placeholder="oral, IV..." />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Result / outcome</Label>
                <Textarea rows={2} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Dose</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No records yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.administered_at ? new Date(r.administered_at).toLocaleString() : "—"}</TableCell>
                <TableCell>{studentName(r.student_id)}</TableCell>
                <TableCell className="capitalize">{r.type}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.dose ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.result ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* ============================ REFERRALS / DISCHARGE ============================ */

interface Ref {
  id: string; student_id: string; kind: string;
  facility: string | null; reason: string | null; outcome: string | null;
  referred_at: string | null; follow_up_date: string | null; notes: string | null;
}

function ReferralsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: students = [] } = useStudents();
  const [filterStudent, setFilterStudent] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ student_id: "", kind: "referral", facility: "", reason: "", outcome: "", follow_up_date: "", notes: "" });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["health_referrals", filterStudent],
    queryFn: async () => {
      let q = supabase.from("health_referrals").select("*").order("referred_at", { ascending: false }).limit(200);
      if (filterStudent) q = q.eq("student_id", filterStudent);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Ref[];
    },
  });

  const studentName = (id: string) => students.find((s) => s.id === id)?.full_name ?? "—";

  const healthSessionId = useCurrentSessionId();
  const create = useMutation({
    mutationFn: async () => {
      if (!form.student_id) throw new Error("Select a student");
      const { error } = await supabase.from("health_referrals").insert({
        student_id: form.student_id, kind: form.kind,
        facility: form.facility || null, reason: form.reason || null,
        outcome: form.outcome || null,
        follow_up_date: form.follow_up_date || null,
        notes: form.notes || null, recorded_by: user?.id,
        ...(healthSessionId ? { academic_session_id: healthSessionId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["health_referrals"] });
      setOpen(false);
      setForm({ student_id: "", kind: "referral", facility: "", reason: "", outcome: "", follow_up_date: "", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="space-y-1 min-w-[240px]">
          <Label className="text-xs">Filter by student</Label>
          <Select value={filterStudent || "_all"} onValueChange={(v) => setFilterStudent(v === "_all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_all">All students</SelectItem>
              {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1.5" />New entry</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Referral or discharge</DialogTitle>
              <DialogDescription>Refer the student to an external facility, or record a discharge.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Student</Label>
                <StudentPicker value={form.student_id} onChange={(v) => setForm({ ...form, student_id: v })} students={students} />
              </div>
              <div className="space-y-1">
                <Label>Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="discharge">Discharge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Facility</Label>
                <Input value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Reason</Label>
                <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Outcome</Label>
                <Textarea rows={2} value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Follow-up date</Label>
                <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Student</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Follow-up</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No records yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.referred_at ? new Date(r.referred_at).toLocaleDateString() : "—"}</TableCell>
                <TableCell>{studentName(r.student_id)}</TableCell>
                <TableCell className="capitalize">{r.kind}</TableCell>
                <TableCell>{r.facility ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.reason ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.outcome ?? "—"}</TableCell>
                <TableCell>{r.follow_up_date ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

