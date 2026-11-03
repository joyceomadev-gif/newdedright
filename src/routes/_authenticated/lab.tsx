import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlaskConical, Beaker, CalendarClock, ShieldAlert, Users, ClipboardList, BarChart3, Plus, Pencil, Trash2, Download, AlertTriangle } from "lucide-react";
import { softDelete } from "@/lib/soft-delete";
import { useCurrentSessionId } from "@/components/SessionSelect";

export const Route = createFileRoute("/_authenticated/lab")({
  component: LabPage,
});

interface Lab { id: string; name: string; code: string | null; location: string | null; capacity: number | null; safety_rules: string | null; is_active: boolean; }
interface Equipment { id: string; name: string; category: string | null; item_type: "apparatus" | "equipment" | "chemical"; serial_number: string | null; location: string | null; condition: string; total_quantity: number; available_quantity: number; min_quantity: number; lab_id: string | null; notes: string | null; concentration: string | null; hazard_class: string | null; expiry_date: string | null; }
interface Session { id: string; lab_id: string; class_id: string | null; subject_id: string | null; teacher_id: string | null; title: string; start_at: string; end_at: string; notes: string | null; status: string; }
interface Incident { id: string; lab_id: string; session_id: string | null; occurred_at: string; severity: string; description: string; actions_taken: string | null; }
interface Group { id: string; lab_id: string | null; class_id: string | null; name: string; notes: string | null; }
interface GroupMember { id: string; group_id: string; student_id: string; }
interface Attendance { id: string; session_id: string; student_id: string; status: string; remark: string | null; }
interface ClassRow { id: string; name: string; }
interface StudentRow { id: string; full_name: string; class_id: string | null; }
interface StaffRow { id: string; full_name: string; }
interface Subject { id: string; name: string; }

