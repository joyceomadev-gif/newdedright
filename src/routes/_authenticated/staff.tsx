import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "@/lib/paginated-fetch";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SignedAvatarImage } from "@/lib/storage";
import { StateLgaSelect } from "@/components/StateLgaSelect";
import {
  Plus, Search, Upload, User, Pencil, CalendarCheck, Wallet, Star, FileText,
  Download, Trash2, CheckCircle2, CreditCard, Loader2,
} from "lucide-react";
import { downloadCsv } from "@/lib/export-csv";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { SessionSelect, useCurrentSessionId } from "@/components/SessionSelect";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { softDelete } from "@/lib/soft-delete";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type StaffStatus = "active" | "on_leave" | "suspended" | "terminated" | "retired";
type EmploymentType = "full_time" | "part_time" | "contract" | "volunteer";
type AttStatus = "present" | "absent" | "late" | "half_day" | "leave";
type LeaveType = "annual" | "sick" | "maternity" | "paternity" | "study" | "unpaid" | "other";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type PayStatus = "draft" | "approved" | "paid";

interface Staff {
  id: string;
  user_id: string | null;
  staff_no: string;
  full_name: string;
  position: string;
  department: string | null;
  email: string | null;
  phone: string | null;
  salary: number | null;
  date_employed: string;
  is_active: boolean;
  photo_url: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  qualification: string | null;
  nin: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_code: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  paystack_recipient_code: string | null;
  employment_type: EmploymentType;
  status: StaffStatus;
  date_terminated: string | null;
  notes: string | null;
}

function StaffPage() {
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <p className="text-muted-foreground text-sm">
          Profiles, attendance & leave, payroll, and performance evaluations.
        </p>
      </div>
      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="roster"><User className="h-4 w-4 mr-1" />Roster</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarCheck className="h-4 w-4 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="leave"><FileText className="h-4 w-4 mr-1" />Leave</TabsTrigger>
          <TabsTrigger value="payroll"><Wallet className="h-4 w-4 mr-1" />Payroll</TabsTrigger>
          <TabsTrigger value="evaluations"><Star className="h-4 w-4 mr-1" />Evaluations</TabsTrigger>
        </TabsList>
        <TabsContent value="roster"><RosterTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="leave"><LeaveTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="payroll"><PayrollTab isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="evaluations"><EvaluationsTab isAdmin={isAdmin} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Helpers -------------------- */

function useStaffList() {
  return useQuery({
    queryKey: ["staff", "all"],
    queryFn: async () =>
      fetchAllPaged<Staff>(() =>
        supabase
          .from("staff")
          .select("*")
          .order("full_name") as unknown as {
            range: (from: number, to: number) => PromiseLike<{ data: Staff[] | null; error: { message: string } | null }>;
          },
      ),
  });
}

async function uploadStaffPhoto(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5MB.");
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("staff-photos")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("staff-photos").getPublicUrl(path);
  return data.publicUrl;
}

function statusBadge(s: StaffStatus) {
  const map: Record<StaffStatus, { v: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    active: { v: "default", label: "Active" },
    on_leave: { v: "secondary", label: "On leave" },
    suspended: { v: "destructive", label: "Suspended" },
    terminated: { v: "destructive", label: "Terminated" },
    retired: { v: "outline", label: "Retired" },
  };
  const m = map[s];
  return <Badge variant={m.v}>{m.label}</Badge>;
}

function leaveBadge(s: LeaveStatus) {
  const map: Record<LeaveStatus, { v: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
    pending: { v: "secondary", label: "Pending" },
    approved: { v: "default", label: "Approved" },
    rejected: { v: "destructive", label: "Rejected" },
    cancelled: { v: "outline", label: "Cancelled" },
  };
  const m = map[s];
  return <Badge variant={m.v}>{m.label}</Badge>;
}

function payBadge(s: PayStatus) {
  const map: Record<PayStatus, { v: "default" | "secondary" | "outline"; label: string }> = {
    draft: { v: "outline", label: "Draft" },
    approved: { v: "secondary", label: "Approved" },
    paid: { v: "default", label: "Paid" },
  };
  const m = map[s];
  return <Badge variant={m.v}>{m.label}</Badge>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-1">{children}</h4>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2">{value}</span>
    </div>
  );
}

/* -------------------- Roster -------------------- */

