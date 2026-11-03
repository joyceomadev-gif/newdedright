import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, Users, GraduationCap, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/export-csv";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { softDelete } from "@/lib/soft-delete";
import { SessionSelect } from "@/components/SessionSelect";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

type Level = "nursery" | "primary" | "jss" | "sss";
const LEVELS: { value: Level; label: string }[] = [
  { value: "nursery", label: "Creche / Nursery" },
  { value: "primary", label: "Primary" },
  { value: "jss", label: "JSS" },
  { value: "sss", label: "SSS" },
];

interface ClassRow {
  id: string; name: string; level: Level;
  branch_id: string | null; class_teacher_id: string | null; session_id: string | null;
}
interface BranchRow { id: string; name: string }
interface StaffRow { id: string; full_name: string; position: string | null }
interface StudentRow { id: string; full_name: string; admission_no: string; class_id: string | null }
interface SessionRow { id: string; name: string; is_current: boolean }

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function ClassesPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<ClassRow | null>(null);
  const [confirmDel, setConfirmDel] = useState<ClassRow | null>(null);
  const [rosterFor, setRosterFor] = useState<ClassRow | null>(null);
  const [levelFilter, setLevelFilter] = useState<Level | "all">("all");

  const { data: classes } = useQuery({
    queryKey: ["classes-mgmt"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes")
        .select("id,name,level,branch_id,class_teacher_id,session_id")
        .is("deleted_at", null).order("level").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const { data: branches } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as BranchRow[];
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff")
        .select("id,full_name,position").eq("is_active", true).order("full_name");
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });

  const { data: studentCounts } = useQuery({
    queryKey: ["student-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("class_id").eq("status", "active");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((s: { class_id: string | null }) => {
        if (s.class_id) counts[s.class_id] = (counts[s.class_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("classes", id);
    },
    onSuccess: () => {
      toast.success("Class deleted.");
      qc.invalidateQueries({ queryKey: ["classes-mgmt"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const branchMap = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const filtered = (classes ?? []).filter((c) => levelFilter === "all" || c.level === levelFilter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Classes</h1>
        <p className="text-muted-foreground text-sm">Create classes, assign class teachers, and manage student rosters.</p>
      </div>
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Level">
            <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as Level | "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv("classes", filtered, [
                { header: "Name", accessor: (c) => c.name },
                { header: "Level", accessor: (c) => LEVELS.find((l) => l.value === c.level)?.label ?? c.level },
                { header: "Branch", accessor: (c) => c.branch_id ? (branchMap.get(c.branch_id) ?? "") : "" },
                { header: "Class teacher", accessor: (c) => c.class_teacher_id ? (staffMap.get(c.class_teacher_id) ?? "") : "" },
                { header: "Students", accessor: (c) => (studentCounts?.[c.id] ?? 0) },
              ])
            }
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-1" />Export
          </Button>
          {isAdmin && (
            <BulkImportDialog
              title="Bulk import classes"
              description="Upload an Excel (.xlsx) or CSV file. Level must be one of: nursery, primary, jss, sss. Branch and class teacher are optional; if provided they must match an existing name exactly."
              templateName="classes-template"
              templateHeaders={["name", "level", "branch", "class_teacher"]}
              requiredHeaders={["name", "level"]}
              onImportRow={async (r) => {
                const name = (r["name"] ?? "").trim();
                const level = (r["level"] ?? "").trim().toLowerCase();
                if (!["nursery", "primary", "jss", "sss"].includes(level)) {
                  throw new Error(`Invalid level "${level}". Use nursery, primary, jss, or sss.`);
                }
                const branchName = (r["branch"] ?? "").trim();
                const teacherName = (r["class_teacher"] ?? "").trim();
                let branch_id: string | null = null;
                if (branchName) {
                  const b = (branches ?? []).find((x) => x.name.toLowerCase() === branchName.toLowerCase());
                  if (!b) throw new Error(`Branch "${branchName}" not found.`);
                  branch_id = b.id;
                }
                let class_teacher_id: string | null = null;
                if (teacherName) {
                  const t = (staff ?? []).find((x) => x.full_name.toLowerCase() === teacherName.toLowerCase());
                  if (!t) throw new Error(`Teacher "${teacherName}" not found.`);
                  class_teacher_id = t.id;
                }
                const { data: cur } = await supabase.from("sessions").select("id").eq("is_current", true).maybeSingle();
                const { error } = await supabase.from("classes").insert({
                  name, level: level as Level, branch_id, class_teacher_id,
                  session_id: (cur as { id: string } | null)?.id ?? null,
                });
                if (error) throw error;
              }}
              onCompleted={() => qc.invalidateQueries({ queryKey: ["classes-mgmt"] })}
            />
          )}
          {isAdmin && (
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New class</Button></DialogTrigger>
              <ClassDialog branches={branches ?? []} staff={staff ?? []}
                onClose={() => setOpenAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["classes-mgmt"] })} />
            </Dialog>
          )}
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Level</TableHead>
              <TableHead>Branch</TableHead><TableHead>Class teacher</TableHead>
              <TableHead className="text-center">Students</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No classes yet.</TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><Badge variant="outline">{LEVELS.find((l) => l.value === c.level)?.label ?? c.level}</Badge></TableCell>
                  <TableCell>{c.branch_id ? branchMap.get(c.branch_id) ?? "—" : "—"}</TableCell>
                  <TableCell>{c.class_teacher_id ? staffMap.get(c.class_teacher_id) ?? "—" : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="text-center">{studentCounts?.[c.id] ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setRosterFor(c)} title="Manage roster">
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {editing && (
        <ClassDialog row={editing} branches={branches ?? []} staff={staff ?? []}
          onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["classes-mgmt"] })} />
      )}

      {rosterFor && (
        <RosterDialog cls={rosterFor} canEdit={isAdmin} onClose={() => setRosterFor(null)} />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete class?</AlertDialogTitle>
            <AlertDialogDescription>"{confirmDel?.name}" will be removed. Students currently in this class will be unassigned.</AlertDialogDescription>
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

function ClassDialog({ row, branches, staff, onClose, onSaved }: {
  row?: ClassRow; branches: BranchRow[]; staff: StaffRow[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!row;
  const [form, setForm] = useState({
    name: row?.name ?? "",
    level: (row?.level ?? "primary") as Level,
    branch_id: row?.branch_id ?? "",
    class_teacher_id: row?.class_teacher_id ?? "",
    session_id: (row as unknown as { session_id?: string | null })?.session_id ?? "",
  });
  const [coTeachers, setCoTeachers] = useState<Set<string>>(new Set());

  const { data: currentSession } = useQuery({
    queryKey: ["current-session"],
    queryFn: async () => {
      const { data } = await supabase.from("sessions").select("id").eq("is_current", true).maybeSingle();
      return data as { id: string } | null;
    },
    enabled: !isEdit,
  });

  useQuery({
    queryKey: ["class-teachers", row?.id],
    enabled: !!row?.id,
    queryFn: async () => {
      const { data } = await supabase.from("class_teachers").select("staff_id").eq("class_id", row!.id);
      setCoTeachers(new Set((data ?? []).map((r) => r.staff_id as string)));
      return data ?? [];
    },
  });

  async function syncJunction(classId: string, primary: string | null, extras: Set<string>) {
    const desired = new Set<string>(extras);
    if (primary) desired.add(primary);
    // Wipe + reinsert (small sets)
    await supabase.from("class_teachers").delete().eq("class_id", classId);
    if (desired.size === 0) return;
    const rows = Array.from(desired).map((sid) => ({
      class_id: classId, staff_id: sid, is_primary: sid === primary,
    }));
    const { error } = await supabase.from("class_teachers").insert(rows);
    if (error) throw error;
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Class name is required.");
      const primary = form.class_teacher_id || null;
      const payload = {
        name: form.name.trim(),
        level: form.level,
        branch_id: form.branch_id || null,
        class_teacher_id: primary,
        session_id: form.session_id || null,
      };
      let classId = row?.id;
      if (isEdit && row) {
        const { error } = await supabase.from("classes").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("classes")
          .insert({ ...payload, session_id: form.session_id || currentSession?.id || null }).select("id").single();
        if (error) throw error;
        classId = data.id;
      }
      if (classId) await syncJunction(classId, primary, coTeachers);
    },
    onSuccess: () => { toast.success(isEdit ? "Class updated." : "Class created."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dlg = (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit class" : "New class"}</DialogTitle>
        <DialogDescription>Set name, level, branch, and the class teachers.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <Field label="Class name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. JSS 1A" maxLength={80} />
        </Field>
        <SessionSelect
          value={form.session_id}
          onChange={(v) => setForm({ ...form, session_id: v })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level" required>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v as Level })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Branch">
            <Select value={form.branch_id || "none"} onValueChange={(v) => setForm({ ...form, branch_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Main" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Primary class teacher">
          <Select value={form.class_teacher_id || "none"} onValueChange={(v) => setForm({ ...form, class_teacher_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Unassigned —</SelectItem>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}{s.position ? ` (${s.position})` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Co-teachers (additional)">
          <div className="max-h-48 overflow-auto border rounded-md p-2 space-y-1">
            {staff.length === 0 && <p className="text-xs text-muted-foreground">No staff yet.</p>}
            {staff.filter((s) => s.id !== form.class_teacher_id).map((s) => {
              const checked = coTeachers.has(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(coTeachers);
                      if (v) next.add(s.id); else next.delete(s.id);
                      setCoTeachers(next);
                    }}
                  />
                  <span>{s.full_name}{s.position ? ` (${s.position})` : ""}</span>
                </label>
              );
            })}
          </div>
        </Field>
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


/* ============= ROSTER ============= */
function RosterDialog({ cls, canEdit, onClose }: { cls: ClassRow; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: students } = useQuery({
    queryKey: ["roster-students", cls.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,admission_no,class_id")
        .eq("status", "active").order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const inClass = useMemo(() => (students ?? []).filter((s) => s.class_id === cls.id), [students, cls.id]);
  const others = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (students ?? []).filter((s) =>
      s.class_id !== cls.id && (!q || s.full_name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q))
    );
  }, [students, cls.id, search]);

  const assign = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("Pick at least one student.");
      const { error } = await supabase.from("students").update({ class_id: cls.id }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`Assigned ${ids.length} student(s) to ${cls.name}.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["roster-students", cls.id] });
      qc.invalidateQueries({ queryKey: ["student-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStudent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("students").update({ class_id: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from class.");
      qc.invalidateQueries({ queryKey: ["roster-students", cls.id] });
      qc.invalidateQueries({ queryKey: ["student-counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Roster — {cls.name}</DialogTitle>
          <DialogDescription>Assign students to this class or remove them.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Currently in class ({inClass.length})</h4>
            <div className="rounded-md border max-h-72 overflow-y-auto">
              {inClass.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No students yet.</p>
              ) : inClass.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground">{s.admission_no}</div>
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => removeStudent.mutate(s.id)} disabled={removeStudent.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Add students</h4>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search by name or admission no"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="rounded-md border max-h-60 overflow-y-auto">
              {others.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No matching students.</p>
              ) : others.slice(0, 200).map((s) => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 cursor-pointer hover:bg-muted/40">
                  <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} disabled={!canEdit} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground">{s.admission_no}{s.class_id ? " • currently assigned" : ""}</div>
                  </div>
                </label>
              ))}
            </div>
            {canEdit && (
              <Button size="sm" disabled={selected.size === 0 || assign.isPending}
                onClick={() => assign.mutate(Array.from(selected))}>
                <GraduationCap className="h-4 w-4 mr-1" />
                Assign {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
