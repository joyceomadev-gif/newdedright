import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SessionSelect, ALL_SESSIONS, useCurrentSessionId } from "@/components/SessionSelect";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/paginated-fetch";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";
import { StateLgaSelect } from "@/components/StateLgaSelect";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Search, GraduationCap, ArrowRight, Upload, User, MoreHorizontal, Pencil, Trash2, ImageIcon, KeyRound, Copy, CheckCircle2, Mail, Download } from "lucide-react";
import { downloadCsv } from "@/lib/export-csv";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/lib/storage";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { provisionStudentLogin } from "@/lib/admission.functions";
import { updateUser } from "@/lib/users.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/PasswordInput";
import { StudentImportDialog } from "@/components/StudentImportDialog";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({ meta: [{ title: "Students" }, { name: "description", content: "Manage student records and admissions at De-Bright Group of Schools." }, { property: "og:title", content: "Students — De-Bright Group of Schools" }, { property: "og:description", content: "Student records and admissions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: StudentsPage,
});

async function sendStudentResetLink(email: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("No email on record for this student.");
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

type Gender = "male" | "female";
type StudentStatus = "active" | "graduated" | "withdrawn" | "suspended";

interface Student {
  id: string;
  user_id: string | null;
  admission_no: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  admission_session_id?: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  class_id: string | null;
  parent_id: string | null;
  address: string | null;
  medical_info: string | null;
  enrollment_date: string;
  is_active: boolean;
  status: StudentStatus;
  graduated_at: string | null;
  photo_url: string | null;
  nationality: string | null;
  state_of_origin: string | null;
  lga: string | null;
  place_of_birth: string | null;
  religion: string | null;
  blood_group: string | null;
  genotype: string | null;
  allergies: string | null;
  disabilities: string | null;
  previous_school: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  home_phone: string | null;
  email: string | null;
  contact_email_1: string | null;
  contact_email_2: string | null;
  contact_phone_1: string | null;
  contact_phone_2: string | null;
  classes?: { name: string; level: string } | null;
  parents?: { full_name: string; phone: string | null; email: string | null } | null;
}

interface ClassRow {
  id: string;
  name: string;
  level: string;
}

interface ParentRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

function statusBadge(s: StudentStatus) {
  const map: Record<StudentStatus, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-100 text-emerald-700" },
    graduated: { label: "Alumni", className: "bg-blue-100 text-blue-700" },
    withdrawn: { label: "Withdrawn", className: "bg-muted text-muted-foreground" },
    suspended: { label: "Suspended", className: "bg-amber-100 text-amber-700" },
  };
  const v = map[s];
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const t = email.trim();
  return t.length > 0 && t.length <= 254 && EMAIL_RE.test(t);
}

function portalBadge(userId: string | null | undefined) {
  return userId ? (
    <Badge variant="outline" className="bg-emerald-100 text-emerald-700 gap-1">
      <CheckCircle2 className="h-3 w-3" /> Portal active
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
      <KeyRound className="h-3 w-3" /> No login
    </Badge>
  );
}

function StudentsPage() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Student Management</h1>
        <p className="text-sm text-muted-foreground">
          Admissions, profiles, attendance, promotion and alumni.
        </p>
      </div>
      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="promotion">Promotion</TabsTrigger>
          <TabsTrigger value="alumni">Alumni</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="mt-4">
          <RosterTab />
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab />
        </TabsContent>
        <TabsContent value="promotion" className="mt-4">
          <PromotionTab />
        </TabsContent>
        <TabsContent value="alumni" className="mt-4">
          <AlumniTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Roster -------------------- */

function RosterTab() {
  const { isAdmin, isStaff } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [loginFilter, setLoginFilter] = useState<"all" | "with" | "without">("all");
  const [sessionFilter, setSessionFilter] = useState<string>(ALL_SESSIONS);
  const [openAdd, setOpenAdd] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);
  const [loginFor, setLoginFor] = useState<Student | null>(null);
  const [resetPwFor, setResetPwFor] = useState<Student | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const photo = usePhotoMutations();

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", "active"],
    queryFn: async () =>
      fetchAllPaged<Student>(() =>
        supabase
          .from("students")
          .select(
            "*, classes(name, level), parents(full_name, phone, email)",
          )
          .is("deleted_at", null)
          .neq("status", "graduated")
          .order("full_name") as unknown as {
            range: (from: number, to: number) => PromiseLike<{ data: Student[] | null; error: { message: string } | null }>;
          },
      ),
  });

  const { data: classes } = useClasses();

  const filtered = (students ?? []).filter((s) => {
    if (classFilter !== "all" && s.class_id !== classFilter) return false;
    if (sessionFilter !== ALL_SESSIONS && s.admission_session_id !== sessionFilter) return false;
    if (loginFilter === "with" && !s.user_id) return false;
    if (loginFilter === "without" && !!s.user_id) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.admission_no.toLowerCase().includes(q)
    );
  });

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, classFilter, loginFilter, sessionFilter]);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((s) => next.delete(s.id));
      } else {
        filtered.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };
  const selectedStudents = (students ?? []).filter((s) => selectedIds.has(s.id));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or admission no…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {(classes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SessionSelect
          label=""
          allowAll
          autoDefault={false}
          className="w-full sm:w-48"
          value={sessionFilter}
          onChange={setSessionFilter}
        />
        <Select value={loginFilter} onValueChange={(v) => setLoginFilter(v as "all" | "with" | "without")}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by login" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All login statuses</SelectItem>
            <SelectItem value="with">With portal login</SelectItem>
            <SelectItem value="without">No login yet</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && selectedIds.size > 0 && (
          <Button variant="secondary" onClick={() => setBulkOpen(true)}>
            <KeyRound className="h-4 w-4 mr-1" />
            Provision logins ({selectedIds.size})
          </Button>
        )}
        {isAdmin && (
          <StudentImportDialog
            onCompleted={() => {
              qc.invalidateQueries({ queryKey: ["students"] });
              qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
            }}
          />
        )}
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv("students", filtered, [
              { header: "Admission #", accessor: (s) => s.admission_no },
              { header: "First name", accessor: (s) => s.first_name ?? "" },
              { header: "Last name", accessor: (s) => s.last_name ?? "" },
              { header: "Full name", accessor: (s) => s.full_name },
              { header: "Gender", accessor: (s) => s.gender ?? "" },
              { header: "Date of birth", accessor: (s) => s.date_of_birth ?? "" },
              { header: "Class", accessor: (s) => s.classes?.name ?? "" },
              { header: "Level", accessor: (s) => s.classes?.level ?? "" },
              { header: "Status", accessor: (s) => s.status },
              { header: "Enrollment date", accessor: (s) => s.enrollment_date },
              { header: "Student login email", accessor: (s) => s.email ?? "" },
              { header: "Contact email 1", accessor: (s) => s.contact_email_1 ?? "" },
              { header: "Contact email 2", accessor: (s) => s.contact_email_2 ?? "" },
              { header: "Contact phone 1", accessor: (s) => s.contact_phone_1 ?? "" },
              { header: "Contact phone 2", accessor: (s) => s.contact_phone_2 ?? "" },
              { header: "Home phone", accessor: (s) => s.home_phone ?? "" },
              { header: "Address", accessor: (s) => s.address ?? "" },
              { header: "Nationality", accessor: (s) => s.nationality ?? "" },
              { header: "State of origin", accessor: (s) => s.state_of_origin ?? "" },
              { header: "LGA", accessor: (s) => s.lga ?? "" },
              { header: "Religion", accessor: (s) => s.religion ?? "" },
              { header: "Blood group", accessor: (s) => s.blood_group ?? "" },
              { header: "Genotype", accessor: (s) => s.genotype ?? "" },
              { header: "Parent", accessor: (s) => s.parents?.full_name ?? "" },
              { header: "Parent phone", accessor: (s) => s.parents?.phone ?? "" },
              { header: "Parent email", accessor: (s) => s.parents?.email ?? "" },
            ])
          }
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4 mr-1" />Export
        </Button>
        {isAdmin && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />Admit student</Button>
            </DialogTrigger>
            <AddStudentDialog onClose={() => setOpenAdd(false)} />
          </Dialog>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-[1%]">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={() => toggleAll()}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead>Admission #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Portal</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-muted-foreground py-8">No students found.</TableCell></TableRow>
            ) : (
              pageItems.map((s) => (
                <TableRow key={s.id} data-state={selectedIds.has(s.id) ? "selected" : undefined}>
                  {isAdmin && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(s.id)}
                        onCheckedChange={() => toggleOne(s.id)}
                        aria-label={`Select ${s.full_name}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <SignedAvatarImage bucket="student-photos" src={s.photo_url} alt={s.full_name} />
                        <AvatarFallback className="text-xs">{s.full_name.split(" ").map(n => n[0]).slice(0,2).join("")}</AvatarFallback>
                      </Avatar>
                      {s.full_name}
                    </div>
                  </TableCell>
                  <TableCell>{s.classes?.name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{s.gender ?? "—"}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                  <TableCell>{portalBadge(s.user_id)}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(s)}>View</Button>
                      {(isAdmin || isStaff) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isAdmin && (
                              <DropdownMenuItem onClick={() => setEditing(s)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit details
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <DropdownMenuItem onClick={() => setLoginFor(s)}>
                                {s.user_id ? (
                                  <>
                                    <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" /> Re-link login
                                  </>
                                ) : (
                                  <>
                                    <KeyRound className="h-4 w-4 mr-2" /> Create login
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                            {isAdmin && s.user_id && (
                              <DropdownMenuItem
                                disabled={!isValidEmail(s.email)}
                                onClick={async () => {
                                  try {
                                    await sendStudentResetLink(s.email ?? "");
                                    toast.success(`Reset link sent to ${s.email}`);
                                  } catch (e) {
                                    toast.error((e as Error).message);
                                  }
                                }}
                              >
                                <Mail className="h-4 w-4 mr-2" /> Re-send reset link
                              </DropdownMenuItem>
                            )}
                            {isAdmin && s.user_id && (
                              <DropdownMenuItem
                                disabled={!isValidEmail(s.email)}
                                onClick={() => setLoginFor(s)}
                              >
                                <KeyRound className="h-4 w-4 mr-2" /> Regenerate credentials
                              </DropdownMenuItem>
                             )}
                             {isAdmin && s.user_id && (
                               <DropdownMenuItem onClick={() => setResetPwFor(s)}>
                                 <KeyRound className="h-4 w-4 mr-2" /> Reset password
                               </DropdownMenuItem>
                             )}
                             {isStaff && (
                              <>
                                <DropdownMenuItem onClick={() => photo.pickAndReplace(s)}>
                                  <ImageIcon className="h-4 w-4 mr-2" /> Replace photo
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={!s.photo_url}
                                  onClick={() => photo.remove.mutate(s)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Remove photo
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
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

      <StudentProfileSheet
        student={selected}
        onClose={() => setSelected(null)}
        onEdit={(s) => { setSelected(null); setEditing(s); }}
        onManageLogin={(s) => { setSelected(null); setLoginFor(s); }}
        photo={photo}
      />
      <EditStudentDialog student={editing} onClose={() => setEditing(null)} />
      <StudentLoginDialog student={loginFor} onClose={() => setLoginFor(null)} />
      <ResetStudentPasswordDialog student={resetPwFor} onClose={() => setResetPwFor(null)} />
      <BulkProvisionLoginsDialog
        open={bulkOpen}
        students={selectedStudents}
        onClose={() => setBulkOpen(false)}
        onDone={() => setSelectedIds(new Set())}
      />
    </Card>
  );
}

function genTempPassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

function ResetStudentPasswordDialog({
  student,
  onClose,
}: {
  student: Student | null;
  onClose: () => void;
}) {
  const updateFn = useServerFn(updateUser);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (student) {
      setPassword(genTempPassword());
      setDone(false);
    }
  }, [student]);

  const save = useMutation({
    mutationFn: async () => {
      if (!student?.user_id) throw new Error("This student has no portal login yet.");
      if (password.trim().length < 8) throw new Error("Password must be at least 8 characters.");
      await updateFn({ data: { user_id: student.user_id, password: password.trim() } });
    },
    onSuccess: () => {
      setDone(true);
      toast.success("Password reset. Share the new password with the student.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset student password</DialogTitle>
          <DialogDescription>
            Set a new portal password for {student?.full_name}. They can change it later in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">New password</Label>
            <div className="flex gap-2">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
                autoComplete="new-password"
              />
              <Button type="button" variant="outline" onClick={() => setPassword(genTempPassword())}>
                Generate
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters.</p>
          </div>
          {done && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-center justify-between gap-2">
              <span className="font-mono truncate">{password}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(password).then(
                    () => toast.success("Copied"),
                    () => toast.error("Copy failed"),
                  )
                }
              >
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkResult {
  student_id: string;
  full_name: string;
  admission_no: string;
  status: "ok" | "skipped" | "error";
  email?: string;
  password?: string | null;
  linked?: boolean;
  message?: string;
}

function BulkProvisionLoginsDialog({
  open,
  students,
  onClose,
  onDone,
}: {
  open: boolean;
  students: Student[];
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const provisionFn = useServerFn(provisionStudentLogin);
  const [mode, setMode] = useState<"provision" | "reset">("provision");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const total = students.length;
  const withEmail = students.filter((s) => isValidEmail(s.email)).length;
  const missingEmail = total - withEmail;
  const reLinkCount = students.filter((s) => !!s.user_id && isValidEmail(s.email)).length;
  const newCount = students.filter((s) => !s.user_id && isValidEmail(s.email)).length;
  const eligibleResetCount = students.filter((s) => !!s.user_id && isValidEmail(s.email)).length;

  const handleClose = () => {
    if (running) return;
    setResults(null);
    setProgress(0);
    onClose();
  };

  const run = async () => {
    setRunning(true);
    setProgress(0);
    const out: BulkResult[] = [];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const base = { student_id: s.id, full_name: s.full_name, admission_no: s.admission_no };
      const email = (s.email ?? "").trim();
      if (!isValidEmail(email)) {
        out.push({ ...base, status: "skipped", message: email ? "Invalid email format" : "No email on record" });
        setProgress(i + 1);
        continue;
      }
      if (mode === "reset") {
        if (!s.user_id) {
          out.push({ ...base, status: "skipped", message: "No portal login yet" });
          setProgress(i + 1);
          continue;
        }
        try {
          await sendStudentResetLink(email);
          out.push({ ...base, status: "ok", email, password: null, linked: true });
        } catch (e) {
          out.push({ ...base, status: "error", message: (e as Error).message });
        }
        setProgress(i + 1);
        continue;
      }
      try {
        if (s.user_id) {
          const { error } = await supabase
            .from("students")
            .update({ user_id: null })
            .eq("id", s.id);
          if (error) throw error;
        }
        const r = await provisionFn({ data: { student_id: s.id, email } });
        out.push({
          ...base,
          status: "ok",
          email: r.email,
          password: r.temp_password,
          linked: r.linked_existing,
        });
      } catch (e) {
        out.push({ ...base, status: "error", message: (e as Error).message });
      }
      setProgress(i + 1);
    }
    setResults(out);
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["students", "active"] });
    const okCount = out.filter((r) => r.status === "ok").length;
    if (okCount > 0) {
      toast.success(
        mode === "reset"
          ? `${okCount} reset link(s) sent.`
          : `${okCount} login(s) provisioned.`,
      );
    }
    if (out.some((r) => r.status === "error")) toast.error("Some students failed; see details.");
    onDone();
  };

  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed"),
    );

  const copyAll = () => {
    if (!results) return;
    const lines = results
      .filter((r) => r.status === "ok")
      .map(
        (r) =>
          `${r.admission_no}\t${r.full_name}\t${r.email}\t${r.password ?? "(linked existing)"}`,
      );
    if (lines.length === 0) {
      toast.error("No successful credentials to copy.");
      return;
    }
    copy(["Admission\tName\tEmail\tPassword", ...lines].join("\n"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "reset" ? "Bulk send password reset links" : "Bulk provision portal logins"}
          </DialogTitle>
          <DialogDescription>
            {mode === "reset"
              ? `${eligibleResetCount} of ${total} eligible (must already have a portal login + email).`
              : `${total} student${total === 1 ? "" : "s"} selected — ${newCount} new, ${reLinkCount} re-link${
                  missingEmail > 0 ? `, ${missingEmail} skipped (no email)` : ""
                }.`}
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Action</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as typeof mode)}
                disabled={running}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="provision">Create / re-link logins (issue temp password)</SelectItem>
                  <SelectItem value="reset">Send password reset links by email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 max-h-64 overflow-y-auto">
              {students.map((s) => {
                const emailOk = isValidEmail(s.email);
                const eligible = mode === "reset" ? !!s.user_id && emailOk : emailOk;
                const emailLabel = !s.email ? "no email" : !emailOk ? "invalid email" : null;
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono">{s.admission_no}</span> · {s.full_name}
                    </span>
                    <span className={eligible ? "text-muted-foreground" : "text-amber-600"}>
                      {mode === "reset"
                        ? emailLabel
                          ? emailLabel
                          : !s.user_id
                            ? "no login yet"
                            : `reset → ${s.email}`
                        : emailLabel
                          ? emailLabel
                          : s.user_id
                            ? `re-link → ${s.email}`
                            : `new → ${s.email}`}
                    </span>
                  </div>
                );
              })}
            </div>
            {running && (
              <p className="text-xs text-muted-foreground">
                {mode === "reset" ? "Sending" : "Provisioning"} {progress} / {total}…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Results</p>
              {mode === "provision" && (
                <Button size="sm" variant="outline" onClick={copyAll}>
                  <Copy className="h-3 w-3 mr-1" /> Copy all credentials
                </Button>
              )}
            </div>
            <div className="rounded-md border max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.student_id}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.full_name}</div>
                        <div className="font-mono text-muted-foreground">{r.admission_no}</div>
                      </TableCell>
                      <TableCell>
                        {r.status === "ok" ? (
                          <Badge variant="secondary" className="text-xs">
                            {r.linked ? "Linked" : "Created"}
                          </Badge>
                        ) : r.status === "skipped" ? (
                          <Badge variant="outline" className="text-xs">Skipped</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                        {r.message && (
                          <div className="text-[10px] text-muted-foreground mt-1">{r.message}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.email ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.password ? (
                          <span className="inline-flex items-center gap-1">
                            {r.password}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5"
                              onClick={() => copy(r.password!)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </span>
                        ) : r.status === "ok" ? (
                          <span className="text-muted-foreground">linked existing</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={running}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <Button
              onClick={run}
              disabled={
                running ||
                (mode === "reset" ? eligibleResetCount === 0 : withEmail === 0)
              }
            >
              {running
                ? `Working… ${progress}/${total}`
                : mode === "reset"
                  ? `Send ${eligibleResetCount} reset link(s)`
                  : `Provision ${withEmail} login(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentLoginDialog({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const qc = useQueryClient();
  const provisionFn = useServerFn(provisionStudentLogin);
  const [email, setEmail] = useState("");
  const [creds, setCreds] = useState<{ email: string; password: string | null; linked: boolean } | null>(null);

  // Reset state when opening for a new student
  const open = !!student;
  const isReLink = !!student?.user_id;

  // sync email default whenever the dialog opens
  if (student && email === "" && !creds) {
    // initialize on first render of this open cycle
    queueMicrotask(() => setEmail(student.email ?? ""));
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error("No student selected.");
      if (!isValidEmail(email)) throw new Error("A valid email address is required to create or re-link a portal login.");

      // For re-link: clear existing user_id so the server fn allows provisioning
      if (isReLink) {
        const { error } = await supabase
          .from("students")
          .update({ user_id: null })
          .eq("id", student.id);
        if (error) throw error;
      }

      const result = await provisionFn({
        data: { student_id: student.id, email: email.trim() },
      });
      return result;
    },
    onSuccess: (r) => {
      setCreds({ email: r.email, password: r.temp_password, linked: r.linked_existing });
      toast.success(r.linked_existing ? "Linked to existing account." : "Login created.");
      qc.invalidateQueries({ queryKey: ["students", "active"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClose = () => {
    setEmail("");
    setCreds(null);
    submit.reset();
    onClose();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isReLink ? "Re-link portal login" : "Create portal login"}</DialogTitle>
          <DialogDescription>
            {student?.full_name}
            {isReLink && (
              <span className="block mt-1 text-xs text-amber-600">
                This student already has a login. Re-linking will unlink the current account and provision a new one with the email below.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!creds ? (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                aria-invalid={email.length > 0 && !isValidEmail(email)}
              />
              {email.length > 0 && !isValidEmail(email) ? (
                <p className="text-xs text-destructive mt-1">
                  Enter a valid email address (e.g. student@example.com).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  If an account with this email exists, it will be linked. Otherwise a new account is created with a temporary password.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
            <p className="font-medium">
              {creds.linked ? "Linked to existing account" : "Login created"}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Email</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs">{creds.email}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(creds.email)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {creds.password && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Temp password</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs select-all">{creds.password}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => copy(creds.password!)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              Share these credentials with the student. They can change the password after first sign-in.
            </p>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={handleClose}>
            {creds ? "Close" : "Cancel"}
          </Button>
          {!creds && isReLink && (
            <Button
              variant="secondary"
              disabled={!isValidEmail(email) || submit.isPending}
              onClick={async () => {
                try {
                  await sendStudentResetLink(email);
                  toast.success(`Reset link sent to ${email}`);
                  handleClose();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Mail className="h-4 w-4 mr-1" /> Send reset link
            </Button>
          )}
          {!creds && (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !isValidEmail(email)}>
              {submit.isPending ? "Saving…" : isReLink ? "Re-link login" : "Create login"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, level")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
}

function useParents() {
  return useQuery({
    queryKey: ["parents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("id, full_name, email, phone")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ParentRow[];
    },
  });
}

function AddStudentDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: parents } = useParents();

  const emptyForm = {
    first_name: "",
    last_name: "",
    middle_name: "",
    admission_session_id: "",
    admission_no: "",
    date_of_birth: "",
    gender: "" as "" | Gender,
    class_id: "",
    parent_id: "",
    address: "",
    medical_info: "",
    nationality: "Nigerian",
    state_of_origin: "",
    lga: "",
    place_of_birth: "",
    religion: "",
    blood_group: "",
    genotype: "",
    allergies: "",
    disabilities: "",
    previous_school: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_contact_relation: "",
    home_phone: "",
    email: "",
    contact_email_1: "",
    contact_email_2: "",
    contact_phone_1: "",
    contact_phone_2: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [provisionLogin, setProvisionLogin] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [portalPasswordConfirm, setPortalPasswordConfirm] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; password: string | null; linked: boolean } | null>(null);
  const provisionFn = useServerFn(provisionStudentLogin);
  const [parentMode, setParentMode] = useState<"existing" | "new">("existing");
  const [newParent, setNewParent] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    occupation: "",
  });
  const setNP = <K extends keyof typeof newParent>(k: K, v: (typeof newParent)[K]) =>
    setNewParent((p) => ({ ...p, [k]: v }));

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Photo must be under 5MB.");
      return;
    }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.first_name.trim() || !form.last_name.trim() || !form.admission_no) {
        throw new Error("First name, last name and admission number are required.");
      }
      let photo_url: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("student-photos")
          .upload(path, photoFile, { contentType: photoFile.type });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("student-photos").getPublicUrl(path);
        photo_url = data.publicUrl;
      }
      let parent_id: string | null = form.parent_id || null;
      if (parentMode === "new" && newParent.full_name.trim()) {
        const { data: pIns, error: pErr } = await supabase
          .from("parents")
          .insert({
            full_name: newParent.full_name.trim(),
            email: newParent.email || null,
            phone: newParent.phone || null,
            address: newParent.address || null,
            occupation: newParent.occupation || null,
          })
          .select("id")
          .single();
        if (pErr) throw pErr;
        parent_id = pIns.id;
      }
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        full_name: [form.first_name, form.middle_name, form.last_name]
          .map((p) => p.trim()).filter(Boolean).join(" "),
        admission_session_id: form.admission_session_id || null,
        middle_name: form.middle_name || null,
        admission_no: form.admission_no,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        class_id: form.class_id || null,
        parent_id,
        address: form.address || null,
        medical_info: form.medical_info || null,
        nationality: form.nationality || null,
        state_of_origin: form.state_of_origin || null,
        lga: form.lga || null,
        place_of_birth: form.place_of_birth || null,
        religion: form.religion || null,
        blood_group: form.blood_group || null,
        genotype: form.genotype || null,
        allergies: form.allergies || null,
        disabilities: form.disabilities || null,
        previous_school: form.previous_school || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        emergency_contact_relation: form.emergency_contact_relation || null,
        home_phone: form.home_phone || null,
        email: form.email || null,
        contact_email_1: form.contact_email_1 || null,
        contact_email_2: form.contact_email_2 || null,
        contact_phone_1: form.contact_phone_1 || null,
        contact_phone_2: form.contact_phone_2 || null,
        photo_url,
      };
      const { data: inserted, error } = await supabase
        .from("students")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      if (provisionLogin) {
        if (!isValidEmail(form.email)) throw new Error("A valid email address is required to create a portal login.");
        if (portalPassword || portalPasswordConfirm) {
          if (portalPassword.length < 8) throw new Error("Portal password must be at least 8 characters.");
          if (portalPassword !== portalPasswordConfirm) throw new Error("Portal passwords do not match.");
        }
        const result = await provisionFn({
          data: { student_id: inserted.id, email: form.email, ...(portalPassword ? { password: portalPassword } : {}) },
        });
        return { credentials: { email: result.email, password: result.temp_password, linked: result.linked_existing } };
      }
      return { credentials: null as null };
    },
    onSuccess: (res) => {
      toast.success("Student admitted.");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["parents"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (res?.credentials) {
        setCredentials(res.credentials);
      } else {
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 flex-wrap">
          Admit new student
          {provisionLogin && isValidEmail(form.email) ? (
            <Badge variant="default">Portal login will be created</Badge>
          ) : (
            <Badge variant="outline">No portal login</Badge>
          )}
        </DialogTitle>
        <DialogDescription>Capture full bio-data, guardian and medical info.</DialogDescription>
      </DialogHeader>

      {/* Photo */}
      <div className="flex items-center gap-4 p-3 border rounded-md bg-muted/30">
        <Avatar className="h-20 w-20">
          <SignedAvatarImage bucket="student-photos" src={photoPreview} />
          <AvatarFallback><User className="h-8 w-8 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <Label htmlFor="student-photo" className="text-xs font-medium">Passport photo</Label>
          <p className="text-xs text-muted-foreground mb-2">JPG/PNG up to 5MB.</p>
          <label className="inline-flex">
            <input id="student-photo" type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-background hover:bg-accent cursor-pointer">
              <Upload className="h-3 w-3" /> {photoFile ? "Change photo" : "Upload photo"}
            </span>
          </label>
        </div>
      </div>

      <SectionTitle>Personal information</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="First name" required>
          <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
        </Field>
        <Field label="Last name" required>
          <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
        </Field>
        <Field label="Middle name">
          <Input value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} />
        </Field>
        <Field label="Academic session">
          <SessionSelect
            label=""
            value={form.admission_session_id}
            onChange={(v) => set("admission_session_id", v)}
          />
        </Field>
        <Field label="Admission number" required>
          <Input value={form.admission_no} onChange={(e) => set("admission_no", e.target.value)} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onValueChange={(v) => set("gender", v as Gender)}>
            <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Place of birth">
          <Input value={form.place_of_birth} onChange={(e) => set("place_of_birth", e.target.value)} />
        </Field>
        <Field label="Nationality">
          <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <StateLgaSelect
            stateValue={form.state_of_origin}
            lgaValue={form.lga}
            onStateChange={(v) => set("state_of_origin", v)}
            onLgaChange={(v) => set("lga", v)}
          />
        </div>
        <Field label="Religion">
          <Input value={form.religion} onChange={(e) => set("religion", e.target.value)} />
        </Field>
      </div>

      <SectionTitle>Contact</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Phone (home)">
          <Input value={form.home_phone} onChange={(e) => set("home_phone", e.target.value)} />
        </Field>
        <Field label="Student login email">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Contact email 1">
          <Input type="email" value={form.contact_email_1} onChange={(e) => set("contact_email_1", e.target.value)} />
        </Field>
        <Field label="Contact email 2">
          <Input type="email" value={form.contact_email_2} onChange={(e) => set("contact_email_2", e.target.value)} />
        </Field>
        <Field label="Contact phone 1">
          <Input value={form.contact_phone_1} onChange={(e) => set("contact_phone_1", e.target.value)} />
        </Field>
        <Field label="Contact phone 2">
          <Input value={form.contact_phone_2} onChange={(e) => set("contact_phone_2", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Residential address">
            <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>
      </div>

      <SectionTitle>School</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Class">
          <Select value={form.class_id} onValueChange={(v) => set("class_id", v)}>
            <SelectTrigger><SelectValue placeholder="Assign class" /></SelectTrigger>
            <SelectContent>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Previous school">
          <Input value={form.previous_school} onChange={(e) => set("previous_school", e.target.value)} />
        </Field>
      </div>

      <SectionTitle>Guardian & emergency contact</SectionTitle>
      <div className="flex gap-2 mb-2">
        <Button
          type="button"
          size="sm"
          variant={parentMode === "existing" ? "default" : "outline"}
          onClick={() => setParentMode("existing")}
        >
          Link existing parent
        </Button>
        <Button
          type="button"
          size="sm"
          variant={parentMode === "new" ? "default" : "outline"}
          onClick={() => { setParentMode("new"); set("parent_id", ""); }}
        >
          Create new parent
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {parentMode === "existing" ? (
          <Field label="Linked guardian (parent record)">
            <Select value={form.parent_id} onValueChange={(v) => set("parent_id", v)}>
              <SelectTrigger><SelectValue placeholder={(parents ?? []).length ? "Link to parent" : "No parents yet — create one"} /></SelectTrigger>
              <SelectContent>
                {(parents ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Parent / guardian full name" required>
              <Input value={newParent.full_name} onChange={(e) => setNP("full_name", e.target.value)} />
            </Field>
            <Field label="Parent email">
              <Input type="email" value={newParent.email} onChange={(e) => setNP("email", e.target.value)} />
            </Field>
            <Field label="Parent phone">
              <Input value={newParent.phone} onChange={(e) => setNP("phone", e.target.value)} />
            </Field>
            <Field label="Occupation">
              <Input value={newParent.occupation} onChange={(e) => setNP("occupation", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Parent address">
                <Textarea rows={2} value={newParent.address} onChange={(e) => setNP("address", e.target.value)} />
              </Field>
            </div>
          </>
        )}
        <Field label="Emergency contact name">
          <Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
        </Field>
        <Field label="Emergency contact phone">
          <Input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
        </Field>
        <Field label="Relationship">
          <Input placeholder="e.g. Mother, Uncle" value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} />
        </Field>
      </div>

      <SectionTitle>Medical</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Blood group">
          <Select value={form.blood_group} onValueChange={(v) => set("blood_group", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Genotype">
          <Select value={form.genotype} onValueChange={(v) => set("genotype", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {["AA","AS","AC","SS","SC"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Allergies">
            <Textarea rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Disabilities / special needs">
            <Textarea rows={2} value={form.disabilities} onChange={(e) => set("disabilities", e.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Other medical info">
            <Textarea rows={2} value={form.medical_info} onChange={(e) => set("medical_info", e.target.value)} />
          </Field>
        </div>
      </div>

      <SectionTitle>Student login account</SectionTitle>
      <div className="rounded-md border p-3 bg-muted/20 space-y-2">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={provisionLogin}
            onCheckedChange={(v) => setProvisionLogin(!!v)}
          />
          <span>
            Create a portal login for this student
            <span className="block text-xs text-muted-foreground">
              Uses the email above. If an account already exists with that email, it will be linked instead.
            </span>
          </span>
        </label>
        {provisionLogin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <Field label="Portal password">
              <PasswordInput
                value={portalPassword}
                onChange={(e) => setPortalPassword(e.target.value)}
                placeholder="Min 8 characters"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password">
              <PasswordInput
                value={portalPasswordConfirm}
                onChange={(e) => setPortalPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <p className="sm:col-span-2 text-xs text-muted-foreground">Leave blank to auto-generate a temporary password.</p>
          </div>
        )}
        {credentials && (
          <div className="rounded-md border bg-background p-3 text-xs space-y-1">
            <p className="font-medium text-sm">
              {credentials.linked ? "Linked to existing account" : "Login created"}
            </p>
            <p>Email: <span className="font-mono">{credentials.email}</span></p>
            {credentials.password && (
              <p>
                Temporary password:{" "}
                <span className="font-mono select-all">{credentials.password}</span>
              </p>
            )}
            <p className="text-muted-foreground">Share these credentials with the student. They can change the password after first sign-in.</p>
          </div>
        )}
      </div>

      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>{credentials ? "Close" : "Cancel"}</Button>
        {!credentials && (
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Saving…" : "Admit student"}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-1">{children}</h4>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function StudentProfileSheet({
  student,
  onClose,
  onEdit,
  onManageLogin,
  photo,
}: {
  student: Student | null;
  onClose: () => void;
  onEdit: (s: Student) => void;
  onManageLogin: (s: Student) => void;
  photo: ReturnType<typeof usePhotoMutations>;
}) {
  const qc = useQueryClient();
  const { isAdmin, isStaff } = useAuth();
  const graduate = useMutation({
    mutationFn: async () => {
      if (!student) return;
      const { error } = await supabase
        .from("students")
        .update({ status: "graduated", graduated_at: new Date().toISOString().slice(0, 10), is_active: false })
        .eq("id", student.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student graduated to alumni.");
      qc.invalidateQueries({ queryKey: ["students"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      if (!student) return;
      const { error } = await supabase
        .from("students")
        .update({ status: "withdrawn", is_active: false })
        .eq("id", student.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Student withdrawn.");
      qc.invalidateQueries({ queryKey: ["students"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={!!student} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {student && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16">
                  <SignedAvatarImage bucket="student-photos" src={student.photo_url} alt={student.full_name} />
                  <AvatarFallback>{student.full_name.split(" ").map(n => n[0]).slice(0,2).join("")}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="truncate">{student.full_name}{student.middle_name ? ` ${student.middle_name}` : ""}</SheetTitle>
                  <SheetDescription className="font-mono text-xs flex flex-wrap items-center gap-2">
                    <span>{student.admission_no}</span>
                    {statusBadge(student.status)}
                    {portalBadge(student.user_id)}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-3">
                {isAdmin && (
                  <Button size="sm" variant="default" onClick={() => onEdit(student)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit details
                  </Button>
                )}
                {isAdmin && student.user_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isValidEmail(student.email)}
                    onClick={async () => {
                      try {
                        await sendStudentResetLink(student.email ?? "");
                        toast.success(`Reset link sent to ${student.email}`);
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" /> Re-send reset link
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!isValidEmail(student.email)}
                    onClick={() => onManageLogin(student)}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" />
                    {student.user_id ? "Regenerate credentials" : "Create login"}
                  </Button>
                )}
                {isStaff && (
                  <Button size="sm" variant="outline" onClick={() => photo.pickAndReplace(student)}>
                    <ImageIcon className="h-3.5 w-3.5 mr-1" /> {student.photo_url ? "Replace" : "Upload"} photo
                  </Button>
                )}
                {isStaff && student.photo_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => photo.remove.mutate(student)}
                    disabled={photo.remove.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove photo
                  </Button>
                )}
                {!isAdmin && !isStaff && (
                  <p className="text-xs text-muted-foreground italic">View-only access.</p>
                )}
              </div>
            </SheetHeader>
            <div className="mt-4 space-y-4 text-sm">
              <Section title="Personal">
                <Row label="Date of birth" value={student.date_of_birth ?? "—"} />
                <Row label="Gender" value={student.gender ?? "—"} />
                <Row label="Place of birth" value={student.place_of_birth ?? "—"} />
                <Row label="Nationality" value={student.nationality ?? "—"} />
                <Row label="State of origin" value={student.state_of_origin ?? "—"} />
                <Row label="LGA" value={student.lga ?? "—"} />
                <Row label="Religion" value={student.religion ?? "—"} />
              </Section>
              <Section title="Contact">
                <Row label="Phone" value={student.home_phone ?? "—"} />
                <Row label="Email" value={student.email ?? "—"} />
                <Row label="Address" value={student.address ?? "—"} />
              </Section>
              <Section title="School">
                <Row label="Enrolled" value={student.enrollment_date} />
                <Row label="Class" value={student.classes?.name ?? "—"} />
                <Row label="Previous school" value={student.previous_school ?? "—"} />
              </Section>
              <Section title="Guardian">
                {student.parents ? (
                  <>
                    <Row label="Name" value={student.parents.full_name} />
                    <Row label="Phone" value={student.parents.phone ?? "—"} />
                    <Row label="Email" value={student.parents.email ?? "—"} />
                  </>
                ) : (
                  <p className="text-muted-foreground">No guardian linked.</p>
                )}
                <Row label="Emergency contact" value={student.emergency_contact_name ?? "—"} />
                <Row label="Emergency phone" value={student.emergency_contact_phone ?? "—"} />
                <Row label="Relationship" value={student.emergency_contact_relation ?? "—"} />
              </Section>
              <Section title="Medical">
                <Row label="Blood group" value={student.blood_group ?? "—"} />
                <Row label="Genotype" value={student.genotype ?? "—"} />
                <Row label="Allergies" value={student.allergies ?? "—"} />
                <Row label="Disabilities" value={student.disabilities ?? "—"} />
                <p className="whitespace-pre-wrap pt-1">{student.medical_info || ""}</p>
              </Section>
              {isAdmin && student.status === "active" && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" className="flex-1" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
                    Withdraw
                  </Button>
                  <Button className="flex-1" onClick={() => graduate.mutate()} disabled={graduate.isPending}>
                    <GraduationCap className="h-4 w-4 mr-1" /> Graduate
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{value}</span>
    </div>
  );
}

/* -------------------- Photo helpers + Edit dialog -------------------- */

function extractStoragePath(url: string): string | null {
  // public URL form: .../storage/v1/object/public/student-photos/<path>
  const m = url.match(/\/student-photos\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function uploadStudentPhoto(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5MB.");
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("student-photos")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("student-photos").getPublicUrl(path);
  return data.publicUrl;
}

async function deleteStudentPhotoByUrl(url: string | null) {
  if (!url) return;
  const path = extractStoragePath(url);
  if (!path) return;
  await supabase.storage.from("student-photos").remove([path]);
}

function usePhotoMutations() {
  const qc = useQueryClient();

  const replace = useMutation({
    mutationFn: async ({ student, file }: { student: Student; file: File }) => {
      const newUrl = await uploadStudentPhoto(file);
      const { error } = await supabase
        .from("students")
        .update({ photo_url: newUrl })
        .eq("id", student.id);
      if (error) throw error;
      // best-effort cleanup of old object
      await deleteStudentPhotoByUrl(student.photo_url);
    },
    onSuccess: () => {
      toast.success("Photo updated.");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (student: Student) => {
      if (!student.photo_url) return;
      const { error } = await supabase
        .from("students")
        .update({ photo_url: null })
        .eq("id", student.id);
      if (error) throw error;
      await deleteStudentPhotoByUrl(student.photo_url);
    },
    onSuccess: () => {
      toast.success("Photo removed.");
      qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pickAndReplace = (student: Student) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) replace.mutate({ student, file });
    };
    input.click();
  };

  return { replace, remove, pickAndReplace };
}

function EditStudentDialog({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: parents } = useParents();

  const [form, setForm] = useState(() => toFormState(student));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(student?.photo_url ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);

  // re-sync when a different student is opened
  if (student && form.id !== student.id) {
    setForm(toFormState(student));
    setPhotoFile(null);
    setPhotoPreview(student.photo_url);
    setRemovePhoto(false);
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const updateUserFn = useServerFn(updateUser);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => { setNewPassword(""); setConfirmPassword(""); }, [student?.id]);
  const passwordSave = useMutation({
    mutationFn: async () => {
      if (!student?.user_id) throw new Error("This student has no portal login yet.");
      if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
      await updateUserFn({ data: { user_id: student.user_id, password: newPassword } });
    },
    onSuccess: () => {
      toast.success("Password updated. Share it with the student.");
      setNewPassword(""); setConfirmPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Photo must be under 5MB."); return; }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
    setRemovePhoto(false);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!student) return;
      if (!form.first_name.trim() || !form.last_name.trim() || !form.admission_no) throw new Error("First name, last name and admission number are required.");

      let photo_url: string | null | undefined = undefined;
      if (photoFile) {
        photo_url = await uploadStudentPhoto(photoFile);
      } else if (removePhoto) {
        photo_url = null;
      }

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        full_name: [form.first_name, form.middle_name, form.last_name]
          .map((p) => p.trim()).filter(Boolean).join(" "),
        admission_session_id: form.admission_session_id || null,
        middle_name: form.middle_name || null,
        admission_no: form.admission_no,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        class_id: form.class_id || null,
        parent_id: form.parent_id || null,
        address: form.address || null,
        medical_info: form.medical_info || null,
        nationality: form.nationality || null,
        state_of_origin: form.state_of_origin || null,
        lga: form.lga || null,
        place_of_birth: form.place_of_birth || null,
        religion: form.religion || null,
        blood_group: form.blood_group || null,
        genotype: form.genotype || null,
        allergies: form.allergies || null,
        disabilities: form.disabilities || null,
        previous_school: form.previous_school || null,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        emergency_contact_relation: form.emergency_contact_relation || null,
        home_phone: form.home_phone || null,
        email: form.email || null,
        contact_email_1: form.contact_email_1 || null,
        contact_email_2: form.contact_email_2 || null,
        contact_phone_1: form.contact_phone_1 || null,
        contact_phone_2: form.contact_phone_2 || null,
        ...(photo_url !== undefined ? { photo_url } : {}),
      };

      const { error } = await supabase.from("students").update(payload).eq("id", student.id);
      if (error) throw error;

      // cleanup old photo file if replaced or removed
      if ((photoFile || removePhoto) && student.photo_url) {
        await deleteStudentPhotoByUrl(student.photo_url);
      }
    },
    onSuccess: () => {
      toast.success("Student updated.");
      qc.invalidateQueries({ queryKey: ["students"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Edit student
            {student && portalBadge(student.user_id)}
          </DialogTitle>
          <DialogDescription>Update bio-data, contact, school, guardian and medical info.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 p-3 border rounded-md bg-muted/30">
          <Avatar className="h-20 w-20">
            <SignedAvatarImage bucket="student-photos" src={removePhoto ? null : photoPreview} />
            <AvatarFallback><User className="h-8 w-8 text-muted-foreground" /></AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label className="text-xs font-medium">Passport photo</Label>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex">
                <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
                <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-background hover:bg-accent cursor-pointer">
                  <Upload className="h-3 w-3" /> {photoFile || photoPreview ? "Replace photo" : "Upload photo"}
                </span>
              </label>
              {(photoPreview || photoFile) && !removePhoto && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setRemovePhoto(true); setPhotoFile(null); setPhotoPreview(null); }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Remove
                </Button>
              )}
              {removePhoto && student?.photo_url && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setRemovePhoto(false); setPhotoPreview(student.photo_url); }}
                >
                  Undo remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">JPG/PNG up to 5MB.</p>
          </div>
        </div>

        <SectionTitle>Personal information</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name" required>
            <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </Field>
          <Field label="Last name" required>
            <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </Field>
          <Field label="Middle name">
            <Input value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} />
          </Field>
          <Field label="Academic session">
            <SessionSelect
              label=""
              value={form.admission_session_id}
              onChange={(v) => set("admission_session_id", v)}
            />
          </Field>
          <Field label="Admission number" required>
            <Input value={form.admission_no} onChange={(e) => set("admission_no", e.target.value)} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </Field>
          <Field label="Gender">
            <Select value={form.gender} onValueChange={(v) => set("gender", v as Gender)}>
              <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Place of birth">
            <Input value={form.place_of_birth} onChange={(e) => set("place_of_birth", e.target.value)} />
          </Field>
          <Field label="Nationality">
            <Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <StateLgaSelect
              stateValue={form.state_of_origin}
              lgaValue={form.lga}
              onStateChange={(v) => set("state_of_origin", v)}
              onLgaChange={(v) => set("lga", v)}
            />
          </div>
          <Field label="Religion">
            <Input value={form.religion} onChange={(e) => set("religion", e.target.value)} />
          </Field>
        </div>

        <SectionTitle>Contact</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Phone (home)">
            <Input value={form.home_phone} onChange={(e) => set("home_phone", e.target.value)} />
          </Field>
          <Field label="Student login email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Contact email 1">
            <Input type="email" value={form.contact_email_1} onChange={(e) => set("contact_email_1", e.target.value)} />
          </Field>
          <Field label="Contact email 2">
            <Input type="email" value={form.contact_email_2} onChange={(e) => set("contact_email_2", e.target.value)} />
          </Field>
          <Field label="Contact phone 1">
            <Input value={form.contact_phone_1} onChange={(e) => set("contact_phone_1", e.target.value)} />
          </Field>
          <Field label="Contact phone 2">
            <Input value={form.contact_phone_2} onChange={(e) => set("contact_phone_2", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Residential address">
              <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
          </div>
        </div>

        <SectionTitle>School</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Class">
            <Select value={form.class_id} onValueChange={(v) => set("class_id", v)}>
              <SelectTrigger><SelectValue placeholder="Assign class" /></SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Previous school">
            <Input value={form.previous_school} onChange={(e) => set("previous_school", e.target.value)} />
          </Field>
        </div>

        <SectionTitle>Guardian & emergency contact</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Linked guardian (parent record)">
            <Select value={form.parent_id} onValueChange={(v) => set("parent_id", v)}>
              <SelectTrigger><SelectValue placeholder="Link to parent" /></SelectTrigger>
              <SelectContent>
                {(parents ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Emergency contact name">
            <Input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
          </Field>
          <Field label="Emergency contact phone">
            <Input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} />
          </Field>
          <Field label="Relationship">
            <Input value={form.emergency_contact_relation} onChange={(e) => set("emergency_contact_relation", e.target.value)} />
          </Field>
        </div>

        <SectionTitle>Medical</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Blood group">
            <Select value={form.blood_group} onValueChange={(v) => set("blood_group", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Genotype">
            <Select value={form.genotype} onValueChange={(v) => set("genotype", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {["AA","AS","AC","SS","SC"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Allergies">
              <Textarea rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Disabilities / special needs">
              <Textarea rows={2} value={form.disabilities} onChange={(e) => set("disabilities", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Other medical info">
              <Textarea rows={2} value={form.medical_info} onChange={(e) => set("medical_info", e.target.value)} />
            </Field>
          </div>
        </div>

        <SectionTitle>Portal password</SectionTitle>
        {student?.user_id ? (
          <div className="rounded-md border p-3 bg-muted/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="New password">
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm new password">
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => passwordSave.mutate()}
              disabled={passwordSave.isPending || !newPassword}
            >
              <KeyRound className="h-4 w-4 mr-1" />{passwordSave.isPending ? "Updating…" : "Update password"}
            </Button>
            <p className="text-xs text-muted-foreground">Share the new password with the student. They can change it after signing in.</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground rounded-md border p-3 bg-muted/20">
            No portal login yet — use “Create login” from the row menu to create one.
          </p>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
            {submit.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toFormState(s: Student | null) {
  return {
    id: s?.id ?? "",
    first_name: s?.first_name ?? (s?.full_name ?? "").split(/\s+/)[0] ?? "",
    last_name: s?.last_name ?? (s?.full_name ?? "").split(/\s+/).slice(1).join(" "),
    admission_session_id: s?.admission_session_id ?? "",
    middle_name: s?.middle_name ?? "",
    admission_no: s?.admission_no ?? "",
    date_of_birth: s?.date_of_birth ?? "",
    gender: (s?.gender ?? "") as "" | Gender,
    class_id: s?.class_id ?? "",
    parent_id: s?.parent_id ?? "",
    address: s?.address ?? "",
    medical_info: s?.medical_info ?? "",
    nationality: s?.nationality ?? "",
    state_of_origin: s?.state_of_origin ?? "",
    lga: s?.lga ?? "",
    place_of_birth: s?.place_of_birth ?? "",
    religion: s?.religion ?? "",
    blood_group: s?.blood_group ?? "",
    genotype: s?.genotype ?? "",
    allergies: s?.allergies ?? "",
    disabilities: s?.disabilities ?? "",
    previous_school: s?.previous_school ?? "",
    emergency_contact_name: s?.emergency_contact_name ?? "",
    emergency_contact_phone: s?.emergency_contact_phone ?? "",
    emergency_contact_relation: s?.emergency_contact_relation ?? "",
    home_phone: s?.home_phone ?? "",
    email: s?.email ?? "",
    contact_email_1: s?.contact_email_1 ?? "",
    contact_email_2: s?.contact_email_2 ?? "",
    contact_phone_1: s?.contact_phone_1 ?? "",
    contact_phone_2: s?.contact_phone_2 ?? "",
  };
}

/* -------------------- Attendance -------------------- */

type AttStatus = "present" | "absent" | "late" | "excused";

function AttendanceTab() {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});

  const { data: students } = useQuery({
    queryKey: ["attendance-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["attendance-existing", classId, date],
    enabled: !!classId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("class_id", classId)
        .eq("date", date);
      if (error) throw error;
      const m: Record<string, AttStatus> = {};
      (data ?? []).forEach((r) => { m[r.student_id] = r.status as AttStatus; });
      setMarks(m);
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!classId || !date) throw new Error("Pick class and date.");
      if (!students || students.length === 0) throw new Error("No students in this class.");
      // delete existing for that day+class then insert fresh
      await supabase.from("attendance").delete().eq("class_id", classId).eq("date", date);
      const rows = students.map((s) => ({
        student_id: s.id,
        class_id: classId,
        date,
        status: marks[s.id] ?? "present",
        ...(sessionId ? { academic_session_id: sessionId } : {}),
      }));
      const { error } = await supabase.from("attendance").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance saved.");
      qc.invalidateQueries({ queryKey: ["attendance-existing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function setMark(id: string, s: AttStatus) {
    setMarks((m) => ({ ...m, [id]: s }));
  }

  function markAll(s: AttStatus) {
    if (!students) return;
    const m: Record<string, AttStatus> = {};
    students.forEach((st) => { m[st.id] = s; });
    setMarks(m);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>
            {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <SessionSelect label="" className="sm:w-48" value={sessionId} onChange={setSessionId} />
        <Input type="date" className="sm:w-48" value={date} onChange={(e) => setDate(e.target.value)} />
        {classId && students && students.length > 0 && (
          <div className="flex gap-1 ml-auto">
            <Button variant="outline" size="sm" onClick={() => markAll("present")}>All present</Button>
            <Button variant="outline" size="sm" onClick={() => markAll("absent")}>All absent</Button>
          </div>
        )}
      </div>

      {!classId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Select a class to mark attendance.</p>
      ) : !students || students.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No active students in this class.</p>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission #</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell>
                      <Select value={marks[s.id] ?? "present"} onValueChange={(v) => setMark(s.id, v as AttStatus)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="present">Present</SelectItem>
                          <SelectItem value="absent">Absent</SelectItem>
                          <SelectItem value="late">Late</SelectItem>
                          <SelectItem value="excused">Excused</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : existing && existing.length > 0 ? "Update attendance" : "Save attendance"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

/* -------------------- Promotion -------------------- */

function PromotionTab() {
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const [fromClass, setFromClass] = useState<string>("");
  const [toClass, setToClass] = useState<string>("");
  const [graduate, setGraduate] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [sessionId, setSessionId] = useState<string>("");

  const { data: students } = useQuery({
    queryKey: ["promotion-students", fromClass],
    enabled: !!fromClass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no")
        .eq("class_id", fromClass)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const promote = useMutation({
    mutationFn: async () => {
      if (!fromClass) throw new Error("Pick a source class.");
      if (!graduate && !toClass) throw new Error("Pick a destination class or choose Graduate.");
      if (!sessionId) throw new Error("Pick an academic session.");
      const ids = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);
      if (ids.length === 0) throw new Error("Select at least one student.");

      // log promotion records
      const promoRows = ids.map((id) => ({
        student_id: id,
        session_id: sessionId,
        from_class_id: fromClass,
        to_class_id: graduate ? null : toClass,
        status: (graduate ? "graduated" : "promoted") as "graduated" | "promoted",
      }));
      const { error: pErr } = await supabase.from("promotion").insert(promoRows);
      if (pErr) throw pErr;

      // update students
      if (graduate) {
        const { error } = await supabase
          .from("students")
          .update({
            status: "graduated",
            is_active: false,
            graduated_at: new Date().toISOString().slice(0, 10),
          })
          .in("id", ids);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("students")
          .update({ class_id: toClass })
          .in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(graduate ? "Students graduated to alumni." : "Students promoted.");
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["promotion-students"] });
      setPicked({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allChecked = students && students.length > 0 && students.every((s) => picked[s.id]);

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">
        Move active students from one class to the next at end of term/session, or graduate final-year students to alumni.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
        <SessionSelect value={sessionId} onChange={setSessionId} />
        <Field label="From class">
          <Select value={fromClass} onValueChange={setFromClass}>
            <SelectTrigger><SelectValue placeholder="Source class" /></SelectTrigger>
            <SelectContent>
              {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <ArrowRight className="h-5 w-5 text-muted-foreground mb-2 hidden md:block" />
          <div className="flex-1">
            <Field label={graduate ? "Graduate to alumni" : "To class"}>
              <Select value={toClass} onValueChange={setToClass} disabled={graduate}>
                <SelectTrigger><SelectValue placeholder={graduate ? "—" : "Destination class"} /></SelectTrigger>
                <SelectContent>
                  {(classes ?? []).filter((c) => c.id !== fromClass).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={graduate} onChange={(e) => setGraduate(e.target.checked)} />
          Graduate (final year → alumni)
        </label>
      </div>

      {fromClass && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={!!allChecked}
                    onChange={(e) => {
                      const v: Record<string, boolean> = {};
                      (students ?? []).forEach((s) => { v[s.id] = e.target.checked; });
                      setPicked(v);
                    }}
                  />
                </TableHead>
                <TableHead>Admission #</TableHead>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(students ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No active students.</TableCell></TableRow>
              ) : (
                (students ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <input type="checkbox" checked={!!picked[s.id]} onChange={(e) => setPicked({ ...picked, [s.id]: e.target.checked })} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                    <TableCell>{s.full_name}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => promote.mutate()} disabled={promote.isPending || !fromClass}>
          {promote.isPending ? "Processing…" : graduate ? "Graduate selected" : "Promote selected"}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------- Alumni -------------------- */

function AlumniTab() {
  const [sessionFilter, setSessionFilter] = useState<string>(ALL_SESSIONS);
  const { data: alumni, isLoading } = useQuery({
    queryKey: ["students", "alumni", sessionFilter],
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, full_name, admission_no, graduated_at, admission_session_id, classes(name), sessions:sessions!students_admission_session_id_fkey(name)")
        .eq("status", "graduated")
        .order("graduated_at", { ascending: false });
      if (sessionFilter !== ALL_SESSIONS) q = q.eq("admission_session_id", sessionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <SessionSelect
        label=""
        allowAll
        autoDefault={false}
        className="w-full sm:w-56"
        value={sessionFilter}
        onChange={setSessionFilter}
      />
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admission #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Last class</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Graduated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : (alumni ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No alumni yet.</TableCell></TableRow>
            ) : (
              (alumni ?? []).map((a) => {
                const row = a as { classes?: { name?: string }; sessions?: { name?: string } | null };
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.admission_no}</TableCell>
                    <TableCell>{a.full_name}</TableCell>
                    <TableCell>{row.classes?.name ?? "—"}</TableCell>
                    <TableCell>{row.sessions?.name ?? "—"}</TableCell>
                    <TableCell>{a.graduated_at ?? "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
