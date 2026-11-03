import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Receipt, Wallet, FileText, TrendingUp, Plus, Loader2, DollarSign, Trash2, Printer, Users, BarChart3, CreditCard, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { initializeFeePayment } from "@/lib/paystack.functions";
import { softDelete } from "@/lib/soft-delete";
import { SessionSelect, useCurrentSessionId } from "@/components/SessionSelect";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinancePage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n || 0);

function FinancePage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Finance</h1>
        <p className="text-sm text-muted-foreground">Fee structures, invoicing, payments, expenses, and reports.</p>
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><TrendingUp className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="structures"><FileText className="h-4 w-4 mr-1.5" />Fees/Fine/Bill Structures</TabsTrigger>
          <TabsTrigger value="invoices"><Receipt className="h-4 w-4 mr-1.5" />Invoices</TabsTrigger>
          <TabsTrigger value="expenses"><Wallet className="h-4 w-4 mr-1.5" />Expenses</TabsTrigger>
          <TabsTrigger value="reports"><BarChart3 className="h-4 w-4 mr-1.5" />Reports</TabsTrigger>
          <TabsTrigger value="payments"><CreditCard className="h-4 w-4 mr-1.5" />Online Pay</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4"><Overview /></TabsContent>
        <TabsContent value="structures" className="mt-4"><FeeStructures /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><Invoices /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><Expenses /></TabsContent>
        <TabsContent value="reports" className="mt-4"><Reports /></TabsContent>
        <TabsContent value="payments" className="mt-4"><OnlinePayments /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------- Overview / Reports ------------------------- */

