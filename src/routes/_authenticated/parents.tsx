import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Link as LinkIcon, Unlink, Search, Users, Download, KeyRound } from "lucide-react";
import { downloadCsv } from "@/lib/export-csv";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createParentWithAccount, provisionParentLogin, sendParentPasswordReset } from "@/lib/parents.functions";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";
import { Navigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StateLgaSelect } from "@/components/StateLgaSelect";
import { softDelete } from "@/lib/soft-delete";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { SessionSelect, ALL_SESSIONS, useSessions } from "@/components/SessionSelect";

export const Route = createFileRoute("/_authenticated/parents")({
  component: ParentsPage,
});

interface ParentRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  occupation: string | null;
  state_of_origin: string | null;
  lga: string | null;
  academic_session_id: string | null;
  user_id: string | null;
}

interface StudentLite {
  id: string;
  full_name: string;
  admission_no: string | null;
  parent_id: string | null;
  class_id: string | null;
}

interface ClassLite {
  id: string;
  name: string;
}

function ParentsPage() {
  const { isAdmin, loading, session } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Access denied
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The Parents &amp; Guardians area is restricted to administrators.
              Please contact a school administrator if you need access.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="/">Return to dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ParentsPageContent />;
}

function ParentsPageContent() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ParentRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ParentRow | null>(null);
  const [linkingFor, setLinkingFor] = useState<ParentRow | null>(null);
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [sessionFilter, setSessionFilter] = useState<string>(ALL_SESSIONS);
  const [sortBy, setSortBy] = useState<"name" | "email" | "phone" | "children">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { data: sessionList } = useSessions();
  const currentSessionId = (sessionList ?? []).find((x) => x.is_current)?.id ?? null;
  const sessionNameById = useMemo(
    () => Object.fromEntries((sessionList ?? []).map((x) => [x.id, x.name])) as Record<string, string>,
    [sessionList],
  );
  const resetPasswordFn = useServerFn(sendParentPasswordReset);
  const [resettingId, setResettingId] = useState<string | null>(null);

  async function handleResetPassword(p: ParentRow) {
    setResettingId(p.id);
    try {
      const r = await resetPasswordFn({
        data: { parent_id: p.id, redirect_to: `${window.location.origin}/reset-password` },
      });
      toast.success(`Password reset email sent to ${r.email}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResettingId(null);
    }
  }

  const { data: parents, isLoading } = useQuery({
    queryKey: ["parents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("id, full_name, email, phone, address, occupation, state_of_origin, lga, academic_session_id, user_id")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ParentRow[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, parent_id, class_id")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentLite[];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as ClassLite[];
    },
  });

  const classMap = useMemo(
    () => Object.fromEntries((classes ?? []).map((c) => [c.id, c.name])),
    [classes],
  );

  const childrenByParent = useMemo(() => {
    const m: Record<string, StudentLite[]> = {};
    (students ?? []).forEach((s) => {
      if (s.parent_id) (m[s.parent_id] ||= []).push(s);
    });
    return m;
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (parents ?? []).filter((p) => {
      if (q) {
        const hit =
          p.full_name.toLowerCase().includes(q) ||
          (p.email ?? "").toLowerCase().includes(q) ||
          (p.phone ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (sessionFilter !== ALL_SESSIONS && p.academic_session_id !== sessionFilter) return false;
      const count = childrenByParent[p.id]?.length ?? 0;
      if (linkFilter === "linked" && count === 0) return false;
      if (linkFilter === "unlinked" && count > 0) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: string, b: string) => a.localeCompare(b) * dir;
    list = [...list].sort((a, b) => {
      if (sortBy === "children") {
        const ac = childrenByParent[a.id]?.length ?? 0;
        const bc = childrenByParent[b.id]?.length ?? 0;
        return (ac - bc) * dir || a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === "email") return cmp(a.email ?? "", b.email ?? "");
      if (sortBy === "phone") return cmp(a.phone ?? "", b.phone ?? "");
      return cmp(a.full_name, b.full_name);
    });
    return list;
  }, [parents, search, linkFilter, sessionFilter, sortBy, sortDir, childrenByParent]);

  const [page, setPage] = useState(1);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Parents & Guardians</h1>
          <p className="text-sm text-muted-foreground">
            Manage parent records and link them to students.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BulkImportDialog
            title="Bulk import parents"
            description="Upload an Excel or CSV file. Existing parents are matched by email and updated. Use student_admission_no (comma-separated for multiple children) to link students."
            templateName="parents-import-template"
            templateHeaders={["full_name", "email", "phone", "occupation", "address", "state_of_origin", "lga", "session", "student_admission_no"]}
            requiredHeaders={["full_name"]}
            onImportRow={async (r) => {
              const email = (r["email"] || "").trim().toLowerCase();
              const sessName = (r["session"] || "").trim().toLowerCase();
              const sessMatch = sessName
                ? (sessionList ?? []).find((x) => x.name.toLowerCase() === sessName)
                : null;
              if (sessName && !sessMatch) throw new Error(`Unknown session "${r["session"]}"`);
              const rowSessionId: string | null = sessMatch?.id ?? currentSessionId;
              const payload = {
                full_name: r["full_name"],
                email: email || null,
                phone: r["phone"] || null,
                occupation: r["occupation"] || null,
                address: r["address"] || null,
                state_of_origin: r["state_of_origin"] || null,
                lga: r["lga"] || null,
                academic_session_id: rowSessionId,
              };

              let parentId: string | null = null;
              if (email) {
                const { data: existing, error: findErr } = await supabase
                  .from("parents")
                  .select("id")
                  .eq("email", email)
                  .maybeSingle();
                if (findErr) throw new Error(findErr.message);
                if (existing) {
                  const { error: updErr } = await supabase.from("parents").update(payload).eq("id", existing.id);
                  if (updErr) throw new Error(updErr.message);
                  parentId = existing.id;
                }
              }
              if (!parentId) {
                const { data: ins, error: insErr } = await supabase
                  .from("parents")
                  .insert(payload)
                  .select("id")
                  .single();
                if (insErr) throw new Error(insErr.message);
                parentId = ins.id;
              }

              const admissionNos = (r["student_admission_no"] || "")
                .split(/[,;]/)
                .map((s) => s.trim())
                .filter(Boolean);
              for (const adm of admissionNos) {
                const { data: stu, error: stuErr } = await supabase
                  .from("students")
                  .select("id")
                  .eq("admission_no", adm)
                  .maybeSingle();
                if (stuErr) throw new Error(stuErr.message);
                if (!stu) throw new Error(`Unknown student admission no "${adm}"`);
                const { error: linkErr } = await supabase
                  .from("students")
                  .update({ parent_id: parentId })
                  .eq("id", stu.id);
                if (linkErr) throw new Error(linkErr.message);
              }
            }}
            onCompleted={() => {
              qc.invalidateQueries({ queryKey: ["parents"] });
              qc.invalidateQueries({ queryKey: ["students-lite"] });
              qc.invalidateQueries({ queryKey: ["students"] });
            }}
          />
          <SessionSelect
            label=""
            allowAll
            autoDefault={false}
            className="w-44"
            value={sessionFilter}
            onChange={setSessionFilter}
          />
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("parents", filtered, [
                { header: "Full name", accessor: (p) => p.full_name },
                { header: "Email", accessor: (p) => p.email ?? "" },
                { header: "Phone", accessor: (p) => p.phone ?? "" },
                { header: "Occupation", accessor: (p) => p.occupation ?? "" },
                { header: "Address", accessor: (p) => p.address ?? "" },
                { header: "State of origin", accessor: (p) => p.state_of_origin ?? "" },
                { header: "LGA", accessor: (p) => p.lga ?? "" },
                { header: "Session", accessor: (p) => sessionNameById[p.academic_session_id ?? ""] ?? "" },
                { header: "Children", accessor: (p) => (childrenByParent[p.id] ?? []).map((c) => c.full_name).join("; ") },
              ])
            }
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add parent
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> {filtered.length} of {parents?.length ?? 0} parent{(parents?.length ?? 0) === 1 ? "" : "s"}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-56">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Select value={linkFilter} onValueChange={(v) => setLinkFilter(v as typeof linkFilter)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All parents</SelectItem>
                  <SelectItem value="linked">With students</SelectItem>
                  <SelectItem value="unlinked">No students</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="email">Sort: Email</SelectItem>
                  <SelectItem value="phone">Sort: Phone</SelectItem>
                  <SelectItem value="children"># Linked students</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title="Toggle sort direction"
              >
                {sortDir === "asc" ? "Asc ↑" : "Desc ↓"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Children</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                      No parents found.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => {
                    const kids = childrenByParent[p.id] ?? [];
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.full_name}</div>
                          {p.occupation && (
                            <div className="text-xs text-muted-foreground">{p.occupation}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.email && <div>{p.email}</div>}
                          {p.phone && <div className="text-muted-foreground">{p.phone}</div>}
                          {!p.email && !p.phone && <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {kids.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No linked students</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {kids.map((k) => (
                                <Badge key={k.id} variant="secondary" className="text-xs">
                                  {k.full_name}
                                  {k.class_id && classMap[k.class_id] ? ` · ${classMap[k.class_id]}` : ""}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Link/unlink students"
                            onClick={() => setLinkingFor(p)}
                          >
                            <LinkIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title={p.user_id ? "Send password reset email" : "No portal login yet — edit to generate one"}
                            disabled={resettingId === p.id}
                            onClick={() => handleResetPassword(p)}
                          >
                            <KeyRound className={`h-4 w-4 ${p.user_id ? "" : "text-muted-foreground/40"}`} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit"
                            onClick={() => setEditing(p)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete"
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            start={start}
            end={end}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <ParentFormDialog
          key={editing?.id ?? "new"}
          parent={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["parents"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      </Dialog>

      {/* Link students dialog */}
      <Dialog open={!!linkingFor} onOpenChange={(o) => !o && setLinkingFor(null)}>
        {linkingFor && (
          <LinkStudentsDialog
            parent={linkingFor}
            students={students ?? []}
            classMap={classMap}
            onClose={() => setLinkingFor(null)}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ["students-lite"] });
              qc.invalidateQueries({ queryKey: ["students"] });
            }}
          />
        )}
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this parent?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && childrenByParent[deleting.id]?.length
                ? `This parent is linked to ${childrenByParent[deleting.id].length} student(s). Those students will be unlinked but not deleted.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                try {
                  // Unlink any students first to avoid FK orphans
                  await supabase
                    .from("students")
                    .update({ parent_id: null })
                    .eq("parent_id", deleting.id);
                  await softDelete("parents", deleting.id);
                  toast.success("Parent deleted.");
                  qc.invalidateQueries({ queryKey: ["parents"] });
                  qc.invalidateQueries({ queryKey: ["students-lite"] });
                  qc.invalidateQueries({ queryKey: ["students"] });
                  setDeleting(null);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ParentFormDialog({
  parent,
  onClose,
  onSaved,
}: {
  parent: ParentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!parent;
  const hasLogin = !!parent?.user_id;
  const [form, setForm] = useState({
    full_name: parent?.full_name ?? "",
    email: parent?.email ?? "",
    phone: parent?.phone ?? "",
    address: parent?.address ?? "",
    occupation: parent?.occupation ?? "",
    state_of_origin: parent?.state_of_origin ?? "",
    lga: parent?.lga ?? "",
    academic_session_id: parent?.academic_session_id ?? "",
  });
  const [generateLogin, setGenerateLogin] = useState(!isEdit);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const provisionParent = useServerFn(createParentWithAccount);
  const provisionLoginFn = useServerFn(provisionParentLogin);
  const resetFn = useServerFn(sendParentPasswordReset);

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Full name is required.");
      if (isEdit && parent) {
        const payload = {
          full_name: form.full_name.trim(),
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          occupation: form.occupation || null,
          state_of_origin: form.state_of_origin || null,
          lga: form.lga || null,
          academic_session_id: form.academic_session_id || null,
        };
        const { error } = await supabase.from("parents").update(payload).eq("id", parent.id);
        if (error) throw error;
        if (!hasLogin && generateLogin) {
          if (!form.email.trim()) throw new Error("Email is required to create a parent login.");
          return await provisionLoginFn({
            data: { parent_id: parent.id, redirect_to: `${window.location.origin}/reset-password` },
          });
        }
      } else {
        if (generateLogin && !form.email.trim())
          throw new Error("Email is required to create a parent login.");
        const res = await provisionParent({
          data: {
            redirect_to: `${window.location.origin}/reset-password`,
            full_name: form.full_name.trim(),
            email: form.email.trim() || undefined,
            phone: form.phone || null,
            address: form.address || null,
            occupation: form.occupation || null,
            state_of_origin: form.state_of_origin || null,
            lga: form.lga || null,
            academic_session_id: form.academic_session_id || null,
            create_login: generateLogin,
          },
        });
        return res;
      }
    },
    onSuccess: (res) => {
      if (isEdit && !res) toast.success("Parent updated.");
      else if (isEdit && res && !res.email_sent)
        toast.warning(
          `Parent updated, but the password-setup email could not be sent${res.email_error ? `: ${res.email_error}` : "."}`,
        );
      else if (isEdit)
        toast.success("Parent updated. Portal login created and a password-setup email has been sent.");
      else if (res && !res.user_id) toast.success("Parent added (no portal login).");
      else if (res && !res.email_sent)
        toast.warning(
          `Parent added, but the password-setup email could not be sent${res.email_error ? `: ${res.email_error}` : "."}`,
        );
      else toast.success("Parent added. A password-setup email has been sent.");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [sendingReset, setSendingReset] = useState(false);
  async function handleSendReset() {
    if (!parent) return;
    setSendingReset(true);
    try {
      const r = await resetFn({
        data: { parent_id: parent.id, redirect_to: `${window.location.origin}/reset-password` },
      });
      toast.success(`Password reset email sent to ${r.email}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit parent" : "Add parent"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Update guardian details." : "Capture a new parent / guardian record."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Full name *</Label>
          <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Occupation</Label>
          <Input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Address</Label>
          <Textarea
            rows={2}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
        <SessionSelect
          value={form.academic_session_id}
          onChange={(v) => set("academic_session_id", v)}
        />
        <StateLgaSelect
          stateValue={form.state_of_origin}
          lgaValue={form.lga}
          onStateChange={(v) => set("state_of_origin", v)}
          onLgaChange={(v) => set("lga", v)}
        />

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold">Parent portal login</Label>
            {isEdit && hasLogin && (
              <Badge variant="secondary" className="text-xs">Login active</Badge>
            )}
          </div>
          {(!isEdit || !hasLogin) && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={generateLogin}
                onCheckedChange={(v) => setGenerateLogin(v === true)}
                className="mt-0.5"
              />
              <span>
                Generate a portal login and email a password-setup link
                <span className="block text-xs text-muted-foreground">
                  Requires an email address. The parent sets their own password from the link.
                </span>
              </span>
            </label>
          )}
          {isEdit && hasLogin && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                The parent logs in with <span className="font-medium">{parent?.email}</span>.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sendingReset}
                onClick={handleSendReset}
              >
                <KeyRound className="h-4 w-4 mr-1" />
                {sendingReset ? "Sending…" : "Reset password"}
              </Button>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? "Saving…" : isEdit ? "Save changes" : "Add parent"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function LinkStudentsDialog({
  parent,
  students,
  classMap,
  onClose,
  onChanged,
}: {
  parent: ParentRow;
  students: StudentLite[];
  classMap: Record<string, string>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pickStudent, setPickStudent] = useState<string>("");
  const linked = useMemo(
    () => students.filter((s) => s.parent_id === parent.id),
    [students, parent.id],
  );
  const unlinked = useMemo(
    () => students.filter((s) => s.parent_id !== parent.id),
    [students, parent.id],
  );

  const link = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase
        .from("students")
        .update({ parent_id: parent.id })
        .eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student linked.");
      setPickStudent("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlink = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase
        .from("students")
        .update({ parent_id: null })
        .eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student unlinked.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Linked students</DialogTitle>
        <DialogDescription>
          Manage students linked to <span className="font-medium">{parent.full_name}</span>.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label className="text-xs">Currently linked ({linked.length})</Label>
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-3">
            No students linked yet.
          </p>
        ) : (
          <div className="border rounded-md divide-y">
            {linked.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 text-sm">
                <div>
                  <div className="font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.admission_no ?? "—"}
                    {s.class_id && classMap[s.class_id] ? ` · ${classMap[s.class_id]}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => unlink.mutate(s.id)}
                  disabled={unlink.isPending}
                >
                  <Unlink className="h-4 w-4 mr-1" /> Unlink
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2 pt-2">
        <Label className="text-xs">Link a student</Label>
        <div className="flex gap-2">
          <Select value={pickStudent} onValueChange={setPickStudent}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choose a student…" />
            </SelectTrigger>
            <SelectContent>
              {unlinked.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No unlinked students available.
                </div>
              ) : (
                unlinked.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                    {s.parent_id ? " (currently linked to another parent)" : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            onClick={() => pickStudent && link.mutate(pickStudent)}
            disabled={!pickStudent || link.isPending}
          >
            <LinkIcon className="h-4 w-4 mr-1" /> Link
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Linking a student already assigned to another parent will reassign them.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