function LabPage() {
  const { isStaff } = useAuth();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><FlaskConical className="h-6 w-6" />Lab Management</h1>
        <p className="text-sm text-muted-foreground">Apparatus inventory, scheduling, safety, student groups, attendance and reports.</p>
      </header>
      <Tabs defaultValue="apparatus" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="apparatus"><Beaker className="h-4 w-4 mr-1.5" />Apparatus, Equipment &amp; Chemicals</TabsTrigger>
          <TabsTrigger value="labs"><FlaskConical className="h-4 w-4 mr-1.5" />Labs</TabsTrigger>
          <TabsTrigger value="sessions"><CalendarClock className="h-4 w-4 mr-1.5" />Sessions</TabsTrigger>
          <TabsTrigger value="safety"><ShieldAlert className="h-4 w-4 mr-1.5" />Safety</TabsTrigger>
          <TabsTrigger value="groups"><Users className="h-4 w-4 mr-1.5" />Groups</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          <TabsTrigger value="reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="apparatus"><ApparatusTab canManage={isStaff} /></TabsContent>
        <TabsContent value="labs"><LabsTab canManage={isStaff} /></TabsContent>
        <TabsContent value="sessions"><SessionsTab canManage={isStaff} /></TabsContent>
        <TabsContent value="safety"><SafetyTab canManage={isStaff} /></TabsContent>
        <TabsContent value="groups"><GroupsTab canManage={isStaff} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab canManage={isStaff} /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============ Shared queries ============ */
function useLabs() {
  return useQuery({
    queryKey: ["labs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("labs").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Lab[];
    },
  });
}
function useClasses() {
  return useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
}
function useStudents() {
  return useQuery({
    queryKey: ["students-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,full_name,class_id").eq("is_active", true).order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });
}
function useStaff() {
  return useQuery({
    queryKey: ["staff-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id,full_name").order("full_name");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
}
function useSubjects() {
  return useQuery({
    queryKey: ["subjects-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Subject[];
    },
  });
}

/* ============ Apparatus (Equipment) ============ */
function ApparatusTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const labs = useLabs();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [form, setForm] = useState({ name: "", item_type: "apparatus" as "apparatus" | "equipment" | "chemical", serial_number: "", location: "", condition: "good", total_quantity: 1, available_quantity: 1, min_quantity: 0, lab_id: "", notes: "", concentration: "", hazard_class: "", expiry_date: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["lab-equipment"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Equipment[];
    },
  });

  const labSessionId = useCurrentSessionId();
  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        item_type: form.item_type,
        category: form.item_type,
        serial_number: form.serial_number || null,
        location: form.location || null,
        condition: form.condition as "new" | "good" | "fair" | "poor" | "out_of_service",
        total_quantity: Number(form.total_quantity) || 0,
        available_quantity: Number(form.available_quantity) || 0,
        min_quantity: Number(form.min_quantity) || 0,
        lab_id: form.lab_id || null,
        notes: form.notes || null,
        concentration: form.item_type === "chemical" ? (form.concentration || null) : null,
        hazard_class: form.item_type === "chemical" ? (form.hazard_class || null) : null,
        expiry_date: form.item_type === "chemical" && form.expiry_date ? form.expiry_date : null,
        ...(labSessionId ? { academic_session_id: labSessionId } : {}),
      };
      if (editing) {
        const { error } = await supabase.from("equipment").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("equipment").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Updated" : "Added"); qc.invalidateQueries({ queryKey: ["lab-equipment"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("equipment", id);
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["lab-equipment"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(it: Equipment) {
    setEditing(it);
    setForm({ name: it.name, item_type: (it.item_type ?? "apparatus"), serial_number: it.serial_number ?? "", location: it.location ?? "", condition: it.condition, total_quantity: it.total_quantity, available_quantity: it.available_quantity, min_quantity: it.min_quantity, lab_id: it.lab_id ?? "", notes: it.notes ?? "", concentration: it.concentration ?? "", hazard_class: it.hazard_class ?? "", expiry_date: it.expiry_date ?? "" });
    setOpen(true);
  }
  function startAdd() {
    setEditing(null);
    setForm({ name: "", item_type: "apparatus", serial_number: "", location: "", condition: "good", total_quantity: 1, available_quantity: 1, min_quantity: 0, lab_id: "", notes: "", concentration: "", hazard_class: "", expiry_date: "" });
    setOpen(true);
  }
  function exportCsv() {
    const headers = ["Name","Type","Serial","Location","Lab","Condition","Total","Available","MinStock","LowStock","Concentration","HazardClass","Expiry","Notes"];
    const labMap = new Map((labs.data ?? []).map((l) => [l.id, l.name]));
    const rows = items.map((i) => [i.name, i.item_type ?? "", i.serial_number ?? "", i.location ?? "", labMap.get(i.lab_id ?? "") ?? "", i.condition, i.total_quantity, i.available_quantity, i.min_quantity, i.available_quantity <= i.min_quantity ? "YES" : "", i.concentration ?? "", i.hazard_class ?? "", i.expiry_date ?? "", (i.notes ?? "").replace(/[\r\n]+/g," ")]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lab-inventory-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-medium">Equipment &amp; apparatus</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
          {canManage && <Button size="sm" onClick={startAdd}><Plus className="h-4 w-4 mr-1.5" />Add</Button>}
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Lab</TableHead><TableHead>Type</TableHead><TableHead>Details</TableHead><TableHead>Condition</TableHead><TableHead className="text-right">Avail/Total</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {items.map((it) => {
              const low = it.available_quantity <= it.min_quantity;
              const labName = (labs.data ?? []).find((l) => l.id === it.lab_id)?.name ?? "—";
              const expired = it.expiry_date && new Date(it.expiry_date) < new Date();
              return (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.name}{it.serial_number && <div className="text-xs text-muted-foreground">SN: {it.serial_number}</div>}</TableCell>
                  <TableCell>{labName}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{it.item_type ?? "apparatus"}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {it.item_type === "chemical" ? (
                      <>
                        {it.concentration && <div>Conc: {it.concentration}</div>}
                        {it.hazard_class && <div>Hazard: {it.hazard_class}</div>}
                        {it.expiry_date && <div className={expired ? "text-destructive" : ""}>Expiry: {it.expiry_date}{expired ? " (expired)" : ""}</div>}
                      </>
                    ) : (it.location ?? "—")}
                  </TableCell>
                  <TableCell><Badge variant="outline">{it.condition}</Badge></TableCell>
                  <TableCell className="text-right">{it.available_quantity}/{it.total_quantity}</TableCell>
                  <TableCell>{low ? <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Low stock</Badge> : <Badge variant="secondary">OK</Badge>}</TableCell>
                  {canManage && <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(it)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this item?")) remove.mutate(it.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>}
                </TableRow>
              );
            })}
            {items.length === 0 && <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center text-muted-foreground py-8">No items yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} apparatus</DialogTitle><DialogDescription>Track inventory and low-stock thresholds.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Category</Label>
              <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v as "apparatus" | "equipment" | "chemical" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="apparatus">Apparatus</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="chemical">Chemicals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Serial number</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div>
              <Label>Lab</Label>
              <Select value={form.lab_id || "none"} onValueChange={(v) => setForm({ ...form, lab_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(labs.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["new","good","fair","poor","out_of_service"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Total qty</Label><Input type="number" value={form.total_quantity} onChange={(e) => setForm({ ...form, total_quantity: Number(e.target.value) })} /></div>
            <div><Label>Available qty</Label><Input type="number" value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: Number(e.target.value) })} /></div>
            <div><Label>Min stock (low-stock alert at ≤)</Label><Input type="number" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: Number(e.target.value) })} /></div>
            {form.item_type === "chemical" && (
              <>
                <div><Label>Concentration</Label><Input placeholder="e.g. 0.1 M, 30%" value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })} /></div>
                <div><Label>Hazard class</Label><Input placeholder="e.g. Corrosive, Flammable" value={form.hazard_class} onChange={(e) => setForm({ ...form, hazard_class: e.target.value })} /></div>
                <div><Label>Expiry date</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              </>
            )}
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => upsert.mutate()} disabled={!form.name.trim() || upsert.isPending}>{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============ Labs ============ */
function LabsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const labs = useLabs();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lab | null>(null);
  const [form, setForm] = useState({ name: "", code: "", location: "", capacity: 0, safety_rules: "", is_active: true });

  const labSessionId = useCurrentSessionId();
  const upsert = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name.trim(), code: form.code || null, location: form.location || null, capacity: Number(form.capacity) || null, safety_rules: form.safety_rules || null, is_active: form.is_active, ...(labSessionId ? { academic_session_id: labSessionId } : {}) };
      if (editing) { const { error } = await supabase.from("labs").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("labs").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["labs"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("labs", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["labs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function startAdd() { setEditing(null); setForm({ name: "", code: "", location: "", capacity: 0, safety_rules: "", is_active: true }); setOpen(true); }
  function startEdit(l: Lab) { setEditing(l); setForm({ name: l.name, code: l.code ?? "", location: l.location ?? "", capacity: l.capacity ?? 0, safety_rules: l.safety_rules ?? "", is_active: l.is_active }); setOpen(true); }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-medium">Labs</h2>{canManage && <Button size="sm" onClick={startAdd}><Plus className="h-4 w-4 mr-1.5" />Add lab</Button>}</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Location</TableHead><TableHead className="text-right">Capacity</TableHead><TableHead>Active</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {(labs.data ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell>{l.code ?? "—"}</TableCell>
                <TableCell>{l.location ?? "—"}</TableCell>
                <TableCell className="text-right">{l.capacity ?? "—"}</TableCell>
                <TableCell>{l.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                {canManage && <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(l)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete lab and its sessions/incidents?")) remove.mutate(l.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>}
              </TableRow>
            ))}
            {(labs.data ?? []).length === 0 && <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-8">No labs yet. Add one to start scheduling.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} lab</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Capacity</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-2"><Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: Boolean(v) })} id="lab-active" /><Label htmlFor="lab-active">Active</Label></div>
            <div className="col-span-2"><Label>Safety rules</Label><Textarea rows={6} value={form.safety_rules} onChange={(e) => setForm({ ...form, safety_rules: e.target.value })} placeholder="One rule per line…" /></div>
          </div>
          <DialogFooter><Button onClick={() => upsert.mutate()} disabled={!form.name.trim() || upsert.isPending}>{editing ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============ Sessions ============ */
function SessionsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const labs = useLabs();
  const classes = useClasses();
  const staff = useStaff();
  const subjects = useSubjects();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [form, setForm] = useState({ lab_id: "", class_id: "", subject_id: "", teacher_id: "", title: "", start_at: "", end_at: "", notes: "" });

  const { data: sessions = [] } = useQuery({
    queryKey: ["lab-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_sessions").select("*").order("start_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });

  const labSessionId = useCurrentSessionId();
  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        lab_id: form.lab_id,
        class_id: form.class_id || null,
        subject_id: form.subject_id || null,
        teacher_id: form.teacher_id || null,
        title: form.title.trim(),
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        notes: form.notes || null,
        ...(labSessionId ? { academic_session_id: labSessionId } : {}),
      };
      if (editing) { const { error } = await supabase.from("lab_sessions").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("lab_sessions").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["lab-sessions"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("lab_sessions", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["lab-sessions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function startAdd() {
    setEditing(null);
    const now = new Date(); const later = new Date(now.getTime() + 60 * 60 * 1000);
    setForm({ lab_id: labs.data?.[0]?.id ?? "", class_id: "", subject_id: "", teacher_id: "", title: "", start_at: toLocal(now), end_at: toLocal(later), notes: "" });
    setOpen(true);
  }
  function startEdit(s: Session) {
    setEditing(s);
    setForm({ lab_id: s.lab_id, class_id: s.class_id ?? "", subject_id: s.subject_id ?? "", teacher_id: s.teacher_id ?? "", title: s.title, start_at: toLocal(new Date(s.start_at)), end_at: toLocal(new Date(s.end_at)), notes: s.notes ?? "" });
    setOpen(true);
  }

  const labMap = useMemo(() => new Map((labs.data ?? []).map((l) => [l.id, l.name])), [labs.data]);
  const classMap = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-medium">Lab session timetable</h2>{canManage && <Button size="sm" onClick={startAdd} disabled={!(labs.data ?? []).length}><Plus className="h-4 w-4 mr-1.5" />Schedule</Button>}</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Lab</TableHead><TableHead>Class</TableHead><TableHead>Title</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap">{new Date(s.start_at).toLocaleString()}<div className="text-xs text-muted-foreground">→ {new Date(s.end_at).toLocaleTimeString()}</div></TableCell>
                <TableCell>{labMap.get(s.lab_id) ?? "—"}</TableCell>
                <TableCell>{s.class_id ? classMap.get(s.class_id) ?? "—" : "—"}</TableCell>
                <TableCell>{s.title}</TableCell>
                {canManage && <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete session?")) remove.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>}
              </TableRow>
            ))}
            {sessions.length === 0 && <TableRow><TableCell colSpan={canManage ? 5 : 4} className="text-center text-muted-foreground py-8">No sessions scheduled.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Schedule"} session</DialogTitle><DialogDescription>Conflicts in the same lab or class are blocked automatically.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <Label>Lab</Label>
              <Select value={form.lab_id} onValueChange={(v) => setForm({ ...form, lab_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select lab" /></SelectTrigger>
                <SelectContent>{(labs.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class</Label>
              <Select value={form.class_id || "none"} onValueChange={(v) => setForm({ ...form, class_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={form.subject_id || "none"} onValueChange={(v) => setForm({ ...form, subject_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(subjects.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Teacher</Label>
              <Select value={form.teacher_id || "none"} onValueChange={(v) => setForm({ ...form, teacher_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(staff.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Start</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></div>
            <div><Label>End</Label><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => upsert.mutate()} disabled={!form.lab_id || !form.title.trim() || !form.start_at || !form.end_at || upsert.isPending}>{editing ? "Update" : "Schedule"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function toLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ============ Safety ============ */
function SafetyTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const labs = useLabs();
  const [labId, setLabId] = useState<string>("");
  const activeLab = (labs.data ?? []).find((l) => l.id === (labId || labs.data?.[0]?.id));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ severity: "minor", description: "", actions_taken: "", session_id: "" });

  const { data: incidents = [] } = useQuery({
    queryKey: ["lab-incidents", activeLab?.id],
    enabled: !!activeLab?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_incidents").select("*").eq("lab_id", activeLab!.id).order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Incident[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lab_incidents").insert({ lab_id: activeLab!.id, severity: form.severity, description: form.description.trim(), actions_taken: form.actions_taken || null, session_id: form.session_id || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Logged"); qc.invalidateQueries({ queryKey: ["lab-incidents", activeLab?.id] }); setOpen(false); setForm({ severity: "minor", description: "", actions_taken: "", session_id: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("lab_incidents", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["lab-incidents", activeLab?.id] }); },
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Safety rules</h2>
          <Select value={activeLab?.id ?? ""} onValueChange={setLabId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select lab" /></SelectTrigger>
            <SelectContent>{(labs.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {activeLab ? (
          activeLab.safety_rules ? <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-md p-3">{activeLab.safety_rules}</pre> : <p className="text-sm text-muted-foreground">No safety rules set. Edit the lab to add them.</p>
        ) : <p className="text-sm text-muted-foreground">Add a lab first.</p>}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Incident / accident log</h2>
          {canManage && activeLab && <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Log</Button>}
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {incidents.map((i) => (
            <div key={i.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <Badge variant={i.severity === "severe" ? "destructive" : i.severity === "moderate" ? "default" : "secondary"}>{i.severity}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(i.occurred_at).toLocaleString()}</span>
              </div>
              <p className="mt-1">{i.description}</p>
              {i.actions_taken && <p className="mt-1 text-xs text-muted-foreground"><strong>Actions:</strong> {i.actions_taken}</p>}
              {canManage && <div className="text-right mt-1"><Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) remove.mutate(i.id); }}><Trash2 className="h-4 w-4" /></Button></div>}
            </div>
          ))}
          {incidents.length === 0 && <p className="text-sm text-muted-foreground">No incidents logged.</p>}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log incident</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["minor","moderate","severe"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Actions taken</Label><Textarea value={form.actions_taken} onChange={(e) => setForm({ ...form, actions_taken: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.description.trim() || create.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ Groups ============ */
function GroupsTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const labs = useLabs();
  const classes = useClasses();
  const students = useStudents();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [form, setForm] = useState({ lab_id: "", class_id: "", name: "", notes: "" });
  const [memberOpen, setMemberOpen] = useState<Group | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["lab-groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_groups").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });
  const { data: members = [] } = useQuery({
    queryKey: ["lab-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_group_members").select("*");
      if (error) throw error;
      return (data ?? []) as GroupMember[];
    },
  });

  const labSessionId = useCurrentSessionId();
  const upsert = useMutation({
    mutationFn: async () => {
      const payload = { lab_id: form.lab_id || null, class_id: form.class_id || null, name: form.name.trim(), notes: form.notes || null, ...(labSessionId ? { academic_session_id: labSessionId } : {}) };
      if (editing) { const { error } = await supabase.from("lab_groups").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("lab_groups").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["lab-groups"] }); setOpen(false); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await softDelete("lab_groups", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["lab-groups"] }); qc.invalidateQueries({ queryKey: ["lab-group-members"] }); },
  });
  const toggleMember = useMutation({
    mutationFn: async ({ group_id, student_id, add }: { group_id: string; student_id: string; add: boolean }) => {
      if (add) { const { error } = await supabase.from("lab_group_members").insert({ group_id, student_id }); if (error) throw error; }
      else { const { error } = await supabase.from("lab_group_members").delete().match({ group_id, student_id }); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lab-group-members"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const labMap = useMemo(() => new Map((labs.data ?? []).map((l) => [l.id, l.name])), [labs.data]);
  const classMap = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);
  const memberCounts = useMemo(() => {
    const m = new Map<string, number>();
    members.forEach((mm) => m.set(mm.group_id, (m.get(mm.group_id) ?? 0) + 1));
    return m;
  }, [members]);

  const eligibleStudents = useMemo(() => {
    if (!memberOpen) return [] as StudentRow[];
    const all = students.data ?? [];
    return memberOpen.class_id ? all.filter((s) => s.class_id === memberOpen.class_id) : all;
  }, [memberOpen, students.data]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between"><h2 className="font-medium">Student groups</h2>{canManage && <Button size="sm" onClick={() => { setEditing(null); setForm({ lab_id: "", class_id: "", name: "", notes: "" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" />New group</Button>}</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Lab</TableHead><TableHead>Class</TableHead><TableHead className="text-right">Members</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>{g.lab_id ? labMap.get(g.lab_id) ?? "—" : "—"}</TableCell>
                <TableCell>{g.class_id ? classMap.get(g.class_id) ?? "—" : "—"}</TableCell>
                <TableCell className="text-right">{memberCounts.get(g.id) ?? 0}</TableCell>
                {canManage && <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => setMemberOpen(g)}>Members</Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(g); setForm({ lab_id: g.lab_id ?? "", class_id: g.class_id ?? "", name: g.name, notes: g.notes ?? "" }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete group?")) remove.mutate(g.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>}
              </TableRow>
            ))}
            {groups.length === 0 && <TableRow><TableCell colSpan={canManage ? 5 : 4} className="text-center text-muted-foreground py-8">No groups yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} group</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Lab</Label>
              <Select value={form.lab_id || "none"} onValueChange={(v) => setForm({ ...form, lab_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(labs.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Class</Label>
              <Select value={form.class_id || "none"} onValueChange={(v) => setForm({ ...form, class_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => upsert.mutate()} disabled={!form.name.trim() || upsert.isPending}>{editing ? "Update" : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!memberOpen} onOpenChange={(o) => !o && setMemberOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Members — {memberOpen?.name}</DialogTitle><DialogDescription>{memberOpen?.class_id ? "Showing students of the assigned class." : "Showing all active students."}</DialogDescription></DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {eligibleStudents.map((s) => {
              const inGroup = members.some((m) => m.group_id === memberOpen!.id && m.student_id === s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <Checkbox checked={inGroup} onCheckedChange={(v) => toggleMember.mutate({ group_id: memberOpen!.id, student_id: s.id, add: Boolean(v) })} />
                  <span>{s.full_name}</span>
                </label>
              );
            })}
            {eligibleStudents.length === 0 && <p className="text-sm text-muted-foreground">No students.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============ Attendance ============ */
function AttendanceTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const students = useStudents();
  const [sessionId, setSessionId] = useState<string>("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["lab-sessions-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_sessions").select("id,title,start_at,class_id").order("start_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const session = sessions.find((s) => s.id === sessionId) as { id: string; title: string; start_at: string; class_id: string | null } | undefined;

  const { data: attendance = [] } = useQuery({
    queryKey: ["lab-attendance", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_attendance").select("*").eq("session_id", sessionId);
      if (error) throw error;
      return (data ?? []) as Attendance[];
    },
  });

  const roster = useMemo(() => {
    if (!session) return [] as StudentRow[];
    const all = students.data ?? [];
    return session.class_id ? all.filter((s) => s.class_id === session.class_id) : all;
  }, [session, students.data]);

  const setStatus = useMutation({
    mutationFn: async ({ student_id, status }: { student_id: string; status: string }) => {
      const existing = attendance.find((a) => a.student_id === student_id);
      if (existing) { const { error } = await supabase.from("lab_attendance").update({ status }).eq("id", existing.id); if (error) throw error; }
      else { const { error } = await supabase.from("lab_attendance").insert({ session_id: sessionId, student_id, status }); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lab-attendance", sessionId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-medium">Attendance</h2>
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger className="w-80"><SelectValue placeholder="Select session" /></SelectTrigger>
          <SelectContent>{sessions.map((s) => <SelectItem key={s.id} value={s.id}>{new Date(s.start_at).toLocaleString()} — {s.title}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {session ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {roster.map((s) => {
                const cur = attendance.find((a) => a.student_id === s.id)?.status ?? "";
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell>
                      <Select value={cur} onValueChange={(v) => canManage && setStatus.mutate({ student_id: s.id, status: v })} disabled={!canManage}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{["present","absent","late","excused"].map((st) => <SelectItem key={st} value={st}>{st}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {roster.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No students in this session's class.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      ) : <p className="text-sm text-muted-foreground">Pick a session to take attendance.</p>}
    </Card>
  );
}

/* ============ Reports ============ */
function ReportsTab() {
  const { data: sessions = [] } = useQuery({
    queryKey: ["lab-report-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_sessions").select("id,lab_id,start_at,end_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: equipment = [] } = useQuery({
    queryKey: ["lab-report-equipment"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment").select("*");
      if (error) throw error;
      return (data ?? []) as Equipment[];
    },
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ["lab-report-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_incidents").select("id,severity,occurred_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const labs = useLabs();

  const usageByLab = useMemo(() => {
    const m = new Map<string, { hours: number; sessions: number }>();
    sessions.forEach((s) => {
      const hrs = (new Date(s.end_at).getTime() - new Date(s.start_at).getTime()) / 3600000;
      const cur = m.get(s.lab_id) ?? { hours: 0, sessions: 0 };
      m.set(s.lab_id, { hours: cur.hours + hrs, sessions: cur.sessions + 1 });
    });
    return m;
  }, [sessions]);
  const lowStock = equipment.filter((e) => e.available_quantity <= e.min_quantity);

  function exportInventory() {
    const headers = ["Name","Category","Location","Total","Available","MinStock","LowStock","Condition"];
    const rows = equipment.map((e) => [e.name, e.category ?? "", e.location ?? "", e.total_quantity, e.available_quantity, e.min_quantity, e.available_quantity <= e.min_quantity ? "YES" : "", e.condition]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lab-inventory-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="p-4"><div className="text-sm text-muted-foreground">Total sessions</div><div className="text-3xl font-semibold">{sessions.length}</div></Card>
      <Card className="p-4"><div className="text-sm text-muted-foreground">Apparatus items</div><div className="text-3xl font-semibold">{equipment.length}</div></Card>
      <Card className="p-4"><div className="text-sm text-muted-foreground">Incidents logged</div><div className="text-3xl font-semibold">{incidents.length}</div></Card>

      <Card className="p-4 md:col-span-2 space-y-2">
        <h3 className="font-medium">Lab usage</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Lab</TableHead><TableHead className="text-right">Sessions</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
          <TableBody>
            {(labs.data ?? []).map((l) => {
              const u = usageByLab.get(l.id) ?? { hours: 0, sessions: 0 };
              return <TableRow key={l.id}><TableCell>{l.name}</TableCell><TableCell className="text-right">{u.sessions}</TableCell><TableCell className="text-right">{u.hours.toFixed(1)}</TableCell></TableRow>;
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-medium">Inventory</h3><Button size="sm" variant="outline" onClick={exportInventory}><Download className="h-4 w-4 mr-1.5" />CSV</Button></div>
        <p className="text-sm text-muted-foreground">Low-stock items: <strong className="text-foreground">{lowStock.length}</strong></p>
        <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
          {lowStock.map((e) => <li key={e.id} className="flex justify-between"><span>{e.name}</span><Badge variant="destructive">{e.available_quantity}/{e.min_quantity}</Badge></li>)}
          {lowStock.length === 0 && <li className="text-muted-foreground">All stock above thresholds.</li>}
        </ul>
      </Card>
    </div>
  );
}