function Overview() {
  const { data: fees } = useQuery({
    queryKey: ["finance", "fees-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fees").select("amount, amount_paid, status");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: expenses } = useQuery({
    queryKey: ["finance", "expenses-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("amount, category, expense_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const billed = (fees ?? []).reduce((s, f) => s + Number(f.amount || 0), 0);
    const collected = (fees ?? []).reduce((s, f) => s + Number(f.amount_paid || 0), 0);
    const outstanding = billed - collected;
    const exp = (expenses ?? []).reduce((s, e) => s + Number(e.amount || 0), 0);
    const net = collected - exp;
    return { billed, collected, outstanding, exp, net };
  }, [fees, expenses]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    (expenses ?? []).forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount || 0)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Billed" value={fmt(totals.billed)} />
        <Stat label="Collected" value={fmt(totals.collected)} tone="positive" />
        <Stat label="Outstanding" value={fmt(totals.outstanding)} tone="warn" />
        <Stat label="Expenses" value={fmt(totals.exp)} tone="negative" />
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Net Position (Collected − Expenses)</p>
            <p className={`text-3xl font-semibold ${totals.net < 0 ? "text-destructive" : ""}`}>{fmt(totals.net)}</p>
          </div>
          <DollarSign className="h-10 w-10 text-muted-foreground" />
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-medium mb-3">Expenses by Category</h3>
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses recorded.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {byCategory.map(([cat, amt]) => (
                <TableRow key={cat}><TableCell>{cat}</TableCell><TableCell className="text-right">{fmt(amt)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warn" }) {
  const colour = tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "";
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${colour}`}>{value}</p>
    </Card>
  );
}

/* ------------------------- Fees/Fine/Bill Structures ------------------------- */

interface StructureRow {
  id: string; name: string; level: string | null; class_id: string | null;
  term_id: string | null; amount: number; is_active: boolean;
}
interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; session_id: string }

interface IssueStudent { id: string; full_name: string; admission_no: string }

function FeeStructures() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { name: "", amount: "", class_id: "none", term_id: "none", level: "none" };
  const [form, setForm] = useState(emptyForm);
  const [issueFor, setIssueFor] = useState<StructureRow | null>(null);
  const [issueForm, setIssueForm] = useState<{ class_id: string; term_id: string; student_ids: string[] }>({
    class_id: "", term_id: "", student_ids: [],
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance", "fee_structures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_structures").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StructureRow[];
    },
  });
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(rows ?? [], page, setPage);
  const { data: classes } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name").order("name");
      return (data ?? []) as ClassRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["terms-list"],
    queryFn: async () => {
      const { data } = await supabase.from("terms").select("id, name, session_id").order("start_date", { ascending: false });
      return (data ?? []) as TermRow[];
    },
  });
  const structureSessionId = useCurrentSessionId();
  const { data: issueStudents } = useQuery({
    queryKey: ["students-in-class", issueForm.class_id],
    enabled: !!issueForm.class_id,
    queryFn: async () => {
      const { data } = await supabase.from("students")
        .select("id, full_name, admission_no")
        .eq("class_id", issueForm.class_id)
        .eq("is_active", true)
        .order("full_name");
      return (data ?? []) as IssueStudent[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      const amt = Number(form.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be > 0");
      const payload = {
        name: form.name.trim(),
        amount: amt,
        class_id: form.class_id === "none" ? null : form.class_id,
        term_id: form.term_id === "none" ? null : form.term_id,
        level: form.level === "none" ? null : (form.level as "nursery" | "primary" | "jss" | "sss"),
        session_id: structureSessionId || null,
      };
      if (editingId) {
        const { error } = await supabase.from("fee_structures").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fee_structures").insert({ ...payload, is_active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Fee structure updated" : "Fee structure created");
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["finance", "fee_structures"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("fee_structures").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance", "fee_structures"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("fee_structures", id);
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["finance", "fee_structures"] });
    },
  });

  const issue = useMutation({
    mutationFn: async () => {
      if (!issueFor) throw new Error("No structure");
      if (!issueForm.term_id) throw new Error("Term is required");
      let studentIds = issueForm.student_ids;
      if (studentIds.length === 0) {
        if (!issueForm.class_id) throw new Error("Pick a class or select students");
        const { data, error } = await supabase
          .from("students").select("id").eq("class_id", issueForm.class_id).eq("is_active", true);
        if (error) throw error;
        studentIds = (data ?? []).map((s) => s.id);
      }
      if (studentIds.length === 0) throw new Error("No matching students");
      const termSession = (terms ?? []).find((t) => t.id === issueForm.term_id)?.session_id;
      if (!termSession) throw new Error("Could not determine academic session for the selected term.");
      const newRows = studentIds.map((sid) => ({
        student_id: sid, term_id: issueForm.term_id, description: issueFor.name,
        amount: Number(issueFor.amount), status: "unpaid" as const,
        academic_session_id: termSession,
      }));
      const { error } = await supabase.from("fees").insert(newRows);
      if (error) throw error;
      return newRows.length;
    },
    onSuccess: (n) => {
      toast.success(`Issued ${n} invoice(s)`);
      setIssueFor(null);
      setIssueForm({ class_id: "", term_id: "", student_ids: [] });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (r: StructureRow) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      amount: String(r.amount),
      class_id: r.class_id ?? "none",
      term_id: r.term_id ?? "none",
      level: (r as StructureRow & { level?: string | null }).level ?? "none",
    });
    setOpen(true);
  };
  const openIssue = (r: StructureRow) => {
    setIssueFor(r);
    setIssueForm({ class_id: r.class_id ?? "", term_id: r.term_id ?? "", student_ids: [] });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Fees/Fine/Bill Structures</h3>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogTrigger asChild><Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Edit Fees/Fine/Bill Structure" : "New Fees/Fine/Bill Structure"}</DialogTitle><DialogDescription>Template used to issue invoices.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tuition – Term 1" /></div>
              <div><Label className="text-xs">Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Class</Label>
                  <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">All classes</SelectItem>
                      {(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Term</Label>
                  <Select value={form.term_id} onValueChange={(v) => setForm({ ...form, term_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any term</SelectItem>
                      {(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>{upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{editingId ? "Save" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No fee structures yet.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Class</TableHead><TableHead>Term</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {pageItems.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell>{classes?.find((c) => c.id === r.class_id)?.name ?? "—"}</TableCell>
                <TableCell>{terms?.find((t) => t.id === r.term_id)?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(Number(r.amount))}</TableCell>
                <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })} /></TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => openIssue(r)} title="Issue invoices to students">
                    <Users className="h-4 w-4 mr-1" />Issue
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <PaginationBar page={safePage} totalPages={totalPages} totalItems={(rows ?? []).length} start={start} end={end} onPageChange={setPage} />

      <Dialog open={!!issueFor} onOpenChange={(v) => { if (!v) { setIssueFor(null); setIssueForm({ class_id: "", term_id: "", student_ids: [] }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Invoices</DialogTitle>
            <DialogDescription>
              {issueFor && <>Issue <strong>{issueFor.name}</strong> ({fmt(Number(issueFor.amount))}) to a class, or pick specific students.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Class</Label>
                <Select value={issueForm.class_id} onValueChange={(v) => setIssueForm({ ...issueForm, class_id: v, student_ids: [] })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{(classes ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Term</Label>
                <Select value={issueForm.term_id} onValueChange={(v) => setIssueForm({ ...issueForm, term_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                  <SelectContent>{(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {issueForm.class_id && (
              <div>
                <Label className="text-xs">Students (optional — leave empty to issue to the whole class)</Label>
                <div className="border rounded-md max-h-56 overflow-auto p-2 space-y-1">
                  {(issueStudents ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No active students in this class.</p>
                  ) : (issueStudents ?? []).map((s) => {
                    const checked = issueForm.student_ids.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setIssueForm((prev) => ({
                              ...prev,
                              student_ids: e.target.checked
                                ? [...prev.student_ids, s.id]
                                : prev.student_ids.filter((id) => id !== s.id),
                            }));
                          }}
                        />
                        {s.full_name} <span className="text-muted-foreground">({s.admission_no})</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {issueForm.student_ids.length > 0
                    ? `${issueForm.student_ids.length} selected`
                    : `Will issue to all ${(issueStudents ?? []).length} students in class`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => issue.mutate()} disabled={issue.isPending || !issueForm.term_id || (!issueForm.class_id && issueForm.student_ids.length === 0)}>
              {issue.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------- Invoices (Fees) ------------------------- */

interface FeeRow {
  id: string; student_id: string; term_id: string; description: string;
  amount: number; amount_paid: number; status: string;
  due_date: string | null; paid_date: string | null; reference: string | null;
  payment_method: string | null;
}
interface StudentRow { id: string; full_name: string; admission_no: string }

function Invoices() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<FeeRow | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<FeeRow | null>(null);
  const emptyInvoice = { student_id: "", term_id: "", description: "", amount: "", due_date: "" };
  const [form, setForm] = useState(emptyInvoice);
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "" });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance", "fees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fees").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as FeeRow[];
    },
  });
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(rows ?? [], page, setPage);
  const { data: students } = useQuery({
    queryKey: ["students-list"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, full_name, admission_no").eq("is_active", true).order("full_name");
      return (data ?? []) as StudentRow[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["terms-list"],
    queryFn: async () => {
      const { data } = await supabase.from("terms").select("id, name, session_id").order("start_date", { ascending: false });
      return (data ?? []) as TermRow[];
    },
  });

  const upsertInvoice = useMutation({
    mutationFn: async () => {
      if (!form.student_id || !form.term_id) throw new Error("Student & term required");
      const amt = Number(form.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be > 0");
      const termSession = (terms ?? []).find((t) => t.id === form.term_id)?.session_id;
      if (!termSession) throw new Error("Could not determine academic session for the selected term.");
      const payload = {
        student_id: form.student_id, term_id: form.term_id,
        description: form.description || "Tuition", amount: amt,
        due_date: form.due_date || null, academic_session_id: termSession,
      };
      if (editingId) {
        const { error } = await supabase.from("fees").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fees").insert({ ...payload, status: "unpaid" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Invoice updated" : "Invoice created");
      setOpen(false);
      setEditingId(null);
      setForm(emptyInvoice);
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeInvoice = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("fees", id);
    },
    onSuccess: () => {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!payOpen) return;
      const amt = Number(pay.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be > 0");
      const newPaid = Number(payOpen.amount_paid || 0) + amt;
      const status = newPaid >= Number(payOpen.amount) ? "paid" : "partial";
      const { error } = await supabase.from("fees").update({
        amount_paid: newPaid,
        status,
        payment_method: pay.method,
        reference: pay.reference || payOpen.reference,
        paid_date: status === "paid" ? new Date().toISOString().slice(0, 10) : payOpen.paid_date,
      }).eq("id", payOpen.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayOpen(null);
      setPay({ amount: "", method: "cash", reference: "" });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const initFeePayment = useServerFn(initializeFeePayment);
  const payWithPaystack = useMutation({
    mutationFn: async (feeId: string) => {
      return initFeePayment({
        data: { feeId, callbackUrl: window.location.href },
      });
    },
    onSuccess: (res) => {
      window.location.href = res.authorizationUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const studentName = (id: string) => {
    const s = students?.find((x) => x.id === id);
    return s ? `${s.full_name} (${s.admission_no})` : "—";
  };
  const termName = (id: string) => terms?.find((t) => t.id === id)?.name ?? "—";
  const statusBadge = (s: string) => {
    const v: Record<string, string> = { paid: "default", partial: "secondary", unpaid: "destructive", waived: "outline" };
    return <Badge variant={(v[s] ?? "secondary") as "default" | "secondary" | "destructive" | "outline"}>{s}</Badge>;
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Invoices</h3>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(emptyInvoice); } }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyInvoice); }}>
              <Plus className="h-4 w-4 mr-1.5" />New Invoice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? "Edit Invoice" : "New Invoice"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Student</Label>
                <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>{(students ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.admission_no})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Term</Label>
                <Select value={form.term_id} onValueChange={(v) => setForm({ ...form, term_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
                  <SelectContent>{(terms ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Tuition" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label className="text-xs">Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => upsertInvoice.mutate()} disabled={upsertInvoice.isPending}>{upsertInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}{editingId ? "Save" : "Create"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Term</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {pageItems.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{studentName(r.student_id)}</TableCell>
                  <TableCell>{termName(r.term_id)}</TableCell>
                  <TableCell>{r.description}</TableCell>
                  <TableCell className="text-right">{fmt(Number(r.amount))}</TableCell>
                  <TableCell className="text-right">{fmt(Number(r.amount_paid))}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="flex gap-1">
                    {r.status !== "paid" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setPayOpen(r)}>Pay</Button>
                        <Button
                          size="sm"
                          onClick={() => payWithPaystack.mutate(r.id)}
                          disabled={payWithPaystack.isPending}
                          title="Pay online with Paystack"
                        >
                          {payWithPaystack.isPending && payWithPaystack.variables === r.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <><CreditCard className="h-4 w-4 mr-1" />Paystack</>}
                        </Button>
                      </>
                    )}
                    {Number(r.amount_paid) > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setReceiptOpen(r)} title="Print receipt">
                        <Printer className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Edit invoice"
                      onClick={() => {
                        setEditingId(r.id);
                        setForm({
                          student_id: r.student_id,
                          term_id: r.term_id,
                          description: r.description ?? "",
                          amount: String(r.amount),
                          due_date: r.due_date ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Delete invoice"
                      onClick={() => {
                        if (confirm("Delete this invoice? This cannot be undone.")) {
                          removeInvoice.mutate(r.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationBar page={safePage} totalPages={totalPages} totalItems={(rows ?? []).length} start={start} end={end} onPageChange={setPage} />

      <Dialog open={!!payOpen} onOpenChange={(v) => !v && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {payOpen && <>Outstanding: {fmt(Number(payOpen.amount) - Number(payOpen.amount_paid))}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label className="text-xs">Amount</Label><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Reference</Label><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Receipt / txn id" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
              {recordPayment.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptModal
        fee={receiptOpen}
        studentLabel={receiptOpen ? studentName(receiptOpen.student_id) : ""}
        termLabel={receiptOpen ? termName(receiptOpen.term_id) : ""}
        onClose={() => setReceiptOpen(null)}
      />
    </Card>
  );
}

/* ------------------------- Expenses ------------------------- */

interface ExpenseRow {
  id: string; category: string; vendor: string | null; amount: number;
  expense_date: string; description: string | null; payment_method: string | null;
}

function Expenses() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "", vendor: "", amount: "",
    expense_date: new Date().toISOString().slice(0, 10),
    description: "", payment_method: "cash",
  });
  const expenseSessionId = useCurrentSessionId();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance", "expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as ExpenseRow[];
    },
  });
  const [page, setPage] = useState(1);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(rows ?? [], page, setPage);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.category.trim()) throw new Error("Category required");
      const amt = Number(form.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be > 0");
      const { error } = await supabase.from("expenses").insert({
        category: form.category.trim(),
        vendor: form.vendor || null,
        amount: amt,
        expense_date: form.expense_date,
        description: form.description || null,
        payment_method: form.payment_method,
        ...(expenseSessionId ? { academic_session_id: expenseSessionId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense recorded");
      setOpen(false);
      setForm({ category: "", vendor: "", amount: "", expense_date: new Date().toISOString().slice(0, 10), description: "", payment_method: "cash" });
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("expenses", id);
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Expenses</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New Expense</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label className="text-xs">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Utilities, Salaries, Supplies…" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
                <div><Label className="text-xs">Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses yet.</p>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Vendor</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {pageItems.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.expense_date}</TableCell>
                <TableCell>{r.category}</TableCell>
                <TableCell>{r.vendor ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(Number(r.amount))}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <PaginationBar page={safePage} totalPages={totalPages} totalItems={(rows ?? []).length} start={start} end={end} onPageChange={setPage} />
    </Card>
  );
}

/* ------------------------- Receipt Modal ------------------------- */

function ReceiptModal({
  fee, studentLabel, termLabel, onClose,
}: { fee: FeeRow | null; studentLabel: string; termLabel: string; onClose: () => void }) {
  if (!fee) return null;
  const date = fee.paid_date ?? new Date().toISOString().slice(0, 10);
  const balance = Number(fee.amount) - Number(fee.amount_paid);
  return (
    <Dialog open={!!fee} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md print:shadow-none print:border-0">
        <DialogHeader className="print:hidden">
          <DialogTitle>Payment Receipt</DialogTitle>
          <DialogDescription>Preview the receipt and print it from your browser.</DialogDescription>
        </DialogHeader>
        <div id="receipt-printable" className="space-y-4 text-sm">
          <div className="text-center border-b pb-3">
            <h2 className="text-lg font-semibold">Payment Receipt</h2>
            <p className="text-xs text-muted-foreground">#{fee.id.slice(0, 8).toUpperCase()} · {date}</p>
          </div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2">
            <dt className="text-muted-foreground">Student</dt><dd>{studentLabel}</dd>
            <dt className="text-muted-foreground">Term</dt><dd>{termLabel}</dd>
            <dt className="text-muted-foreground">Description</dt><dd>{fee.description}</dd>
            <dt className="text-muted-foreground">Method</dt><dd>{fee.payment_method ?? "—"}</dd>
            <dt className="text-muted-foreground">Reference</dt><dd>{fee.reference ?? "—"}</dd>
            <dt className="text-muted-foreground">Invoice Total</dt><dd className="tabular-nums">{fmt(Number(fee.amount))}</dd>
            <dt className="font-semibold">Amount Paid</dt><dd className="tabular-nums font-semibold">{fmt(Number(fee.amount_paid))}</dd>
            <dt className="text-muted-foreground">Balance</dt><dd className="tabular-nums">{fmt(balance)}</dd>
            <dt className="text-muted-foreground">Status</dt><dd className="uppercase">{fee.status}</dd>
          </dl>
          <p className="text-center text-xs text-muted-foreground pt-3 border-t">Thank you for your payment.</p>
        </div>
        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- Reports ------------------------- */

function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(); start.setMonth(start.getMonth() - 5); start.setDate(1);
  const [from, setFrom] = useState(start.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);

  const { data: fees } = useQuery({
    queryKey: ["finance", "report-fees", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fees").select("amount, amount_paid, status, paid_date, payment_method, student_id, description")
        .gte("created_at", from).lte("created_at", to + "T23:59:59");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: expenses } = useQuery({
    queryKey: ["finance", "report-exp", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses").select("amount, expense_date, category")
        .gte("expense_date", from).lte("expense_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: students } = useQuery({
    queryKey: ["students-list"],
    queryFn: async () => {
      const { data } = await supabase.from("students").select("id, full_name, admission_no");
      return (data ?? []) as StudentRow[];
    },
  });

  const monthly = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    (fees ?? []).forEach((f) => {
      if (!f.paid_date) return;
      const k = f.paid_date.slice(0, 7);
      const cur = m.get(k) ?? { income: 0, expense: 0 };
      cur.income += Number(f.amount_paid || 0);
      m.set(k, cur);
    });
    (expenses ?? []).forEach((e) => {
      const k = e.expense_date.slice(0, 7);
      const cur = m.get(k) ?? { income: 0, expense: 0 };
      cur.expense += Number(e.amount || 0);
      m.set(k, cur);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [fees, expenses]);

  const max = Math.max(1, ...monthly.flatMap(([, v]) => [v.income, v.expense]));

  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    (fees ?? []).forEach((f) => {
      if (!f.payment_method || !Number(f.amount_paid)) return;
      m.set(f.payment_method, (m.get(f.payment_method) ?? 0) + Number(f.amount_paid));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [fees]);

  const debtors = useMemo(() => {
    const m = new Map<string, { balance: number; invoices: number; billed: number; paid: number }>();
    (fees ?? []).forEach((f) => {
      const bal = Number(f.amount) - Number(f.amount_paid);
      if (bal <= 0) return;
      const cur = m.get(f.student_id) ?? { balance: 0, invoices: 0, billed: 0, paid: 0 };
      cur.balance += bal;
      cur.invoices += 1;
      cur.billed += Number(f.amount);
      cur.paid += Number(f.amount_paid || 0);
      m.set(f.student_id, cur);
    });
    return [...m.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.balance - a.balance);
  }, [fees]);

  const debtorTotals = useMemo(
    () => debtors.reduce(
      (s, d) => ({
        balance: s.balance + d.balance,
        billed: s.billed + d.billed,
        paid: s.paid + d.paid,
        invoices: s.invoices + d.invoices,
      }),
      { balance: 0, billed: 0, paid: 0, invoices: 0 },
    ),
    [debtors],
  );

  const exportDebtorsCsv = () => {
    const rows = [
      ["Student", "Admission No", "Outstanding Invoices", "Total Billed", "Total Paid", "Balance"],
      ...debtors.map((d) => {
        const s = students?.find((x) => x.id === d.id);
        return [
          s?.full_name ?? d.id,
          s?.admission_no ?? "",
          String(d.invoices),
          d.billed.toFixed(2),
          d.paid.toFixed(2),
          d.balance.toFixed(2),
        ];
      }),
      ["TOTAL", "", String(debtorTotals.invoices), debtorTotals.billed.toFixed(2), debtorTotals.paid.toFixed(2), debtorTotals.balance.toFixed(2)],
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top-debtors_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    const inc = (fees ?? []).reduce((s, f) => s + Number(f.amount_paid || 0), 0);
    const exp = (expenses ?? []).reduce((s, e) => s + Number(e.amount || 0), 0);
    return { inc, exp, net: inc - exp };
  }, [fees, expenses]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Income (collected)" value={fmt(totals.inc)} tone="positive" />
        <Stat label="Expenses" value={fmt(totals.exp)} tone="negative" />
        <Stat label="Net" value={fmt(totals.net)} tone={totals.net >= 0 ? "positive" : "negative"} />
      </div>
      <Card className="p-4">
        <h3 className="font-medium mb-3">Monthly Cash Flow</h3>
        {monthly.length === 0 ? <p className="text-sm text-muted-foreground">No data for this period.</p> : (
          <div className="space-y-2">
            {monthly.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[80px_1fr] gap-3 items-center text-sm">
                <span className="text-muted-foreground">{k}</span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded bg-emerald-500" style={{ width: `${(v.income / max) * 100}%` }} />
                    <span className="text-xs tabular-nums">{fmt(v.income)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded bg-destructive" style={{ width: `${(v.expense / max) * 100}%` }} />
                    <span className="text-xs tabular-nums">{fmt(v.expense)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-medium mb-3">Payment Methods</h3>
          {byMethod.length === 0 ? <p className="text-sm text-muted-foreground">No payments.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>{byMethod.map(([k, v]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell className="text-right">{fmt(v)}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Top Debtors</h3>
            <Button size="sm" variant="outline" onClick={exportDebtorsCsv} disabled={debtors.length === 0}>
              Export CSV
            </Button>
          </div>
          {debtors.length === 0 ? <p className="text-sm text-muted-foreground">No outstanding fees.</p> : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtors.slice(0, 25).map((d) => {
                    const s = students?.find((x) => x.id === d.id);
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap">{s ? `${s.full_name} (${s.admission_no})` : d.id.slice(0, 8)}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.invoices}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.billed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(d.paid)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(d.balance)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Total ({debtors.length} students)</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{debtorTotals.invoices}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(debtorTotals.billed)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(debtorTotals.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(debtorTotals.balance)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------- Online Payments ------------------------- */

function OnlinePayments() {
  return (
    <Card className="p-6 space-y-3 max-w-2xl">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h3 className="font-medium">Online Payments — Paystack</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Fee payments are powered by <strong>Paystack</strong> (card, bank transfer, USSD, Opay, mobile money).
        On any unpaid invoice in the Invoices tab, click the <strong>Paystack</strong> button to redirect
        the payer to a secure Paystack checkout. Receipts are recorded automatically via webhook.
      </p>
      <div className="rounded-md border p-3 bg-muted/40 text-xs space-y-2">
        <div className="font-medium">Setup checklist (admin)</div>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li>Paystack secret key must be configured in the project secrets.</li>
          <li>
            In Paystack Dashboard → Settings → API Keys &amp; Webhooks, set the webhook URL to:
            <code className="block mt-1 bg-background p-1 rounded text-foreground break-all">
              https://schools.zgils.com/api/public/paystack-webhook
            </code>
          </li>
          <li>Default currency is NGN. Contact <a className="underline" href="mailto:sales@zgils.com">sales@zgils.com</a> for help.</li>
        </ol>
      </div>
      <p className="text-sm text-muted-foreground">
        Salary payouts to staff also run via Paystack Transfers — see Staff → Payroll. Each staff member must
        have a bank account and bank code on their profile before transfers can be initiated.
      </p>
      <a
        href="https://dashboard.paystack.com/#/settings/developer"
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center text-sm text-primary hover:underline"
      >
        Open Paystack dashboard <ExternalLink className="h-3 w-3 ml-1" />
      </a>
    </Card>
  );
}
