import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client"; import { LogoUploader } from "@/components/LogoUploader";
import { fetchAllPaged } from "@/lib/paginated-fetch";
import { fetchAdminRoleRows } from "@/lib/admin-role-rows";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarDays, Settings as SettingsIcon, Shield, Building2, Layers,
  Plus, Trash2, Loader2, AlertCircle, RefreshCw, CheckCircle2, ArrowRightLeft,
  GraduationCap, History, FastForward, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import { validateSettings } from "@/lib/scoring";
import { useAuth } from "@/lib/auth-context";
import { formatDistanceToNow } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { createUserWithRoles, sendPasswordReset, updateUser, deleteUser, revokeAdminRights } from "@/lib/users.functions";
import { KeyRound, UserPlus, Pencil, ShieldOff } from "lucide-react";
import { AssessmentStructureManager } from "@/components/academic/AssessmentStructureManager";
import { GradingScaleManager } from "@/components/academic/GradingScaleManager";
import { RolePermissionManager } from "@/components/academic/RolePermissionManager";
import { softDelete } from "@/lib/soft-delete";
import { SchoolExcelExportButton } from "@/components/SchoolExcelExportButton";
import { UserRoleImportDialog } from "@/components/UserRoleImportDialog";

export const Route = createFileRoute("/_authenticated/administration")({
  head: () => ({ meta: [
    { title: "School Administration — Users, Roles & Settings" },
    { name: "description", content: "Manage school users, role imports, sessions, and school settings." },
    { property: "og:title", content: "School Administration — Users, Roles & Settings" },
    { property: "og:description", content: "Manage school users, role imports, sessions, and school settings." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdministrationPage,
});

type AppRole = "super_admin" | "admin" | "teacher" | "student" | "parent";
const ROLES: AppRole[] = ["super_admin", "admin", "teacher", "student", "parent"];
const SUPER_ADMIN_EMAIL = "joyceomadev@gmail.com";
const ASSIGNABLE_ROLES: AppRole[] = ["admin", "teacher", "student", "parent"];
const ADMIN_TIER_ROLES: AppRole[] = ["admin"];

interface SessionRow { id: string; name: string; start_date: string; end_date: string; is_current: boolean }
interface TermRow { id: string; session_id: string; name: "first" | "second" | "third"; start_date: string; end_date: string; is_current: boolean }
interface BranchRow { id: string; name: string; code: string | null; address: string | null; phone: string | null; is_main: boolean; is_active: boolean }
interface ClassRow { id: string; name: string }
interface ProfileRow { id: string; full_name: string; email: string | null }
interface RoleRow { id: string; user_id: string; role: AppRole }
interface SettingsRow {
  id: number;
  grading_scale: GradeBand[];
  promotion_min_average: number;
  ca1_weight: number; ca2_weight: number; ca3_weight: number; exam_weight: number;
  school_name: string | null;
  scoring_scheme: "weighted_ca_exam" | "running_average" | "display_only";
  cumulative_method: "average_of_terms" | "sum_of_terms";
}
interface GradeBand { grade: string; min: number; max: number; remark: string }

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AdministrationPage() {
  const { roles, isAdmin } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Administration</h1>
          <p className="text-sm text-muted-foreground">Sessions, school settings, roles and branches.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {isAdmin && <SchoolExcelExportButton />}
        {isSuperAdmin && (
          <Button asChild variant="outline">
            <Link to="/recycle-bin">
              <Trash2 className="h-4 w-4 mr-1.5" /> Recycle Bin
            </Link>
          </Button>
        )}
        </div>
      </div>
      <Tabs defaultValue="sessions">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sessions"><CalendarDays className="h-4 w-4 mr-1.5" />Sessions &amp; Terms</TabsTrigger>
          <TabsTrigger value="assessment-config"><Layers className="h-4 w-4 mr-1.5" />Assessment &amp; Grading</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1.5" />School Settings</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="h-4 w-4 mr-1.5" />Roles</TabsTrigger>
          <TabsTrigger value="permissions"><KeyRound className="h-4 w-4 mr-1.5" />Permissions</TabsTrigger>
          <TabsTrigger value="branches"><Building2 className="h-4 w-4 mr-1.5" />Branches</TabsTrigger>
          <TabsTrigger value="promotions"><GraduationCap className="h-4 w-4 mr-1.5" />Promotions</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="mt-4"><SessionsTab /></TabsContent>
        <TabsContent value="assessment-config" className="mt-4"><AssessmentConfigTab /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
        <TabsContent value="roles" className="mt-4"><RolesTab /></TabsContent>
        <TabsContent value="permissions" className="mt-4"><RolePermissionManager /></TabsContent>
        <TabsContent value="branches" className="mt-4"><BranchesTab /></TabsContent>
        <TabsContent value="promotions" className="mt-4"><PromotionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================
   SESSIONS & TERMS
   ============================================================ */
function SessionsTab() {
  const qc = useQueryClient();
  const sessionsQ = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions").select("id,name,start_date,end_date,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });
  const termsQ = useQuery({
    queryKey: ["admin-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms").select("id,session_id,name,start_date,end_date,is_current");
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);

  const setCurrentSession = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from("sessions").update({ is_current: false }).neq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("sessions").update({ is_current: true }).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Session set as current.");
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCurrentTerm = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await supabase.from("terms").update({ is_current: false }).neq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("terms").update({ is_current: true }).eq("id", id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Term set as current.");
      qc.invalidateQueries({ queryKey: ["admin-terms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div>
            <h3 className="font-medium">Academic sessions</h3>
            <p className="text-xs text-muted-foreground">A session contains 3 terms (1st, 2nd, 3rd).</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <AdvanceTermButton onDone={() => {
              qc.invalidateQueries({ queryKey: ["admin-terms"] });
            }} />
            <Button variant="outline" size="sm" onClick={() => setRolloverOpen(true)}>
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />Rollover
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />New session
            </Button>
          </div>
        </div>
        <AdvanceTermStatus />

        {sessionsQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />Loading sessions…
          </div>
        ) : sessionsQ.isError ? (
          <ErrorBox message={(sessionsQ.error as Error).message} onRetry={() => sessionsQ.refetch()} />
        ) : (sessionsQ.data ?? []).length === 0 ? (
          <EmptyBox text="No sessions yet. Create your first session." />
        ) : (
          <div className="space-y-3">
            {sessionsQ.data!.map((s) => {
              const sessionTerms = (termsQ.data ?? []).filter((t) => t.session_id === s.id)
                .sort((a, b) => termOrder(a.name) - termOrder(b.name));
              return (
                <div key={s.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.is_current && <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Current</Badge>}
                      <span className="text-xs text-muted-foreground">{s.start_date} → {s.end_date}</span>
                    </div>
                    {!s.is_current && (
                      <Button size="sm" variant="ghost" onClick={() => setCurrentSession.mutate(s.id)} disabled={setCurrentSession.isPending}>
                        Make current
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {sessionTerms.length === 0 && (
                      <div className="text-xs text-muted-foreground sm:col-span-3">No terms found for this session.</div>
                    )}
                    {sessionTerms.map((t) => (
                      <div key={t.id} className="rounded border bg-muted/30 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">{termLabel(t.name)}</span>
                          {t.is_current ? (
                            <Badge variant="secondary" className="text-[10px]">Current</Badge>
                          ) : (
                            <button
                              className="text-primary hover:underline disabled:opacity-50"
                              onClick={() => setCurrentTerm.mutate(t.id)}
                              disabled={setCurrentTerm.isPending}
                            >Make current</button>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5">{t.start_date} → {t.end_date}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {createOpen && <CreateSessionDialog onClose={() => setCreateOpen(false)} onCreated={() => {
        qc.invalidateQueries({ queryKey: ["admin-sessions"] });
        qc.invalidateQueries({ queryKey: ["admin-terms"] });
      }} />}
      {rolloverOpen && <RolloverDialog
        sessions={sessionsQ.data ?? []}
        onClose={() => setRolloverOpen(false)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["admin-sessions"] });
          qc.invalidateQueries({ queryKey: ["admin-terms"] });
        }}
      />}
    </div>
  );
}

function termOrder(n: string) { return n === "first" ? 1 : n === "second" ? 2 : 3; }
function termLabel(n: string) { return n === "first" ? "Term 1" : n === "second" ? "Term 2" : "Term 3"; }

function CreateSessionDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !start || !end) throw new Error("Name, start and end date are required.");
      const { error } = await supabase.rpc("create_session_with_terms", {
        _name: name.trim(), _start_date: start, _end_date: end, _make_current: makeCurrent,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Session and 3 terms created."); onCreated(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New academic session</DialogTitle>
          <DialogDescription>Three terms will be auto-generated by splitting the date range evenly.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name (e.g. 2024/2025)">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2024/2025" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="End date"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={makeCurrent} onCheckedChange={setMakeCurrent} />
            Make this the current session (and Term 1 the current term)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolloverDialog({ sessions, onClose, onDone }: {
  sessions: SessionRow[]; onClose: () => void; onDone: () => void;
}) {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const classesQ = useQuery({
    queryKey: ["admin-rollover-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Array<{
    student_id: string; full_name: string; from_class_name: string | null;
    to_class_name: string | null; action: string; recommendation: string | null;
  }> | null>(null);

  function buildMappingsArray() {
    return Object.entries(mappings)
      .filter(([from]) => !!from)
      .map(([from_class_id, to_class_id]) => ({ from_class_id, to_class_id: to_class_id || null }));
  }

  const previewMut = useMutation({
    mutationFn: async () => {
      if (!fromId || !toId) throw new Error("Pick both From and To sessions.");
      if (fromId === toId) throw new Error("From and To sessions must differ.");
      const arr = buildMappingsArray();
      if (arr.length === 0) throw new Error("Add at least one class mapping.");
      const { data, error } = await supabase.rpc("rollover_session_dry_run", {
        _from_session_id: fromId, _to_session_id: toId, _mappings: arr,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    onSuccess: (rows) => setPreview(rows),
    onError: (e: Error) => toast.error(e.message),
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!fromId || !toId) throw new Error("Pick both From and To sessions.");
      if (fromId === toId) throw new Error("From and To sessions must differ.");
      const arr = buildMappingsArray();
      if (arr.length === 0) throw new Error("Add at least one class mapping.");
      const { data, error } = await supabase.rpc("rollover_session", {
        _from_session_id: fromId, _to_session_id: toId, _mappings: arr,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => { toast.success(`Rollover complete: ${count} student record(s) processed.`); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const classes = classesQ.data ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Session rollover</DialogTitle>
          <DialogDescription>
            Promote students from each class to a target class. Leave the target empty to mark as graduated.
            Run a preview first to verify counts; then apply to set the To-session as current.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From session">
              <Select value={fromId} onValueChange={(v) => { setFromId(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="To session">
              <Select value={toId} onValueChange={(v) => { setToId(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="rounded-md border max-h-60 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From class</TableHead>
                  <TableHead>To class (or graduated)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.length === 0 && (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground text-sm py-4">No classes.</TableCell></TableRow>
                )}
                {classes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Select
                        value={mappings[c.id] ?? "__none"}
                        onValueChange={(v) => { setMappings((m) => ({ ...m, [c.id]: v === "__none" ? "" : v })); setPreview(null); }}
                      >
                        <SelectTrigger><SelectValue placeholder="Skip" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— Graduate —</SelectItem>
                          {classes.map((c2) => <SelectItem key={c2.id} value={c2.id}>{c2.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {preview && (() => {
            const promoted = preview.filter((r) => r.action === "promoted").length;
            const graduated = preview.filter((r) => r.action === "graduated").length;
            const repeatRecs = preview.filter((r) => r.recommendation === "repeat").length;
            return (
              <div className="rounded-md border">
                <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30">
                  <p className="font-medium text-sm">Dry-run preview</p>
                  <Badge variant="default">{preview.length} students</Badge>
                  <Badge variant="secondary">{promoted} promoted</Badge>
                  <Badge variant="outline">{graduated} graduated</Badge>
                  {repeatRecs > 0 && (
                    <Badge variant="destructive">
                      {repeatRecs} flagged Repeat by teacher — review before applying
                    </Badge>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Teacher rec.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-4">No active students in selected classes.</TableCell></TableRow>
                      )}
                      {preview.map((r) => (
                        <TableRow key={r.student_id}>
                          <TableCell className="font-medium">{r.full_name}</TableCell>
                          <TableCell className="text-xs">{r.from_class_name ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.to_class_name ?? <span className="italic text-muted-foreground">graduated</span>}</TableCell>
                          <TableCell>
                            <Badge variant={r.action === "graduated" ? "outline" : "default"}>
                              {r.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.recommendation
                              ? <Badge variant={r.recommendation === "repeat" ? "destructive" : "secondary"}>{r.recommendation}</Badge>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })()}
        </div>
        {(run.isError || previewMut.isError) && (
          <ErrorBox
            message={((run.error ?? previewMut.error) as Error).message}
            onRetry={() => (preview ? run.mutate() : previewMut.mutate())}
            disabled={run.isPending || previewMut.isPending}
          />
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={() => previewMut.mutate()}
            disabled={previewMut.isPending || run.isPending}
          >
            {previewMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {preview ? "Refresh preview" : "Preview"}
          </Button>
          <Button
            onClick={() => run.mutate()}
            disabled={run.isPending || !preview}
            title={!preview ? "Run a preview first" : undefined}
          >
            {run.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Apply rollover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   SCHOOL SETTINGS
   ============================================================ */
function SettingsTab() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as SettingsRow | null;
    },
  });

  const [draft, setDraft] = useState<SettingsRow | null>(null);
  const current = draft ?? settingsQ.data ?? null;

  const save = useMutation({
    mutationFn: async (s: SettingsRow) => {
      const err = validateSettings(s as unknown as import("@/lib/scoring").SchoolSettings);
      if (err) throw new Error(err);
      const bands = (s.grading_scale ?? []) as GradeBand[];
      const { error } = await supabase.from("school_settings").update({
        grading_scale: JSON.parse(JSON.stringify(bands)),
        promotion_min_average: s.promotion_min_average,
        ca1_weight: s.ca1_weight,
        ca2_weight: s.ca2_weight,
        ca3_weight: s.ca3_weight ?? 0,
        exam_weight: s.exam_weight,
        school_name: s.school_name,
        scoring_scheme: s.scoring_scheme,
        cumulative_method: s.cumulative_method,
      }).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved.");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      // Gradebook & other consumers read via useSchoolSettings (key: "school-settings").
      // Invalidate so scoring_scheme / cumulative_method / weights changes take effect immediately.
      qc.invalidateQueries({ queryKey: ["school-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (settingsQ.isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (settingsQ.isError) return <ErrorBox message={(settingsQ.error as Error).message} onRetry={() => settingsQ.refetch()} />;
  if (!current) return <EmptyBox text="No settings row found." />;

  const totalWeight = Number(current.ca1_weight) + Number(current.ca2_weight) + Number(current.ca3_weight ?? 0) + Number(current.exam_weight);

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-blue-50/50 border-blue-200 text-blue-900 text-xs flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-blue-600 shrink-0" />
        <span>Assessment structures, dynamic components (CA1/CA2/Exam), skill criteria, and grading scales are managed in the dedicated <strong>Assessment &amp; Grading</strong> tab.</span>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">General</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="School name">
            <Input value={current.school_name ?? ""} onChange={(e) => setDraft({ ...current, school_name: e.target.value })} />
          </Field>
          <Field label="Promotion minimum average (%)" hint="Used by promotion rules and report cards.">
            <Input type="number" min={0} max={100} value={current.promotion_min_average}
              onChange={(e) => setDraft({ ...current, promotion_min_average: Number(e.target.value) })} />
          </Field>
        </div>
        <div className='mt-4 border-t pt-4'><LogoUploader /></div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="font-medium">Result computation</h3>
          <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 border-amber-200">Global System Fallback</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Configures tenant fallback weights. Educational levels, custom CA/Exam components, and skill criteria are dynamically managed in <strong>Assessment &amp; Grading</strong>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Scoring scheme" hint="How a single term's subject score is computed.">
            <Select
              value={
                current.scoring_scheme === "weighted_ca_exam"
                  ? ((current.ca3_weight ?? 0) > 0 ? "weighted_ca123_exam" : "weighted_ca_exam")
                  : current.scoring_scheme
              }
              onValueChange={(v) => {
                if (v === "weighted_ca123_exam") {
                  setDraft({
                    ...current,
                    scoring_scheme: "weighted_ca_exam",
                    ca1_weight: 10, ca2_weight: 10, ca3_weight: 10, exam_weight: 70,
                  });
                } else if (v === "weighted_ca_exam") {
                  setDraft({
                    ...current,
                    scoring_scheme: "weighted_ca_exam",
                    ca1_weight: 15, ca2_weight: 15, ca3_weight: 0, exam_weight: 70,
                  });
                } else {
                  setDraft({ ...current, scoring_scheme: v as SettingsRow["scoring_scheme"] });
                }
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weighted_ca_exam">Weighted CA1 + CA2 + Exam</SelectItem>
                <SelectItem value="weighted_ca123_exam">Weighted CA1 + CA2 + CA3 + Exam</SelectItem>
                <SelectItem value="running_average">Running average across terms</SelectItem>
                <SelectItem value="display_only">Display only (no computed average)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cumulative method" hint="How term scores roll up across the session.">
            <Select
              value={current.cumulative_method}
              onValueChange={(v) => setDraft({ ...current, cumulative_method: v as SettingsRow["cumulative_method"] })}
              disabled={current.scoring_scheme === "display_only"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="average_of_terms">Average of term totals</SelectItem>
                <SelectItem value="sum_of_terms">Sum of term totals</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        {draft && <Button variant="outline" onClick={() => setDraft(null)} disabled={save.isPending}>Discard changes</Button>}
        <Button onClick={() => current && save.mutate(current)} disabled={save.isPending || !draft}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   ASSESSMENT & GRADING CONFIGURATION
   ============================================================ */
function AssessmentConfigTab() {
  return (
    <div className="space-y-6">
      <AssessmentStructureManager />
      <hr className="my-6" />
      <GradingScaleManager />
    </div>
  );
}



/* ============================================================
   ROLES
   ============================================================ */
function RolesTab() {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const canSeeSuperAdmin = (user?.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL;
  // Super admin is never assignable from the UI, even for the super admin themselves.
  const visibleRoles = ASSIGNABLE_ROLES;
  const profilesQ = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () =>
      fetchAllPaged<ProfileRow>(() =>
        supabase.from("profiles").select("id,full_name,email").order("full_name") as unknown as {
          range: (from: number, to: number) => PromiseLike<{ data: ProfileRow[] | null; error: { message: string } | null }>;
        },
      ),
  });
  const rolesQ = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => (await fetchAdminRoleRows()) as RoleRow[],
  });

  const [search, setSearch] = useState("");

  const assign = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role assigned."); qc.invalidateQueries({ queryKey: ["admin-roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Role removed."); qc.invalidateQueries({ queryKey: ["admin-roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rolesByUser = useMemo(() => {
    const m = new Map<string, RoleRow[]>();
    for (const r of rolesQ.data ?? []) {
      const arr = m.get(r.user_id) ?? [];
      arr.push(r); m.set(r.user_id, arr);
    }
    return m;
  }, [rolesQ.data]);

  const superAdminUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of rolesQ.data ?? []) if (r.role === "super_admin") s.add(r.user_id);
    return s;
  }, [rolesQ.data]);

  const filtered = (profilesQ.data ?? []).filter((p) => {
    if (!canSeeSuperAdmin && superAdminUserIds.has(p.id)) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (p.full_name ?? "").toLowerCase().includes(q) || (p.email ?? "").toLowerCase().includes(q);
  });

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  const [createOpen, setCreateOpen] = useState(false);
  const sendReset = useServerFn(sendPasswordReset);
  const resetMut = useMutation({
    mutationFn: async (email: string) => sendReset({ data: { email } }),
    onSuccess: () => toast.success("Password reset email sent."),
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);

  const deleteFn = useServerFn(deleteUser);
  const revokeFn = useServerFn(revokeAdminRights);
  const deleteMut = useMutation({
    mutationFn: async (user_id: string) => deleteFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("User deleted.");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeMut = useMutation({
    mutationFn: async (user_id: string) => revokeFn({ data: { user_id } }),
    onSuccess: (res) => {
      toast.success(`Admin rights revoked (${res.removed} role${res.removed === 1 ? "" : "s"} removed).`);
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <h3 className="font-medium">Users &amp; roles</h3>
          <p className="text-xs text-muted-foreground">Create users, assign roles, send password resets. A user can hold multiple roles.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input className="max-w-xs" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {isAdmin && <UserRoleImportDialog />}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />New user
          </Button>
        </div>
      </div>

      {profilesQ.isLoading || rolesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" />Loading…
        </div>
      ) : profilesQ.isError ? (
        <ErrorBox message={(profilesQ.error as Error).message} onRetry={() => profilesQ.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="w-56">Assign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-6">No users.</TableCell></TableRow>
              )}
              {pageItems.map((p) => {
                const userRoles = rolesByUser.get(p.id) ?? [];
                const heldRoles = new Set(userRoles.map((r) => r.role));
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{p.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {userRoles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                        {userRoles.map((r) => (
                          <Badge key={r.id} variant="secondary" className="gap-1">
                            {r.role}
                            <button
                              className="hover:text-destructive"
                              onClick={() => remove.mutate(r.id)}
                              disabled={remove.isPending}
                              aria-label={`Remove ${r.role}`}
                            ><Trash2 className="h-3 w-3" /></button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5">
                        <Select onValueChange={(role) => assign.mutate({ user_id: p.id, role: role as AppRole })}>
                          <SelectTrigger><SelectValue placeholder="Add role…" /></SelectTrigger>
                          <SelectContent>
                            {visibleRoles.filter((r) => !heldRoles.has(r)).map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {p.email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 justify-start text-xs"
                            disabled={resetMut.isPending}
                            onClick={() => resetMut.mutate(p.email!)}
                          >
                            <KeyRound className="h-3 w-3 mr-1" />Send password reset
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 justify-start text-xs"
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />Edit profile
                        </Button>
                        {ADMIN_TIER_ROLES.some((r) => heldRoles.has(r)) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 justify-start text-xs"
                            disabled={revokeMut.isPending}
                            onClick={() => revokeMut.mutate(p.id)}
                          >
                            <ShieldOff className="h-3 w-3 mr-1" />Revoke admin rights
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 justify-start text-xs text-destructive hover:text-destructive"
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />Delete user
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        totalItems={filtered.length}
        start={start}
        end={end}
        onPageChange={setPage}
      />
      {createOpen && (
        <CreateUserDialog
          allowedRoles={visibleRoles}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["admin-profiles"] });
            qc.invalidateQueries({ queryKey: ["admin-roles"] });
          }}
        />
      )}
      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-profiles"] });
          }}
        />
      )}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <span className="font-medium">{deleting?.full_name || deleting?.email}</span>,
              including their login, profile and role assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) deleteMut.mutate(deleting.id); }}
            >
              {deleteMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CreateUserDialog({ onClose, onCreated, allowedRoles }: { onClose: () => void; onCreated: () => void; allowedRoles: AppRole[] }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<Set<AppRole>>(new Set());
  const createFn = useServerFn(createUserWithRoles);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const toggleRole = (r: AppRole) =>
    setRoles((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });

  const create = useMutation({
    mutationFn: async () => {
      if (!email.trim() || !fullName.trim()) throw new Error("Email and full name are required.");
      if (roles.size === 0) throw new Error("Pick at least one role.");
      return createFn({
        data: {
          email: email.trim(),
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          roles: Array.from(roles),
          send_invite: true,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.created_new
          ? `User created. ${res.invite_sent ? "Password setup email sent." : ""}`
          : "Existing account linked and roles updated.",
      );
      onCreated();
      if (res.created_new && res.password) {
        setCredentials({ username: res.username, password: res.password });
      } else {
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{credentials ? "User credentials" : "Create user"}</DialogTitle>
          <DialogDescription>
            {credentials
              ? "Save and share these credentials with the user. The password will not be shown again."
              : "Creates a login, assigns the selected roles, and emails the user a link to set their password. If the email already exists, the account is linked and roles are added."}
          </DialogDescription>
        </DialogHeader>
        {credentials ? (
          <div className="grid gap-3">
            <Field label="Username (email)">
              <Input readOnly value={credentials.username} onFocus={(e) => e.currentTarget.select()} />
            </Field>
            <Field label="Temporary password">
              <Input readOnly value={credentials.password} onFocus={(e) => e.currentTarget.select()} />
            </Field>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(`Username: ${credentials.username}\nPassword: ${credentials.password}`);
                toast.success("Credentials copied to clipboard.");
              }}
            >
              Copy credentials
            </Button>
          </div>
        ) : (
        <div className="grid gap-3">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </Field>
          <Field label="Phone (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Roles">
            <div className="grid grid-cols-2 gap-2">
              {allowedRoles.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm rounded border p-2 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={roles.has(r)} onCheckedChange={() => toggleRole(r)} />
                  <span className="capitalize">{r.replace("_", " ")}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
        )}
        <DialogFooter>
          {credentials ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Create user
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   BRANCHES
   ============================================================ */
function EditUserDialog({ user, onClose, onSaved }: { user: ProfileRow; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const updateFn = useServerFn(updateUser);

  const save = useMutation({
    mutationFn: async () => {
      if (!fullName.trim()) throw new Error("Full name is required.");
      if (!email.trim()) throw new Error("Email is required.");
      if (password && password.length < 8) throw new Error("Password must be at least 8 characters.");
      return updateFn({
        data: {
          user_id: user.id,
          full_name: fullName.trim(),
          email: email.trim(),
          password: password || undefined,
        },
      });
    },
    onSuccess: () => { toast.success("User updated."); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update profile details. Leave password blank to keep it unchanged.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="New password" hint="Minimum 8 characters. Leave blank to keep the current password.">
            <Input type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BranchesTab() {
  const qc = useQueryClient();
  const branchesQ = useQuery({
    queryKey: ["admin-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as BranchRow[];
    },
  });
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BranchRow | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("branches", id);
    },
    onSuccess: () => { toast.success("Branch deleted."); setDeleting(null); qc.invalidateQueries({ queryKey: ["admin-branches"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-medium">Branches</h3>
          <p className="text-xs text-muted-foreground">Optional. Tag classes, staff and students by branch for multi-campus setups.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5 mr-1.5" />New branch</Button>
      </div>

      {branchesQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" />Loading branches…
        </div>
      ) : branchesQ.isError ? (
        <ErrorBox message={(branchesQ.error as Error).message} onRetry={() => branchesQ.refetch()} />
      ) : (branchesQ.data ?? []).length === 0 ? (
        <EmptyBox text="No branches yet." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branchesQ.data!.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="font-medium">{b.name} {b.is_main && <Badge variant="secondary" className="ml-1 text-[10px]">Main</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{b.address}</div>
                </TableCell>
                <TableCell>{b.code ?? "—"}</TableCell>
                <TableCell>{b.phone ?? "—"}</TableCell>
                <TableCell>{b.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(creating || editing) && (
        <BranchDialog
          branch={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin-branches"] })}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete branch?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleting.name}" will be removed. Linked classes, staff and students will be unassigned (not deleted).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => del.mutate(deleting.id)} disabled={del.isPending}>
                {del.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}

function BranchDialog({ branch, onClose, onSaved }: {
  branch: BranchRow | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<BranchRow>>(branch ?? { name: "", code: "", address: "", phone: "", is_main: false, is_active: true });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.name?.trim()) throw new Error("Name is required.");
      const payload = {
        name: form.name.trim(),
        code: form.code?.trim() || null,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        is_main: !!form.is_main,
        is_active: form.is_active !== false,
      };
      if (branch) {
        const { error } = await supabase.from("branches").update(payload).eq("id", branch.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branches").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(branch ? "Branch updated." : "Branch created."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Name"><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code"><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={!!form.is_main} onCheckedChange={(v) => setForm({ ...form, is_main: v })} />
              Main branch
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_active !== false} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              Active
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   ADVANCE TERM (manual button + last cron run status)
   ============================================================ */
function AdvanceTermButton({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("advance_current_term");
      if (error) throw error;
      return data as { changed?: boolean; reason?: string; name?: string } | null;
    },
    onSuccess: (res) => {
      if (res?.changed) toast.success(`Advanced to Term ${res.name === "first" ? 1 : res.name === "second" ? 2 : 3}.`);
      else toast.message("No change", { description: res?.reason ?? "Already on the correct term." });
      qc.invalidateQueries({ queryKey: ["admin-terms"] });
      qc.invalidateQueries({ queryKey: ["system-job-advance-term"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button variant="outline" size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
      {run.isPending
        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        : <FastForward className="h-3.5 w-3.5 mr-1.5" />}
      Advance term
    </Button>
  );
}

function AdvanceTermStatus() {
  const q = useQuery({
    queryKey: ["system-job-advance-term"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_jobs")
        .select("last_run_at,last_status,last_message")
        .eq("job_name", "advance_current_term")
        .maybeSingle();
      if (error) throw error;
      return data as { last_run_at: string | null; last_status: string | null; last_message: string | null } | null;
    },
  });
  if (q.isLoading || !q.data?.last_run_at) {
    return (
      <p className="text-xs text-muted-foreground mt-1">
        Auto-advance runs daily at 01:00. No runs recorded yet.
      </p>
    );
  }
  const ran = new Date(q.data.last_run_at);
  return (
    <p className="text-xs text-muted-foreground mt-1">
      Auto-advance runs daily at 01:00 · last run {formatDistanceToNow(ran, { addSuffix: true })}
      {q.data.last_status ? ` (${q.data.last_status})` : ""}
      {q.data.last_message ? ` — ${q.data.last_message}` : ""}
    </p>
  );
}

/* ============================================================
   PROMOTION RECOMMENDATIONS (teacher pass/repeat per student)
   ============================================================ */
type RecKind = "pass" | "repeat" | "graduate";
type RecStatus = "pending" | "approved" | "rejected";
interface StudentRow { id: string; full_name: string; class_id: string | null }
interface RecRow {
  id: string; student_id: string; session_id: string;
  from_class_id: string | null; recommendation: RecKind; note: string | null;
  status: RecStatus; reviewed_by: string | null; reviewed_at: string | null;
}

function PromotionsTab() {
  return (
    <Tabs defaultValue="recommendations">
      <TabsList>
        <TabsTrigger value="recommendations"><GraduationCap className="h-4 w-4 mr-1.5" />Recommendations</TabsTrigger>
        <TabsTrigger value="history"><History className="h-4 w-4 mr-1.5" />History</TabsTrigger>
      </TabsList>
      <TabsContent value="recommendations" className="mt-4"><RecommendationsPanel /></TabsContent>
      <TabsContent value="history" className="mt-4"><PromotionsHistoryPanel /></TabsContent>
    </Tabs>
  );
}

function RecommendationsPanel() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();

  const sessionsQ = useQuery({
    queryKey: ["promo-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions")
        .select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_current: boolean }[];
    },
  });
  const classesQ = useQuery({
    queryKey: ["promo-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const [sessionId, setSessionId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const currentSessionId = useMemo(
    () => (sessionsQ.data ?? []).find((s) => s.is_current)?.id ?? "",
    [sessionsQ.data],
  );
  const effSession = sessionId || currentSessionId;

  const studentsQ = useQuery({
    queryKey: ["promo-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id,full_name,class_id").eq("class_id", classId)
        .eq("status", "active").order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const recsQ = useQuery({
    queryKey: ["promo-recs", effSession, classId],
    enabled: !!effSession && !!classId,
    queryFn: async () => {
      const { data, error } = await supabase.from("promotion_recommendations")
        .select("id,student_id,session_id,from_class_id,recommendation,note,status,reviewed_by,reviewed_at")
        .eq("session_id", effSession).eq("from_class_id", classId);
      if (error) throw error;
      return (data ?? []) as RecRow[];
    },
  });

  const recBy = useMemo(() => {
    const m = new Map<string, RecRow>();
    (recsQ.data ?? []).forEach((r) => m.set(r.student_id, r));
    return m;
  }, [recsQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["promo-recs", effSession, classId] });

  const upsertRec = async (studentId: string, rec: RecKind, note: string | null) => {
    const existing = recBy.get(studentId);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (existing) {
      const { error } = await supabase.from("promotion_recommendations")
        .update({ recommendation: rec, note }).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("promotion_recommendations").insert({
        student_id: studentId, session_id: effSession, from_class_id: classId,
        recommendation: rec, note, recommended_by: uid,
      });
      if (error) throw error;
    }
  };

  const save = useMutation({
    mutationFn: async (args: { studentId: string; rec: RecKind; note: string | null }) =>
      upsertRec(args.studentId, args.rec, args.note),
    onSuccess: () => { toast.success("Recommendation saved."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkSet = useMutation({
    mutationFn: async (rec: RecKind) => {
      if (selected.size === 0) throw new Error("Select at least one student.");
      for (const id of Array.from(selected)) {
        await upsertRec(id, rec, recBy.get(id)?.note ?? null);
      }
    },
    onSuccess: () => {
      toast.success(`Updated ${selected.size} student(s).`);
      setSelected(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async (args: { ids: string[]; status: RecStatus }) => {
      if (args.ids.length === 0) throw new Error("No selection.");
      const { error } = await supabase.from("promotion_recommendations")
        .update({ status: args.status }).in("id", args.ids);
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      toast.success(`${args.status === "approved" ? "Approved" : "Rejected"} ${args.ids.length} item(s).`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const students = studentsQ.data ?? [];
  const allSelected = students.length > 0 && students.every((s) => selected.has(s.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)));
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const selectedRecIds = useMemo(
    () => students.filter((s) => selected.has(s.id))
      .map((s) => recBy.get(s.id)?.id).filter((x): x is string => !!x),
    [students, selected, recBy],
  );

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-medium">Promotion recommendations</h3>
        <p className="text-xs text-muted-foreground">
          Class teachers flag each student. Admin approval is required before recommendations apply.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Session">
          <Select value={effSession} onValueChange={setSessionId}>
            <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {(sessionsQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Class">
          <Select value={classId} onValueChange={(v) => { setClassId(v); setSelected(new Set()); }}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {(classesQ.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {classId && students.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/30 p-2">
          <span className="text-xs text-muted-foreground mr-1">
            {selected.size} selected
          </span>
          <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkSet.isPending}
            onClick={() => bulkSet.mutate("pass")}>Bulk: Pass</Button>
          <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkSet.isPending}
            onClick={() => bulkSet.mutate("repeat")}>Bulk: Repeat</Button>
          <Button size="sm" variant="outline" disabled={selected.size === 0 || bulkSet.isPending}
            onClick={() => bulkSet.mutate("graduate")}>Bulk: Graduate</Button>
          {isAdmin && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <Button size="sm" variant="default"
                disabled={selectedRecIds.length === 0 || setStatus.isPending}
                onClick={() => setStatus.mutate({ ids: selectedRecIds, status: "approved" })}>
                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />Approve
              </Button>
              <Button size="sm" variant="outline"
                disabled={selectedRecIds.length === 0 || setStatus.isPending}
                onClick={() => setStatus.mutate({ ids: selectedRecIds, status: "rejected" })}>
                <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />Reject
              </Button>
            </>
          )}
        </div>
      )}

      {!classId ? (
        <EmptyBox text="Pick a class to load students." />
      ) : studentsQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />Loading students…
        </div>
      ) : students.length === 0 ? (
        <EmptyBox text="No active students in this class." />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="w-[160px]">Recommendation</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <RecRowEditor
                  key={s.id}
                  student={s}
                  current={recBy.get(s.id)}
                  saving={save.isPending}
                  selected={selected.has(s.id)}
                  onToggle={() => toggleOne(s.id)}
                  onSave={(rec, note) => save.mutate({ studentId: s.id, rec, note })}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function RecRowEditor({ student, current, saving, selected, onToggle, onSave }: {
  student: StudentRow;
  current?: RecRow;
  saving: boolean;
  selected: boolean;
  onToggle: () => void;
  onSave: (rec: RecKind, note: string | null) => void;
}) {
  const [rec, setRec] = useState<RecKind>(current?.recommendation ?? "pass");
  const [note, setNote] = useState<string>(current?.note ?? "");
  const dirty = rec !== (current?.recommendation ?? "pass") || (note ?? "") !== (current?.note ?? "");
  const status: RecStatus = current?.status ?? "pending";
  return (
    <TableRow>
      <TableCell><Checkbox checked={selected} onCheckedChange={onToggle} /></TableCell>
      <TableCell className="font-medium">{student.full_name}</TableCell>
      <TableCell>
        <Select value={rec} onValueChange={(v) => setRec(v as RecKind)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="repeat">Repeat</SelectItem>
            <SelectItem value="graduate">Graduate</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
      </TableCell>
      <TableCell>
        {!current ? (
          <Badge variant="outline" className="text-[10px]">—</Badge>
        ) : status === "approved" ? (
          <Badge className="text-[10px]" variant="secondary">Approved</Badge>
        ) : status === "rejected" ? (
          <Badge className="text-[10px]" variant="destructive">Rejected</Badge>
        ) : (
          <Badge className="text-[10px]" variant="outline">Pending</Badge>
        )}
      </TableCell>
      <TableCell>
        <Button size="sm" variant={dirty ? "default" : "outline"}
          disabled={!dirty || saving}
          onClick={() => onSave(rec, note.trim() ? note.trim() : null)}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/* ============================================================
   PROMOTIONS HISTORY (recommendations + actual promotion records)
   ============================================================ */
interface HistoryRec extends RecRow { reviewer_name?: string | null }
interface PromotionHistoryRow {
  id: string; student_id: string; session_id: string;
  from_class_id: string | null; to_class_id: string | null;
  status: string; remark: string | null; created_at: string;
}

function PromotionsHistoryPanel() {
  const sessionsQ = useQuery({
    queryKey: ["promo-history-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions")
        .select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_current: boolean }[];
    },
  });
  const classesQ = useQuery({
    queryKey: ["promo-history-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const studentsQ = useQuery({
    queryKey: ["promo-history-students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id,full_name");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const [sessionId, setSessionId] = useState<string>("");
  const currentId = (sessionsQ.data ?? []).find((s) => s.is_current)?.id ?? "";
  const effSession = sessionId || currentId;

  const recsQ = useQuery({
    queryKey: ["history-recs", effSession],
    enabled: !!effSession,
    queryFn: async () => {
      const { data, error } = await supabase.from("promotion_recommendations")
        .select("id,student_id,session_id,from_class_id,recommendation,note,status,reviewed_by,reviewed_at")
        .eq("session_id", effSession).order("reviewed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HistoryRec[];
    },
  });
  const promoQ = useQuery({
    queryKey: ["history-promotions", effSession],
    enabled: !!effSession,
    queryFn: async () => {
      const { data, error } = await supabase.from("promotion")
        .select("id,student_id,session_id,from_class_id,to_class_id,status,remark,created_at")
        .eq("session_id", effSession).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PromotionHistoryRow[];
    },
  });

  const className = (id: string | null) => (classesQ.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const studentName = (id: string) => (studentsQ.data ?? []).find((s) => s.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-medium">Promotions history</h3>
          <p className="text-xs text-muted-foreground">Past recommendations and applied promotions for the selected session.</p>
        </div>
        <div className="w-56">
          <Select value={effSession} onValueChange={setSessionId}>
            <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
            <SelectContent>
              {(sessionsQ.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current ? " (current)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Teacher recommendations</h4>
        {recsQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (recsQ.data ?? []).length === 0 ? (
          <EmptyBox text="No recommendations recorded for this session." />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>From class</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recsQ.data!.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{studentName(r.student_id)}</TableCell>
                    <TableCell>{className(r.from_class_id)}</TableCell>
                    <TableCell className="capitalize">{r.recommendation}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "approved" ? "secondary" : r.status === "rejected" ? "destructive" : "outline"} className="text-[10px] capitalize">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.reviewed_at ? formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2">Applied promotions</h4>
        {promoQ.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        ) : (promoQ.data ?? []).length === 0 ? (
          <EmptyBox text="No promotions applied for this session yet." />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoQ.data!.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{studentName(p.student_id)}</TableCell>
                    <TableCell>{className(p.from_class_id)}</TableCell>
                    <TableCell>{p.to_class_id ? className(p.to_class_id) : <span className="text-muted-foreground">— (graduated)</span>}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{p.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.remark ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   Shared
   ============================================================ */
function ErrorBox({ message, onRetry, disabled }: { message: string; onRetry: () => void; disabled?: boolean }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-destructive">Something went wrong</p>
        <p className="text-muted-foreground mt-0.5 break-words">{message}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={disabled}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" />Retry
      </Button>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div>;
}