function RosterTab({ isAdmin }: { isAdmin: boolean }) {
  const { data: staff, isLoading } = useStaffList();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);

  const departments = useMemo(
    () => Array.from(new Set((staff ?? []).map((s) => s.department).filter(Boolean) as string[])),
    [staff],
  );

  const filtered = (staff ?? []).filter((s) => {
    if (deptFilter !== "all" && s.department !== deptFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.staff_no.toLowerCase().includes(q) || s.position.toLowerCase().includes(q);
  });

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, deptFilter]);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, staff #, role…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdmin && (
          <BulkImportDialog
            title="Bulk onboard staff"
            description="Upload an Excel or CSV file. Required: staff_no, full_name, position."
            templateName="staff-import-template"
            templateHeaders={["staff_no", "full_name", "position", "department", "email", "phone", "gender", "date_of_birth", "date_employed", "qualification", "employment_type", "salary", "address", "nin", "bank_name", "bank_account_number", "bank_account_name"]}
            requiredHeaders={["staff_no", "full_name", "position"]}
            onImportRow={async (r) => {
              const et = (r["employment_type"] || "full_time").toLowerCase();
              const validEt: EmploymentType[] = ["full_time", "part_time", "contract", "volunteer"];
              const employment_type = (validEt as string[]).includes(et) ? (et as EmploymentType) : "full_time";
              const salary = r["salary"] ? Number(r["salary"]) : null;
              const payload = {
                staff_no: r["staff_no"],
                full_name: r["full_name"],
                position: r["position"],
                department: r["department"] || null,
                email: r["email"] || null,
                phone: r["phone"] || null,
                gender: r["gender"] || null,
                date_of_birth: r["date_of_birth"] || null,
                date_employed: r["date_employed"] || new Date().toISOString().slice(0, 10),
                qualification: r["qualification"] || null,
                employment_type,
                salary: salary != null && !Number.isNaN(salary) ? salary : null,
                address: r["address"] || null,
                nin: r["nin"] || null,
                bank_name: r["bank_name"] || null,
                bank_account_number: r["bank_account_number"] || null,
                bank_account: r["bank_account_number"] || null,
                bank_account_name: r["bank_account_name"] || null,
                status: "active" as StaffStatus,
                is_active: true,
              };
              const { error } = await supabase.from("staff").insert(payload);
              if (error) throw new Error(error.message);
            }}
            onCompleted={() => qc.invalidateQueries({ queryKey: ["staff"] })}
          />
        )}
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv("staff", filtered, [
              { header: "Staff #", accessor: (s) => s.staff_no },
              { header: "Full name", accessor: (s) => s.full_name },
              { header: "Position", accessor: (s) => s.position },
              { header: "Department", accessor: (s) => s.department ?? "" },
              { header: "Email", accessor: (s) => s.email ?? "" },
              { header: "Phone", accessor: (s) => s.phone ?? "" },
              { header: "Gender", accessor: (s) => s.gender ?? "" },
              { header: "Date of birth", accessor: (s) => s.date_of_birth ?? "" },
              { header: "Date employed", accessor: (s) => s.date_employed },
              { header: "Employment type", accessor: (s) => s.employment_type },
              { header: "Status", accessor: (s) => s.status },
              { header: "Salary", accessor: (s) => s.salary ?? "" },
              { header: "Qualification", accessor: (s) => s.qualification ?? "" },
              { header: "Address", accessor: (s) => s.address ?? "" },
              { header: "NIN", accessor: (s) => s.nin ?? "" },
              { header: "Bank name", accessor: (s) => s.bank_name ?? "" },
              { header: "Bank account #", accessor: (s) => s.bank_account_number ?? "" },
              { header: "Bank account name", accessor: (s) => s.bank_account_name ?? "" },
            ])
          }
          disabled={filtered.length === 0}
        >
          <Download className="h-4 w-4 mr-1" />Export
        </Button>
        {isAdmin && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />Onboard staff</Button>
            </DialogTrigger>
            <StaffFormDialog mode="create" onClose={() => setOpenAdd(false)} />
          </Dialog>
        )}
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff #</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff found.</TableCell></TableRow>
            ) : (
              pageItems.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.staff_no}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <SignedAvatarImage bucket="staff-photos" src={s.photo_url} alt={s.full_name} />
                        <AvatarFallback className="text-xs">{s.full_name.split(" ").map(n => n[0]).slice(0,2).join("")}</AvatarFallback>
                      </Avatar>
                      {s.full_name}
                    </div>
                  </TableCell>
                  <TableCell>{s.position}</TableCell>
                  <TableCell>{s.department ?? "—"}</TableCell>
                  <TableCell>{statusBadge(s.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(s)}>View</Button>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
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

      <StaffProfileSheet staff={selected} onClose={() => setSelected(null)} isAdmin={isAdmin} onEdit={(s) => { setSelected(null); setEditing(s); }} />
      {editing && <StaffFormDialog mode="edit" staff={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function StaffProfileSheet({ staff, onClose, isAdmin, onEdit }: { staff: Staff | null; onClose: () => void; isAdmin: boolean; onEdit: (s: Staff) => void }) {
  return (
    <Sheet open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        {staff && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16">
                  <SignedAvatarImage bucket="staff-photos" src={staff.photo_url} alt={staff.full_name} />
                  <AvatarFallback>{staff.full_name.split(" ").map(n => n[0]).slice(0,2).join("")}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="truncate">{staff.full_name}</SheetTitle>
                  <SheetDescription className="font-mono text-xs">
                    {staff.staff_no} · {statusBadge(staff.status)}
                  </SheetDescription>
                </div>
              </div>
              {isAdmin && (
                <div className="pt-3">
                  <Button size="sm" onClick={() => onEdit(staff)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                </div>
              )}
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <Section title="Employment">
                <Row label="Position" value={staff.position} />
                <Row label="Department" value={staff.department ?? "—"} />
                <Row label="Type" value={staff.employment_type.replace("_", " ")} />
                <Row label="Date employed" value={staff.date_employed} />
                {staff.date_terminated && <Row label="Date ended" value={staff.date_terminated} />}
              </Section>
              <Section title="Personal">
                <Row label="Gender" value={staff.gender ?? "—"} />
                <Row label="Date of birth" value={staff.date_of_birth ?? "—"} />
                <Row label="Address" value={staff.address ?? "—"} />
                <Row label="Qualification" value={staff.qualification ?? "—"} />
                <Row label="NIN" value={staff.nin ?? "—"} />
              </Section>
              <Section title="Contact">
                <Row label="Phone" value={staff.phone ?? "—"} />
                <Row label="Email" value={staff.email ?? "—"} />
              </Section>
              {isAdmin && (
                <Section title="Payroll details">
                  <Row label="Basic salary" value={staff.salary != null ? `₦${staff.salary.toLocaleString()}` : "—"} />
                  <Row label="Bank" value={staff.bank_name ?? "—"} />
                  <Row label="Account #" value={staff.bank_account_number ?? staff.bank_account ?? "—"} />
                  <Row label="Account name" value={staff.bank_account_name ?? "—"} />
                  <Row label="Paystack" value={staff.paystack_recipient_code ? "Linked" : "Not linked"} />
                </Section>
              )}
              {staff.notes && (
                <Section title="Notes">
                  <p className="text-sm whitespace-pre-wrap">{staff.notes}</p>
                </Section>
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


// User select component for linking staff to user accounts
function UserSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; email: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (data) {
        setUsers(data);
      }
      setLoading(false);
    };
    fetchUsers();
  }, []);

  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Loading..." : "Select user account"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No user linked</SelectItem>
        {users.map(u => (
          <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email || "no email"})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaffFormDialog({ mode, staff, onClose }: { mode: "create" | "edit"; staff?: Staff; onClose: () => void }) {
  const qc = useQueryClient();
  const initial = {
    user_id: staff?.user_id ?? "",
    staff_no: staff?.staff_no ?? "",
    full_name: staff?.full_name ?? "",
    position: staff?.position ?? "",
    department: staff?.department ?? "",
    email: staff?.email ?? "",
    phone: staff?.phone ?? "",
    salary: staff?.salary?.toString() ?? "",
    date_employed: staff?.date_employed ?? new Date().toISOString().slice(0, 10),
    gender: staff?.gender ?? "",
    date_of_birth: staff?.date_of_birth ?? "",
    address: staff?.address ?? "",
    qualification: staff?.qualification ?? "",
    nin: staff?.nin ?? "",
    bank_name: staff?.bank_name ?? "",
    bank_code: staff?.bank_code ?? "",
    bank_account_number: staff?.bank_account_number ?? staff?.bank_account ?? "",
    bank_account_name: staff?.bank_account_name ?? "",
    employment_type: (staff?.employment_type ?? "full_time") as EmploymentType,
    status: (staff?.status ?? "active") as StaffStatus,
    notes: staff?.notes ?? "",
    state_of_origin: (staff as unknown as { state_of_origin?: string | null })?.state_of_origin ?? "",
    lga: (staff as unknown as { lga?: string | null })?.lga ?? "",
    level_scope: ((staff as unknown as { level_scope?: string | null })?.level_scope ?? "") as "" | "creche_nursery" | "primary" | "secondary",
    academic_session_id: (staff as unknown as { academic_session_id?: string | null })?.academic_session_id ?? "",
  };

  const [form, setForm] = useState(initial);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(staff?.photo_url ?? null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("Photo must be under 5MB."); return; }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.full_name || !form.staff_no || !form.position) {
        throw new Error("Name, staff number and position are required.");
      }
      let photo_url = staff?.photo_url ?? null;
      if (photoFile) photo_url = await uploadStaffPhoto(photoFile);

      const payload = {
        staff_no: form.staff_no,
        full_name: form.full_name,
        position: form.position,
        department: form.department || null,
        email: form.email || null,
        phone: form.phone || null,
        salary: form.salary ? Number(form.salary) : null,
        date_employed: form.date_employed,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        address: form.address || null,
        qualification: form.qualification || null,
        nin: form.nin || null,
        bank_name: form.bank_name || null,
        bank_code: form.bank_code || null,
        bank_account_number: form.bank_account_number || null,
        bank_account_name: form.bank_account_name || null,
        bank_account: form.bank_account_number || null,
        employment_type: form.employment_type,
        status: form.status,
        notes: form.notes || null,
        user_id: form.user_id || null,
        photo_url,
        is_active: form.status === "active",
        state_of_origin: form.state_of_origin || null,
        lga: form.lga || null,
        level_scope: form.level_scope || null,
        academic_session_id: form.academic_session_id || null,
      };

      if (mode === "edit" && staff) {
        const { error } = await supabase.from("staff").update(payload as never).eq("id", staff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff").insert(payload as never);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Staff updated." : "Staff onboarded.");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOpen = mode === "edit" ? !!staff : true;

  const content = (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{mode === "edit" ? "Edit staff" : "Onboard staff"}</DialogTitle>
        <DialogDescription>Profile, contact, employment and payroll details.</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-4 p-3 border rounded-md bg-muted/30">
        <Avatar className="h-20 w-20">
          <SignedAvatarImage bucket="staff-photos" src={photoPreview} />
          <AvatarFallback><User className="h-8 w-8 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <Label className="text-xs font-medium">Passport photo</Label>
          <p className="text-xs text-muted-foreground mb-2">JPG/PNG up to 5MB.</p>
          <label className="inline-flex">
            <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border bg-background hover:bg-accent cursor-pointer">
              <Upload className="h-3 w-3" /> {photoFile ? "Change photo" : "Upload photo"}
            </span>
          </label>
        </div>
      </div>

      <SectionTitle>Identity</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name" required><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
        <Field label="Staff number" required><Input value={form.staff_no} onChange={(e) => set("staff_no", e.target.value)} /></Field>
        <Field label="Academic session">
          <SessionSelect label="" value={form.academic_session_id} onChange={(v) => set("academic_session_id", v)} />
        </Field>
        <Field label="Gender">
          <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></Field>
        <Field label="NIN"><Input value={form.nin} onChange={(e) => set("nin", e.target.value)} /></Field>
        <Field label="Qualification"><Input value={form.qualification} onChange={(e) => set("qualification", e.target.value)} /></Field>
      </div>

      <SectionTitle>Contact</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <Field label="Address"><Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
        <div className="sm:col-span-2">
          <StateLgaSelect
            stateValue={form.state_of_origin}
            lgaValue={form.lga}
            onStateChange={(v) => set("state_of_origin", v)}
            onLgaChange={(v) => set("lga", v)}
          />
        </div>
      </div>

      <SectionTitle>Employment</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Position" required><Input value={form.position} onChange={(e) => set("position", e.target.value)} /></Field>
        <Field label="Department"><Input value={form.department} onChange={(e) => set("department", e.target.value)} /></Field>
        <Field label="Employment type">
          <Select value={form.employment_type} onValueChange={(v) => set("employment_type", v as EmploymentType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="full_time">Full time</SelectItem>
              <SelectItem value="part_time">Part time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="volunteer">Volunteer</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date employed"><Input type="date" value={form.date_employed} onChange={(e) => set("date_employed", e.target.value)} /></Field>
        <Field label="Status">
          <Select value={form.status} onValueChange={(v) => set("status", v as StaffStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_leave">On leave</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="terminated">Terminated</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Link User Account">
          <UserSelect value={form.user_id || ""} onChange={(v) => set("user_id", v)} />
        </Field>
        <Field label="School level scope">
          <Select value={form.level_scope || "__all__"} onValueChange={(v) => set("level_scope", (v === "__all__" ? "" : v) as typeof form.level_scope)}>
            <SelectTrigger><SelectValue placeholder="All levels (school-wide admin)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All levels (school-wide admin)</SelectItem>
              <SelectItem value="creche_nursery">Creche / Nursery only</SelectItem>
              <SelectItem value="primary">Primary only</SelectItem>
              <SelectItem value="secondary">Secondary only (JSS + SSS)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Choose "All levels" to grant school-wide access across Creche/Nursery, Primary, and Secondary.</p>
        </Field>

      </div>


      <SectionTitle>Payroll & Bank (Paystack)</SectionTitle>
      <p className="text-xs text-muted-foreground -mt-2">
        Bank details are used for Paystack salary transfers. Use the official Paystack bank code for NGN transfers (e.g. 058 GTBank, 044 Access, 057 Zenith, 011 First Bank, 033 UBA, 232 Sterling, 070 Fidelity, 221 Stanbic, 035 Wema, 215 Unity, 050 Ecobank, 032 Union, 076 Polaris, 100 Suntrust, 999992 Opay, 50515 Moniepoint, 999991 PalmPay, 090267 Kuda).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Basic salary (₦)"><Input type="number" value={form.salary} onChange={(e) => set("salary", e.target.value)} /></Field>
        <Field label="Bank name"><Input placeholder="e.g. GTBank" value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></Field>
        <Field label="Bank code (Paystack)"><Input placeholder="e.g. 058" value={form.bank_code} onChange={(e) => set("bank_code", e.target.value)} /></Field>
        <Field label="Account number"><Input inputMode="numeric" maxLength={10} placeholder="10-digit NUBAN" value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value.replace(/\D/g, ""))} /></Field>
        <div className="sm:col-span-2">
          <Field label="Account name"><Input placeholder="Name as registered with the bank" value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} /></Field>
        </div>
        {staff?.paystack_recipient_code && (
          <div className="sm:col-span-2 text-xs text-muted-foreground">
            Paystack recipient linked: <code className="font-mono">{staff.paystack_recipient_code}</code>
          </div>
        )}
      </div>


      <div className="mt-3">
        <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>

      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Onboard"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  if (mode === "edit") {
    return (
      <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
        {content}
      </Dialog>
    );
  }
  return content;
}

/* -------------------- Attendance -------------------- */

function AttendanceTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: staff } = useStaffList();
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});
  const [sessionId, setSessionId] = useState<string>("");

  const activeStaff = (staff ?? []).filter((s) => s.status === "active");

  const { data: existing } = useQuery({
    queryKey: ["staff-att", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_attendance")
        .select("staff_id, status")
        .eq("date", date);
      if (error) throw error;
      return (data ?? []) as { staff_id: string; status: AttStatus }[];
    },
  });

  const initial: Record<string, AttStatus> = {};
  (existing ?? []).forEach((r) => { initial[r.staff_id] = r.status; });
  const merged = { ...initial, ...marks };

  const save = useMutation({
    mutationFn: async () => {
      const rows = activeStaff.map((s) => ({
        staff_id: s.id,
        date,
        status: (merged[s.id] ?? "present") as AttStatus,
        ...(sessionId ? { academic_session_id: sessionId } : {}),
      }));
      const { error } = await supabase
        .from("staff_attendance")
        .upsert(rows, { onConflict: "staff_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance saved.");
      setMarks({});
      qc.invalidateQueries({ queryKey: ["staff-att"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <Card className="p-4 text-sm text-muted-foreground">Only admins can record staff attendance.</Card>;
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-48" /></Field>
        <SessionSelect value={sessionId} onChange={setSessionId} className="w-full sm:w-56" />
        <div className="flex-1" />
        <Button onClick={() => save.mutate()} disabled={save.isPending || activeStaff.length === 0}>
          {save.isPending ? "Saving…" : "Save attendance"}
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Position</TableHead>
              <TableHead className="w-48">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activeStaff.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No active staff.</TableCell></TableRow>
            ) : activeStaff.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell>{s.position}</TableCell>
                <TableCell>
                  <Select value={merged[s.id] ?? "present"} onValueChange={(v) => setMarks((p) => ({ ...p, [s.id]: v as AttStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="half_day">Half day</SelectItem>
                      <SelectItem value="leave">On leave</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* -------------------- Leave -------------------- */

function LeaveTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: staff } = useStaffList();
  const [openAdd, setOpenAdd] = useState(false);

  const { data: requests } = useQuery({
    queryKey: ["staff-leave"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, staff(full_name, staff_no)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string; staff_id: string; leave_type: LeaveType; start_date: string; end_date: string;
        reason: string | null; status: LeaveStatus; created_at: string;
        staff?: { full_name: string; staff_no: string } | null;
      }>;
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeaveStatus }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave updated.");
      qc.invalidateQueries({ queryKey: ["staff-leave"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Leave requests</h3>
        {isAdmin && (
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New request</Button></DialogTrigger>
            <NewLeaveDialog staff={staff ?? []} onClose={() => setOpenAdd(false)} />
          </Dialog>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!requests || requests.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground py-8">No leave requests.</TableCell></TableRow>
            ) : requests.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.staff?.full_name ?? "—"}</TableCell>
                <TableCell className="capitalize">{r.leave_type}</TableCell>
                <TableCell className="text-sm">{r.start_date} → {r.end_date}</TableCell>
                <TableCell>{leaveBadge(r.status)}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: "approved" })}>Approve</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => review.mutate({ id: r.id, status: "rejected" })}>Reject</Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function NewLeaveDialog({ staff, onClose }: { staff: Staff[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    staff_id: "", leave_type: "annual" as LeaveType, start_date: "", end_date: "", reason: "",
  });
  const [leaveSessionId, setLeaveSessionId] = useState<string>("");
  const submit = useMutation({
    mutationFn: async () => {
      if (!form.staff_id || !form.start_date || !form.end_date) throw new Error("All fields required.");
      const { error } = await supabase.from("leave_requests").insert({
        staff_id: form.staff_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason || null,
        status: "pending",
        ...(leaveSessionId ? { academic_session_id: leaveSessionId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Leave request submitted.");
      qc.invalidateQueries({ queryKey: ["staff-leave"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New leave request</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <SessionSelect value={leaveSessionId} onChange={setLeaveSessionId} />
        <Field label="Staff" required>
          <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v as LeaveType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["annual","sick","maternity","paternity","study","unpaid","other"] as LeaveType[]).map(t =>
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" required><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
          <Field label="End" required><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
        </div>
        <Field label="Reason"><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>{submit.isPending ? "Saving…" : "Submit"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* -------------------- Payroll -------------------- */

type PayrollRow = {
  id: string; staff_id: string; basic_salary: number; allowances: number;
  deductions: number; net_pay: number; status: PayStatus; paid_date: string | null;
  paystack_transfer_code: string | null; paystack_reference: string | null;
  staff?: { full_name: string; staff_no: string } | null;
};

const PAYROLL_TRANSITIONS: Record<PayStatus, PayStatus[]> = {
  draft: ["approved"],
  approved: ["paid", "draft"],
  paid: [],
};
function canTransition(from: PayStatus, to: PayStatus) {
  return PAYROLL_TRANSITIONS[from]?.includes(to) ?? false;
}

function monthLabel(year: number, month: number) {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

function exportPayrollCSV(rows: PayrollRow[], year: number, month: number) {
  if (!rows.length) { toast.error("Nothing to export."); return; }
  const headers = ["Staff #", "Name", "Basic", "Allowances", "Deductions", "Net pay", "Status", "Paid date"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells = [
      r.staff?.staff_no ?? "",
      r.staff?.full_name ?? "",
      r.basic_salary, r.allowances, r.deductions, r.net_pay,
      r.status, r.paid_date ?? "",
    ].map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-${year}-${String(month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPayrollPDF(rows: PayrollRow[], year: number, month: number) {
  if (!rows.length) { toast.error("Nothing to export."); return; }
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`Payroll — ${monthLabel(year, month)}`, 14, 16);
  autoTable(doc, {
    startY: 22,
    head: [["Staff #", "Name", "Basic (₦)", "Allow.", "Deduct.", "Net (₦)", "Status", "Paid"]],
    body: rows.map((r) => [
      r.staff?.staff_no ?? "—",
      r.staff?.full_name ?? "—",
      Number(r.basic_salary).toLocaleString(),
      Number(r.allowances).toLocaleString(),
      Number(r.deductions).toLocaleString(),
      Number(r.net_pay).toLocaleString(),
      r.status,
      r.paid_date ?? "—",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
  });
  const total = rows.reduce((s, r) => s + Number(r.net_pay), 0);
  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;
  doc.setFontSize(10);
  doc.text(`Total net pay: ₦${total.toLocaleString()}`, 14, finalY + 8);
  doc.save(`payroll-${year}-${String(month).padStart(2, "0")}.pdf`);
}

function PayrollTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: staff } = useStaffList();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const payrollSessionId = useCurrentSessionId();

  const { data: rows } = useQuery({
    queryKey: ["payroll", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll")
        .select("*, staff(full_name, staff_no)")
        .eq("period_year", year)
        .eq("period_month", month)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PayrollRow[];
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const active = (staff ?? []).filter((s) => s.status === "active" && s.salary);
      if (active.length === 0) throw new Error("No active staff with a salary set.");
      const payload = active.map((s) => ({
        staff_id: s.id,
        period_year: year,
        period_month: month,
        basic_salary: Number(s.salary),
        allowances: 0,
        deductions: 0,
        net_pay: Number(s.salary),
        status: "draft" as PayStatus,
        ...(payrollSessionId ? { academic_session_id: payrollSessionId } : {}),
      }));
      const { error } = await supabase.from("payroll").upsert(payload, { onConflict: "staff_id,period_year,period_month" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payroll generated.");
      qc.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ row, to }: { row: PayrollRow; to: PayStatus }) => {
      if (!canTransition(row.status, to)) {
        throw new Error(`Cannot move payroll from "${row.status}" to "${to}".`);
      }
      // Server-side trigger sets/clears paid_date; we never patch it manually.
      const { error } = await supabase.from("payroll").update({ status: to }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payroll updated.");
      qc.invalidateQueries({ queryKey: ["payroll"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (!isAdmin) {
    return <Card className="p-4 text-sm text-muted-foreground">Only admins can manage payroll.</Card>;
  }

  const list = rows ?? [];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
        <Field label="Year"><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" /></Field>
        <Field label="Month">
          <Select value={month.toString()} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={m.toString()}>
                  {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex-1" />
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportPayrollCSV(list, year, month)} disabled={!list.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPayrollPDF(list, year, month)} disabled={!list.length}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : "Generate payroll"}
          </Button>
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Basic</TableHead>
              <TableHead>Allowances</TableHead>
              <TableHead>Deductions</TableHead>
              <TableHead>Net pay</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid date</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No payroll for this period.</TableCell></TableRow>
            ) : list.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.staff?.full_name ?? "—"}</TableCell>
                <TableCell>₦{Number(r.basic_salary).toLocaleString()}</TableCell>
                <TableCell>₦{Number(r.allowances).toLocaleString()}</TableCell>
                <TableCell>₦{Number(r.deductions).toLocaleString()}</TableCell>
                <TableCell className="font-semibold">₦{Number(r.net_pay).toLocaleString()}</TableCell>
                <TableCell>{payBadge(r.status)}</TableCell>
                <TableCell className="text-xs">{r.paid_date ?? "—"}</TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  {canTransition(r.status, "approved") && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ row: r, to: "approved" })}>Approve</Button>
                  )}
                  {canTransition(r.status, "paid") && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ row: r, to: "paid" })}>Mark paid</Button>
                  )}
                  {canTransition(r.status, "draft") && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ row: r, to: "draft" })}>Revert</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* -------------------- Evaluations -------------------- */

type EvalRow = {
  id: string; staff_id: string; period: string;
  punctuality: number | null; performance: number | null;
  teamwork: number | null; conduct: number | null;
  overall_score: number | null; remarks: string | null;
  evaluator_id: string | null;
  review_status: "pending" | "approved";
  reviewed_by: string | null; reviewed_at: string | null;
  staff?: { full_name: string; staff_no: string; position: string } | null;
};

function exportEvalsCSV(rows: EvalRow[], periodLabel: string) {
  if (!rows.length) { toast.error("Nothing to export."); return; }
  const headers = ["Staff #", "Name", "Position", "Period", "Punctuality", "Performance", "Teamwork", "Conduct", "Overall", "Review", "Remarks"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells = [
      r.staff?.staff_no ?? "",
      r.staff?.full_name ?? "",
      r.staff?.position ?? "",
      r.period,
      r.punctuality ?? "", r.performance ?? "", r.teamwork ?? "", r.conduct ?? "",
      r.overall_score ?? "",
      r.review_status,
      r.remarks ?? "",
    ].map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
    lines.push(cells.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evaluations-${periodLabel.replace(/\s+/g, "_") || "all"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportEvalsPDF(rows: EvalRow[], periodLabel: string) {
  if (!rows.length) { toast.error("Nothing to export."); return; }
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`Performance Evaluations${periodLabel ? ` — ${periodLabel}` : ""}`, 14, 16);
  autoTable(doc, {
    startY: 22,
    head: [["Staff #", "Name", "Period", "Punct.", "Perf.", "Team.", "Cond.", "Overall", "Review"]],
    body: rows.map((r) => [
      r.staff?.staff_no ?? "—",
      r.staff?.full_name ?? "—",
      r.period,
      r.punctuality ?? "—", r.performance ?? "—", r.teamwork ?? "—", r.conduct ?? "—",
      r.overall_score ?? "—",
      r.review_status,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [40, 40, 40] },
  });
  doc.save(`evaluations-${periodLabel.replace(/\s+/g, "_") || "all"}.pdf`);
}

function EvaluationsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { user, isStaff } = useAuth();
  const { data: staff } = useStaffList();
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<EvalRow | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [confirmDelete, setConfirmDelete] = useState<EvalRow | null>(null);

  const { data: evals } = useQuery({
    queryKey: ["staff-evals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_evaluations")
        .select("*, staff(full_name, staff_no, position)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EvalRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("staff_evaluations", id); const error = null as any;
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Evaluation deleted."); qc.invalidateQueries({ queryKey: ["staff-evals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_evaluations")
        .update({
          review_status: "approved",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Evaluation approved."); qc.invalidateQueries({ queryKey: ["staff-evals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const canCreate = isAdmin || isStaff;
  const canEdit = (e: EvalRow) =>
    isAdmin || (isStaff && e.evaluator_id === user?.id && e.review_status === "pending");
  const canDelete = (e: EvalRow) => isAdmin;

  const periods = useMemo(
    () => Array.from(new Set((evals ?? []).map((e) => e.period))).sort(),
    [evals],
  );
  const filtered = (evals ?? []).filter((e) => periodFilter === "all" || e.period === periodFilter);
  const exportLabel = periodFilter === "all" ? "" : periodFilter;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold">Performance evaluations</h3>
          <p className="text-xs text-muted-foreground">Filter by period and export records.</p>
        </div>
        <div className="flex-1" />
        <Field label="Period">
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All periods</SelectItem>
              {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => exportEvalsCSV(filtered, exportLabel)} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportEvalsPDF(filtered, exportLabel)} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          {canCreate && (
            <Dialog open={openAdd} onOpenChange={setOpenAdd}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New evaluation</Button></DialogTrigger>
              <EvaluationDialog
                mode="create"
                staff={staff ?? []}
                onClose={() => setOpenAdd(false)}
                onSaved={() => qc.invalidateQueries({ queryKey: ["staff-evals"] })}
              />
            </Dialog>
          )}
        </div>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Punct.</TableHead>
              <TableHead>Perf.</TableHead>
              <TableHead>Team.</TableHead>
              <TableHead>Cond.</TableHead>
              <TableHead>Overall</TableHead>
              <TableHead>Review</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No evaluations.</TableCell></TableRow>
            ) : filtered.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.staff?.full_name ?? "—"}</TableCell>
                <TableCell>{e.period}</TableCell>
                <TableCell>{e.punctuality ?? "—"}</TableCell>
                <TableCell>{e.performance ?? "—"}</TableCell>
                <TableCell>{e.teamwork ?? "—"}</TableCell>
                <TableCell>{e.conduct ?? "—"}</TableCell>
                <TableCell className="font-semibold">{e.overall_score ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={e.review_status === "approved" ? "default" : "secondary"}>
                    {e.review_status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    {isAdmin && e.review_status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => approve.mutate(e.id)} title="Approve">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canEdit(e) && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete(e) && (
                      <Button
                        size="sm" variant="ghost" className="text-destructive"
                        onClick={() => setConfirmDelete(e)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EvaluationDialog
          mode="edit"
          row={editing}
          staff={staff ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["staff-evals"] })}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this evaluation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The evaluation record will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmDelete && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Staff:</span> <span className="font-medium">{confirmDelete.staff?.full_name ?? "—"}</span> {confirmDelete.staff?.staff_no ? <span className="text-muted-foreground">({confirmDelete.staff.staff_no})</span> : null}</div>
              <div><span className="text-muted-foreground">Period:</span> {confirmDelete.period}</div>
              <div className="grid grid-cols-4 gap-2 pt-1">
                <div><div className="text-xs text-muted-foreground">Punct.</div><div>{confirmDelete.punctuality ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Perf.</div><div>{confirmDelete.performance ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Team.</div><div>{confirmDelete.teamwork ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Cond.</div><div>{confirmDelete.conduct ?? "—"}</div></div>
              </div>
              <div className="pt-1"><span className="text-muted-foreground">Overall:</span> <span className="font-semibold">{confirmDelete.overall_score ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Review:</span> <Badge variant={confirmDelete.review_status === "approved" ? "default" : "secondary"}>{confirmDelete.review_status}</Badge></div>
              {confirmDelete.remarks && (
                <div className="pt-1"><span className="text-muted-foreground">Remarks:</span> <div className="whitespace-pre-wrap">{confirmDelete.remarks}</div></div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) remove.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function EvaluationDialog({
  mode, row, staff, onClose, onSaved,
}: {
  mode: "create" | "edit";
  row?: EvalRow;
  staff: Staff[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    staff_id: row?.staff_id ?? "",
    period: row?.period ?? "",
    punctuality: row?.punctuality ?? 5,
    performance: row?.performance ?? 5,
    teamwork: row?.teamwork ?? 5,
    conduct: row?.conduct ?? 5,
    remarks: row?.remarks ?? "",
  });
  const currentSessionId = useCurrentSessionId();
  const [evalSessionId, setEvalSessionId] = useState<string>(
    (row as unknown as { academic_session_id?: string | null })?.academic_session_id ?? "",
  );
  useEffect(() => {
    if (!evalSessionId && currentSessionId) setEvalSessionId(currentSessionId);
  }, [currentSessionId, evalSessionId]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.staff_id || !form.period.trim()) throw new Error("Staff and period are required.");
      const scores = [form.punctuality, form.performance, form.teamwork, form.conduct];
      if (scores.some((n) => n < 0 || n > 10 || Number.isNaN(n))) {
        throw new Error("Scores must be between 0 and 10.");
      }
      const overall = Number((scores.reduce((a, b) => a + b, 0) / 4).toFixed(2));
      const payload = {
        staff_id: form.staff_id,
        period: form.period.trim(),
        punctuality: form.punctuality,
        performance: form.performance,
        teamwork: form.teamwork,
        conduct: form.conduct,
        overall_score: overall,
        remarks: form.remarks.trim() || null,
        ...(evalSessionId ? { academic_session_id: evalSessionId } : {}),
      };
      if (mode === "edit" && row) {
        const { error } = await supabase.from("staff_evaluations").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff_evaluations").insert({
          ...payload,
          evaluator_id: user?.id ?? null,
          review_status: "pending",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "edit" ? "Evaluation updated." : "Evaluation submitted.");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dialog = (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{mode === "edit" ? "Edit evaluation" : "New evaluation"}</DialogTitle>
        <DialogDescription>Score each criterion from 0 to 10. Overall is the average.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <SessionSelect value={evalSessionId} onChange={setEvalSessionId} />
        <Field label="Staff" required>
          <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })} disabled={mode === "edit"}>
            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Period" required>
          <Input placeholder="e.g. Term 1 2026" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {(["punctuality","performance","teamwork","conduct"] as const).map((k) => (
            <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
              <Input
                type="number" min={0} max={10} value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: Math.max(0, Math.min(10, Number(e.target.value))) })}
              />
            </Field>
          ))}
        </div>
        <Field label="Remarks"><Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} maxLength={1000} /></Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Submit"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );

  if (mode === "edit") {
    return <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>{dialog}</Dialog>;
  }
  return dialog;
}
