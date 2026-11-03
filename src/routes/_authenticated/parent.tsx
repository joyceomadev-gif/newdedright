import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { initializeFeePayment } from "@/lib/paystack.functions";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  Users, TrendingUp, Wallet, FileText, MessageSquare, Loader2, Download,
  CreditCard, Send, Mail, Bell, Award, Printer,
} from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  RATING_COLUMNS,
  useStudentTraitGroups,
  type TraitGroup,
} from "@/lib/traits";
import { useResultsPublished, ResultsNotPublishedNotice } from "@/lib/result-publication";
import { useResolvedGradingScale, gradeForDynamicScale } from "@/lib/assessment-config";

function PublishGate({ classId, termId, children }: { classId: string | null; termId?: string; children: React.ReactNode }) {
  const { data: term, isLoading: termLoading } = useQuery({
    queryKey: ["pgate-term", termId],
    queryFn: async () => {
      if (termId) {
        const { data } = await supabase.from("terms").select("id,session_id,is_current").eq("id", termId).maybeSingle();
        if (data) return data as { id: string; session_id: string };
      }
      const { data: currentTerm } = await supabase.from("terms").select("id,session_id,is_current").eq("is_current", true).maybeSingle();
      if (currentTerm) return currentTerm as { id: string; session_id: string };

      const { data: fallbackTerm } = await supabase.from("terms").select("id,session_id,is_current").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return fallbackTerm as { id: string; session_id: string } | null;
    },
  });
  const { data: published, isLoading: pubLoading } = useResultsPublished({
    session_id: term?.session_id, term_id: term?.id ?? termId, class_id: classId, exam_type: "combined",
  });
  const isLoading = termLoading || pubLoading || (!term && !termLoading && !!classId);
  if (!classId) return <ResultsNotPublishedNotice />;
  if (isLoading) return <Card className="p-6 text-sm text-muted-foreground">Checking publication status…</Card>;
  if (!published) return <ResultsNotPublishedNotice />;
  return <>{children}</>;
}

export const Route = createFileRoute("/_authenticated/parent")({
  component: ParentPortal,
});

type Child = {
  id: string;
  full_name: string;
  admission_no: string;
  photo_url: string | null;
  class_id: string | null;
  classes?: { name: string | null } | null;
};

type Term = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  session: { id: string; name: string } | null;
};

function ParentPortal() {
  const { user } = useAuth();
  const [childId, setChildId] = useState<string | null>(null);

  const { data: parent } = useQuery({
    queryKey: ["parent", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("id, full_name, email, phone")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: children, isLoading: childrenLoading } = useQuery({
    queryKey: ["parent", "children", parent?.id],
    enabled: !!parent?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_no, photo_url, class_id, classes:class_id(name)")
        .eq("parent_id", parent!.id)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as Child[];
    },
  });

  const activeChild = useMemo(
    () => children?.find((c) => c.id === childId) ?? children?.[0] ?? null,
    [children, childId],
  );

  if (!parent) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Parent Portal</h1>
        <Card className="p-6 text-sm text-muted-foreground">
          No parent profile is linked to your account yet. Please contact the school admin.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Parent Portal</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {parent.full_name}. Track your child's progress, fees, and reports.
          </p>
        </div>
      </div>

      <ChildSelector
        items={children ?? []}
        loading={childrenLoading}
        activeId={activeChild?.id ?? null}
        onChange={setChildId}
      />

      {activeChild ? (
        <Tabs defaultValue="progress">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="progress"><TrendingUp className="h-4 w-4 mr-1.5" />Progress</TabsTrigger>
            <TabsTrigger value="results"><Award className="h-4 w-4 mr-1.5" />Results</TabsTrigger>
            <TabsTrigger value="fees"><Wallet className="h-4 w-4 mr-1.5" />Fees</TabsTrigger>
            <TabsTrigger value="reports"><FileText className="h-4 w-4 mr-1.5" />Report Cards</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="h-4 w-4 mr-1.5" />Messages</TabsTrigger>
            <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1.5" />Notifications</TabsTrigger>
          </TabsList>
          <TabsContent value="progress" className="mt-4"><ProgressTab child={activeChild} /></TabsContent>
          <TabsContent value="results" className="mt-4"><PublishGate classId={activeChild.class_id}><ResultsTab child={activeChild} /></PublishGate></TabsContent>
          <TabsContent value="fees" className="mt-4"><FeesTab child={activeChild} /></TabsContent>
          <TabsContent value="reports" className="mt-4"><PublishGate classId={activeChild.class_id}><ReportsTab child={activeChild} /></PublishGate></TabsContent>
          <TabsContent value="messages" className="mt-4"><MessagesTab child={activeChild} /></TabsContent>
          <TabsContent value="notifications" className="mt-4"><NotificationPrefsTab /></TabsContent>
        </Tabs>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          {childrenLoading ? "Loading children…" : "No children linked to your account yet."}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ Child selector ----------------------------- */

function ChildSelector({
  items, loading, activeId, onChange,
}: {
  items: Child[];
  loading: boolean;
  activeId: string | null;
  onChange: (id: string) => void;
}) {
  if (loading) {
    return <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading children…</Card>;
  }
  if (items.length === 0) return null;

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-medium px-1">
          <Users className="h-4 w-4" /> Child:
        </div>
        <div className="flex gap-2 flex-wrap flex-1">
          {items.map((c) => {
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => onChange(c.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                }`}
              >
                {c.photo_url ? (
                  <img src={c.photo_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">
                    {c.full_name.slice(0, 1)}
                  </div>
                )}
                <span>{c.full_name}</span>
                <span className={`text-xs ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {c.classes?.name ?? "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ Terms hook -------------------------------- */

function useTerms() {
  return useQuery({
    queryKey: ["parent", "terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id, name, start_date, end_date, is_current, session:session_id(id, name)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Term[];
    },
  });
}

/* -------------------------------- Progress -------------------------------- */

function ProgressTab({ child }: { child: Child }) {
  const { data: terms } = useTerms();
  const [termId, setTermId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Apply term defaults to date range when term changes
  const activeTerm = terms?.find((t) => t.id === termId) ?? null;
  const effFrom = fromDate || activeTerm?.start_date || null;
  const effTo = toDate || activeTerm?.end_date || null;

  const { data: attendance } = useQuery({
    queryKey: ["parent", "attendance", child.id, effFrom, effTo],
    queryFn: async () => {
      let q = supabase
        .from("attendance")
        .select("status, date")
        .eq("student_id", child.id)
        .order("date", { ascending: false })
        .limit(500);
      if (effFrom) q = q.gte("date", effFrom);
      if (effTo) q = q.lte("date", effTo);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["parent", "results", child.id, termId, effFrom, effTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("score, exam:exam_id(title, max_score, exam_date, term_id, subject:subject_id(name))")
        .eq("student_id", child.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        score: number;
        exam: { title: string; max_score: number; exam_date: string | null; term_id: string; subject: { name: string } | null } | null;
      }>;
      return rows.filter((r) => {
        if (!r.exam) return false;
        if (termId !== "all" && r.exam.term_id !== termId) return false;
        if (effFrom && r.exam.exam_date && r.exam.exam_date < effFrom) return false;
        if (effTo && r.exam.exam_date && r.exam.exam_date > effTo) return false;
        return true;
      });
    },
  });

  const attendanceSummary = useMemo(() => {
    const counts: Record<string, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    (attendance ?? []).forEach((r) => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    });
    return [
      { name: "Present", value: counts.present, color: "hsl(var(--primary))" },
      { name: "Absent", value: counts.absent, color: "hsl(var(--destructive))" },
      { name: "Late", value: counts.late, color: "hsl(var(--muted-foreground))" },
      { name: "Excused", value: counts.excused, color: "hsl(var(--accent))" },
    ];
  }, [attendance]);

  const total = attendanceSummary.reduce((s, r) => s + r.value, 0);
  const presentPct = total ? Math.round((attendanceSummary[0].value / total) * 100) : 0;

  const examChart = useMemo(() => {
    return (results ?? [])
      .filter((r) => r.exam)
      .slice(0, 20)
      .reverse()
      .map((r) => ({
        name: r.exam!.subject?.name ?? r.exam!.title,
        score: Number(r.score) || 0,
        max: Number(r.exam!.max_score) || 100,
        pct: r.exam!.max_score ? Math.round((Number(r.score) / Number(r.exam!.max_score)) * 100) : 0,
      }));
  }, [results]);

  function resetFilters() {
    setTermId("all");
    setFromDate("");
    setToDate("");
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Term</Label>
          <Select value={termId} onValueChange={setTermId}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="All terms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All terms</SelectItem>
              {(terms ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.session?.name ?? "—"} · {t.name}{t.is_current ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px] h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px] h-9" />
        </div>
        <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
        {(activeTerm || fromDate || toDate) && (
          <span className="text-xs text-muted-foreground ml-auto">
            Showing {effFrom ?? "earliest"} → {effTo ?? "today"}
          </span>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Attendance</h3>
            <Badge variant="secondary">{presentPct}% present</Badge>
          </div>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No attendance recorded for this period.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={attendanceSummary} dataKey="value" nameKey="name" outerRadius={80} label>
                    {attendanceSummary.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-medium mb-2">Exam scores</h3>
          {examChart.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No exam results for this period.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="score" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4 md:col-span-2">
          <h3 className="font-medium mb-2">Score trend (%)</h3>
          {examChart.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No exam results for this period.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={examChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="pct" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* --------------------------------- Fees ---------------------------------- */

type Fee = {
  id: string;
  description: string;
  amount: number;
  amount_paid: number;
  status: string;
  due_date: string | null;
  paid_date: string | null;
  reference: string | null;
  payment_method: string | null;
};

function FeesTab({ child }: { child: Child }) {
  const { data: fees, isLoading } = useQuery({
    queryKey: ["parent", "fees", child.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fees")
        .select("id, description, amount, amount_paid, status, due_date, paid_date, reference, payment_method")
        .eq("student_id", child.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fee[];
    },
  });

  const totals = useMemo(() => {
    const list = fees ?? [];
    const billed = list.reduce((s, f) => s + Number(f.amount), 0);
    const paid = list.reduce((s, f) => s + Number(f.amount_paid), 0);
    return { billed, paid, balance: billed - paid };
  }, [fees]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total billed</p>
          <p className="text-xl font-semibold">{formatCurrency(totals.billed)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-xl font-semibold text-primary">{formatCurrency(totals.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="text-xl font-semibold text-destructive">{formatCurrency(totals.balance)}</p>
        </Card>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : (fees ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No fees on record.</TableCell></TableRow>
            ) : (fees ?? []).map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.description}</TableCell>
                <TableCell>{f.due_date ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(f.amount))}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(f.amount_paid))}</TableCell>
                <TableCell><FeeStatusBadge status={f.status} /></TableCell>
                <TableCell className="text-right">
                  {f.status !== "paid" ? (
                    <PayFeeButton fee={f} child={child} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{f.reference ?? "—"}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FeeStatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    paid: "default",
    partial: "secondary",
    unpaid: "destructive",
    overdue: "destructive",
  };
  return <Badge variant={variant[status] ?? "outline"}>{status}</Badge>;
}

function PayFeeButton({ fee, child }: { fee: Fee; child: Child }) {
  const [busy, setBusy] = useState(false);
  const initPay = useServerFn(initializeFeePayment);

  function getPaymentErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : "Unable to start payment.";
    if (/configured secret key|misconfigured|PAYSTACK_SECRET_KEY/i.test(message)) {
      return "Online payment is temporarily unavailable because the payment gateway is not configured correctly. Please contact the school admin.";
    }
    return message;
  }

  async function handlePay() {
    setBusy(true);
    try {
      const callbackUrl =
        typeof window !== "undefined" ? `${window.location.origin}/parent` : undefined;
      const res = await initPay({ data: { feeId: fee.id, callbackUrl } });
      toast.success("Redirecting to Paystack…", {
        description: `Reference ${res.reference}`,
      });
      void child;
      if (typeof window !== "undefined") {
        window.location.href = res.authorizationUrl;
      }
    } catch (e) {
      toast.error(getPaymentErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Button size="sm" onClick={handlePay} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CreditCard className="h-3.5 w-3.5 mr-1" />}
      Pay {formatCurrency(Number(fee.amount) - Number(fee.amount_paid))}
    </Button>
  );
}

/* --------------------------------- Reports -------------------------------- */

type ReportCard = {
  id: string;
  total_score: number | null;
  average: number | null;
  position: number | null;
  overall_grade: string | null;
  teacher_comment: string | null;
  principal_comment: string | null;
  published: boolean;
  term: { id: string; name: string; start_date: string; end_date: string; session: { name: string } | null } | null;
};

type SubjectResult = {
  subject: string;
  score: number;
  max_score: number;
  pct: number;
  grade: string | null;
  remark: string | null;
};

/* -------------------------------- Results -------------------------------- */

type ResultRow = {
  subject: string;
  ca1: number | null;
  ca2: number | null;
  ca3: number | null;
  exam: number | null;
  exam_max: number;
  total: number;
  pct: number;
  grade: string | null;
  remark: string | null;
};

function ResultsTab({ child }: { child: Child }) {
  const { data: terms } = useTerms();
  const [termId, setTermId] = useState<string>("");

  const currentTerm = terms?.find((t) => t.is_current) ?? terms?.[0] ?? null;
  const effectiveTermId = termId || currentTerm?.id || "";
  const activeTerm = terms?.find((t) => t.id === effectiveTermId) ?? null;
  const { data: activeGradingScale } = useResolvedGradingScale(child.class_id || undefined, null);

  const { data: settings } = useQuery({
    queryKey: ["parent", "school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("school_name, ca1_weight, ca2_weight, ca3_weight, exam_weight, grading_scale")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["parent", "result-card", child.id, effectiveTermId],
    enabled: !!effectiveTermId,
    queryFn: async () => {
      const [examsRes, casRes] = await Promise.all([
        supabase
          .from("results")
          .select("score, grade, remark, exam:exam_id!inner(id, title, max_score, term_id, published, subject:subject_id(id, name))")
          .eq("student_id", child.id)
          .eq("exam.term_id", effectiveTermId)
          .eq("exam.published", true),
        supabase
          .from("continuous_assessments")
          .select("score, max_score, ca_type, subject:subject_id(id, name)")
          .eq("student_id", child.id)
          .eq("term_id", effectiveTermId),
      ]);
      if (examsRes.error) throw examsRes.error;
      if (casRes.error) throw casRes.error;

      const examRows = (examsRes.data ?? []) as unknown as Array<{
        score: number; grade: string | null; remark: string | null;
        exam: { id: string; title: string; max_score: number; term_id: string; published: boolean; subject: { id: string; name: string } | null } | null;
      }>;
      const caRows = (casRes.data ?? []) as unknown as Array<{
        score: number; max_score: number; ca_type: string;
        subject: { id: string; name: string } | null;
      }>;

      const byKey = new Map<string, ResultRow>();
      const get = (name: string): ResultRow => {
        const existing = byKey.get(name);
        if (existing) return existing;
        const row: ResultRow = {
          subject: name, ca1: null, ca2: null, ca3: null, exam: null, exam_max: 100,
          total: 0, pct: 0, grade: null, remark: null,
        };
        byKey.set(name, row);
        return row;
      };

      caRows.forEach((c) => {
        if (!c.subject) return;
        const r = get(c.subject.name);
        const scaled = c.max_score ? (Number(c.score) / Number(c.max_score)) * 10 : Number(c.score);
        if (c.ca_type === "ca1") r.ca1 = Math.round(scaled * 10) / 10;
        else if (c.ca_type === "ca2") r.ca2 = Math.round(scaled * 10) / 10;
        else if (c.ca_type === "ca3") r.ca3 = Math.round(scaled * 10) / 10;
        else if (c.ca_type === "exam") {
          r.exam = Number(c.score);
          r.exam_max = Number(c.max_score) || 70;
        }
      });

      examRows.forEach((e) => {
        if (!e.exam?.subject) return;
        const r = get(e.exam.subject.name);
        r.exam = Number(e.score);
        r.exam_max = Number(e.exam.max_score) || 100;
        r.grade = e.grade;
        r.remark = e.remark;
      });

      const ca1W = Number(settings?.ca1_weight ?? 15);
      const ca2W = Number(settings?.ca2_weight ?? 15);
      const ca3W = Number(settings?.ca3_weight ?? 0);
      const exW = Number(settings?.exam_weight ?? 70);

      const grading = (settings?.grading_scale ?? []) as Array<{ min: number; max: number; grade: string; remark: string }>;

      const list = Array.from(byKey.values()).map((r) => {
        const ca1Pts = ((r.ca1 ?? 0) / 10) * ca1W;
        const ca2Pts = ((r.ca2 ?? 0) / 10) * ca2W;
        const ca3Pts = ((r.ca3 ?? 0) / 10) * ca3W;
        const examPts = r.exam != null ? (r.exam / r.exam_max) * exW : 0;
        const total = Math.round((ca1Pts + ca2Pts + ca3Pts + examPts) * 10) / 10;
        const pct = total;
        const dynamicGrade = activeGradingScale?.bands ? gradeForDynamicScale(activeGradingScale.bands, pct) : null;
        const band = grading.find((b) => pct >= b.min && pct <= b.max);
        return {
          ...r,
          total,
          pct,
          grade: dynamicGrade?.grade ?? band?.grade ?? r.grade ?? null,
          remark: dynamicGrade?.remark ?? band?.remark ?? r.remark ?? null,
        };
      });
      return list.sort((a, b) => a.subject.localeCompare(b.subject));
    },
  });

  const summary = useMemo(() => {
    const list = rows ?? [];
    if (!list.length) return { total: 0, average: 0, count: 0 };
    const total = list.reduce((s, r) => s + r.total, 0);
    return { total: Math.round(total * 10) / 10, average: Math.round((total / list.length) * 10) / 10, count: list.length };
  }, [rows]);

  function handlePrint() {
    window.print();
  }

  function handleDownloadPDF() {
    if (!rows?.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(settings?.school_name ?? "Result Card", 14, 16);
    doc.setFontSize(11);
    doc.text(`${child.full_name} — ${child.classes?.name ?? "—"}`, 14, 24);
    doc.text(`Admission No: ${child.admission_no}`, 14, 30);
    doc.text(`${activeTerm?.session?.name ?? ""} · ${activeTerm?.name ?? ""} term`, 14, 36);

    autoTable(doc, {
      startY: 42,
      head: [["Subject", "CA1/10", "CA2/10", `Exam/${rows[0]?.exam_max ?? 100}`, "Total/100", "Grade", "Remark"]],
      body: rows.map((r) => [
        r.subject,
        r.ca1?.toString() ?? "—",
        r.ca2?.toString() ?? "—",
        r.exam?.toString() ?? "—",
        r.total.toString(),
        r.grade ?? "—",
        r.remark ?? "—",
      ]),
      foot: [["Total", "", "", "", summary.total.toString(), "", `Avg ${summary.average}%`]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    doc.save(`${child.full_name.replace(/\s+/g, "_")}_results_${activeTerm?.name ?? "term"}.pdf`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1">
          <Label className="text-xs">Term</Label>
          <Select value={effectiveTermId} onValueChange={setTermId}>
            <SelectTrigger className="w-[260px] h-9">
              <SelectValue placeholder="Select term" />
            </SelectTrigger>
            <SelectContent>
              {(terms ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.session?.name ?? "—"} · {t.name}{t.is_current ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!rows?.length}>
            <Printer className="h-4 w-4 mr-1.5" /> Print
          </Button>
          <Button size="sm" onClick={handleDownloadPDF} disabled={!rows?.length}>
            <Download className="h-4 w-4 mr-1.5" /> Download PDF
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">{child.full_name}</h2>
            <p className="text-sm text-muted-foreground">
              Admission No: {child.admission_no} · Class: {child.classes?.name ?? "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              {activeTerm?.session?.name ?? "—"} · {activeTerm?.name ?? "—"} term
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{summary.average ? `${summary.average}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">Average</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Subjects" value={summary.count.toString()} />
          <Stat label="Total score" value={summary.total.toString()} />
          <Stat label="Average" value={summary.average ? `${summary.average}%` : "—"} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading results…</p>
        ) : !rows?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No exam results published for this term yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">CA1 /10</TableHead>
                  <TableHead className="text-right">CA2 /10</TableHead>
                  <TableHead className="text-right">Exam /{rows[0]?.exam_max ?? 100}</TableHead>
                  <TableHead className="text-right">Total /100</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Remark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subject}>
                    <TableCell className="font-medium">{r.subject}</TableCell>
                    <TableCell className="text-right">{r.ca1 ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.ca2 ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.exam ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{r.total}</TableCell>
                    <TableCell>
                      {r.grade ? <Badge variant="secondary">{r.grade}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.remark ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ReportsTab({ child }: { child: Child }) {
  const { data: reports, isLoading } = useQuery({
    queryKey: ["parent", "reports", child.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_cards")
        .select("id, total_score, average, position, overall_grade, teacher_comment, principal_comment, published, term:term_id(id, name, start_date, end_date, session:session_id(name))")
        .eq("student_id", child.id)
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReportCard[];
    },
  });

  const [selected, setSelected] = useState<string | null>(null);
  const active = reports?.find((r) => r.id === selected) ?? reports?.[0] ?? null;

  const { data: traitGroups, isFetching: traitsFetching } = useStudentTraitGroups(child.id, active?.term?.id ?? null);
  const traitsLoading = !!active?.term?.id && (traitsFetching || traitGroups === undefined);

  // Per-term subject results for the active report card
  const { data: termResults } = useQuery({
    queryKey: ["parent", "report-results", child.id, active?.term?.id],
    enabled: !!active?.term?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("score, grade, remark, exam:exam_id(title, max_score, term_id, subject:subject_id(name))")
        .eq("student_id", child.id);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        score: number;
        grade: string | null;
        remark: string | null;
        exam: { title: string; max_score: number; term_id: string; subject: { name: string } | null } | null;
      }>;
      // Aggregate per subject (sum scores, sum max) for the active term only
      const byKey = new Map<string, SubjectResult>();
      rows
        .filter((r) => r.exam && r.exam.term_id === active!.term!.id)
        .forEach((r) => {
          const key = r.exam!.subject?.name ?? r.exam!.title;
          const existing = byKey.get(key);
          const score = Number(r.score) || 0;
          const max = Number(r.exam!.max_score) || 0;
          if (existing) {
            existing.score += score;
            existing.max_score += max;
            existing.pct = existing.max_score ? Math.round((existing.score / existing.max_score) * 100) : 0;
            existing.grade = existing.grade ?? r.grade;
            existing.remark = existing.remark ?? r.remark;
          } else {
            byKey.set(key, {
              subject: key,
              score,
              max_score: max,
              pct: max ? Math.round((score / max) * 100) : 0,
              grade: r.grade,
              remark: r.remark,
            });
          }
        });
      return Array.from(byKey.values()).sort((a, b) => a.subject.localeCompare(b.subject));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={active?.id ?? ""} onValueChange={setSelected}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select term" />
          </SelectTrigger>
          <SelectContent>
            {(reports ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.term?.session?.name ?? "—"} · {r.term?.name ?? "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active && (
          <Button
            onClick={() => downloadReportPDF(active, child, termResults ?? [], traitGroups ?? [])}
            size="sm"
            disabled={traitsLoading}
          >
            {traitsLoading ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Preparing…</>
            ) : (
              <><Download className="h-4 w-4 mr-1.5" /> Download PDF</>
            )}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : !active ? (
        <Card className="p-6 text-sm text-muted-foreground">No published report cards available yet.</Card>
      ) : (
        <Card className="p-6 space-y-4" id={`report-${active.id}`}>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">{child.full_name}</h2>
              <p className="text-sm text-muted-foreground">
                Admission No: {child.admission_no} · Class: {child.classes?.name ?? "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                {active.term?.session?.name ?? "—"} · {active.term?.name ?? "—"} term
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{active.overall_grade ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Overall grade</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total" value={active.total_score?.toString() ?? "—"} />
            <Stat label="Average" value={active.average != null ? `${Number(active.average).toFixed(2)}%` : "—"} />
            <Stat label="Position" value={active.position?.toString() ?? "—"} />
          </div>

          {(termResults ?? []).length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Remark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(termResults ?? []).map((r) => (
                    <TableRow key={r.subject}>
                      <TableCell className="font-medium">{r.subject}</TableCell>
                      <TableCell className="text-right">{r.score}</TableCell>
                      <TableCell className="text-right">{r.max_score}</TableCell>
                      <TableCell className="text-right">{r.pct}%</TableCell>
                      <TableCell>{r.grade ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.remark ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <TraitsPanel groups={traitGroups ?? []} />

          {active.teacher_comment && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Teacher's comment</p>
              <p className="text-sm mt-1">{active.teacher_comment}</p>
            </div>
          )}
          {active.principal_comment && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Principal's comment</p>
              <p className="text-sm mt-1">{active.principal_comment}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

/* ---------------------------- Traits panel (UI) -------------------------- */

function TraitsPanel({ groups }: { groups: TraitGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">Traits &amp; skills</p>
        <p className="text-[10px] text-muted-foreground">
          M = Mastered · SP = Strongly Progressing · P = Progressing · NA = Needs Attention
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id} className="rounded border">
            <div className="px-2 py-1 bg-muted/50 text-xs font-semibold">{g.title}</div>
            <table className="w-full text-xs">
              <tbody>
                {g.items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-2 py-1">{it.label}</td>
                    {it.rating == null ? (
                      <td colSpan={RATING_COLUMNS.length} className="px-2 py-1 text-center italic text-muted-foreground">
                        Not rated yet
                      </td>
                    ) : (
                      RATING_COLUMNS.map((col) => (
                        <td key={col} className="w-7 text-center text-muted-foreground">
                          {it.rating === col ? "✓" : ""}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
                {g.items.length === 0 && (
                  <tr><td className="px-2 py-2 text-muted-foreground text-center" colSpan={5}>No items</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Report PDF -------------------------------- */

function downloadReportPDF(
  report: ReportCard,
  child: Child,
  results: SubjectResult[],
  traitGroups: TraitGroup[],
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = margin;

  // Header band
  doc.setFillColor(190, 24, 93);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("STUDENT REPORT CARD", pageW / 2, 11, { align: "center" });
  doc.setTextColor(0);
  y = 24;

  // Student info grid
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const info: Array<[string, string, string, string]> = [
    ["STUDENT NAME", child.full_name, "STUDENT CLASS", child.classes?.name ?? "—"],
    ["ADMISSION NUMBER", child.admission_no, "TERM", report.term?.name ?? "—"],
    ["YEAR / SESSION", report.term?.session?.name ?? "—", "POSITION", report.position?.toString() ?? "—"],
  ];
  info.forEach(([k1, v1, k2, v2]) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${k1}:`, margin, y);
    doc.text(`${k2}:`, pageW / 2, y);
    doc.setFont("helvetica", "normal");
    doc.text(v1, margin + 36, y);
    doc.text(v2, pageW / 2 + 30, y);
    y += 5;
  });

  y += 2;
  // Subjects table
  autoTable(doc, {
    startY: y,
    head: [["Subject", "Score", "Max", "%", "Grade", "Remark"]],
    body: results.length
      ? results.map((r) => [r.subject, String(r.score), String(r.max_score), `${r.pct}%`, r.grade ?? "—", r.remark ?? "—"])
      : [["No subject results recorded for this term", "", "", "", "", ""]],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [190, 24, 93], textColor: 255 },
    margin: { left: margin, right: margin },
  });
  // @ts-expect-error - autotable adds lastAutoTable
  y = (doc.lastAutoTable?.finalY ?? y) + 4;

  // Totals row
  if (results.length) {
    const totalScore = results.reduce((s, r) => s + r.score, 0);
    const totalMax = results.reduce((s, r) => s + r.max_score, 0);
    const overallPct = totalMax ? ((totalScore / totalMax) * 100).toFixed(1) : "—";
    autoTable(doc, {
      startY: y,
      body: [[
        "TOTAL", String(totalScore), String(totalMax), `${overallPct}%`,
        report.overall_grade ?? "—", `Average: ${report.average != null ? Number(report.average).toFixed(2) + "%" : "—"}`,
      ]],
      styles: { fontSize: 8, cellPadding: 1.5, fontStyle: "bold" },
      bodyStyles: { fillColor: [243, 244, 246] },
      margin: { left: margin, right: margin },
    });
    // @ts-expect-error - autotable adds lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 4;
  }

  const pageH = doc.internal.pageSize.getHeight();
  const footerReserve = 14; // leave room for the page-number footer
  const bottomMargin = footerReserve + 4;

  // Soft skills heading
  if (y > pageH - 60) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Soft Skills Assessment", margin, y);
  y += 1;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Key: M = Mastered · SP = Strongly Progressing · P = Progressing · NA = Needs Attention", margin, y + 4);
  y += 7;

  // Two-column layout for soft skills. Estimate each group's height so we can
  // page-break before drawing rather than letting autoTable spill across columns.
  const colW = (pageW - margin * 2 - 4) / 2;
  const rowH = 4.5;       // matches styles.minCellHeight
  const headerH = 6;
  const groupGap = 3;
  let leftY = y;
  let rightY = y;

  traitGroups.forEach((group, idx) => {
    const isLeft = idx % 2 === 0;
    const estH = headerH + group.items.length * rowH;
    const startY = isLeft ? leftY : rightY;

    // If this group can't fit in its column on the current page, start a fresh page.
    if (startY + estH > pageH - bottomMargin) {
      doc.addPage();
      leftY = margin;
      rightY = margin;
    }

    const drawY = isLeft ? leftY : rightY;
    const x = isLeft ? margin : margin + colW + 4;

    autoTable(doc, {
      startY: drawY,
      head: [[group.title, "M", "SP", "P", "NA"]],
      body: group.items.map((it) => [
        it.rating == null ? `${it.label}  (not rated yet)` : it.label,
        it.rating === "M" ? "X" : "",
        it.rating === "SP" ? "X" : "",
        it.rating === "P" ? "X" : "",
        it.rating === "NA" ? "X" : "",
      ]),
      styles: { fontSize: 7, cellPadding: 1, minCellHeight: rowH },
      headStyles: { fillColor: [219, 234, 254], textColor: 0, fontSize: 7 },
      columnStyles: {
        0: { cellWidth: colW - 24 },
        1: { cellWidth: 6, halign: "center" },
        2: { cellWidth: 6, halign: "center" },
        3: { cellWidth: 6, halign: "center" },
        4: { cellWidth: 6, halign: "center" },
      },
      margin: { left: x, right: pageW - x - colW, bottom: bottomMargin },
      tableWidth: colW,
      rowPageBreak: "avoid",
    });
    // @ts-expect-error - autotable adds lastAutoTable
    const finalY = doc.lastAutoTable?.finalY ?? drawY;
    if (isLeft) leftY = finalY + groupGap;
    else rightY = finalY + groupGap;
  });

  if (traitGroups.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.text("No traits & skills recorded for this term.", margin, y);
    y += 6;
  }

  y = Math.max(leftY, rightY) + 2;

  // Comments — paginate per block so long remarks don't overlap the footer.
  const comments: Array<[string, string]> = [
    ["Teacher's Remark", report.teacher_comment ?? "—"],
    ["Principal's Comment", report.principal_comment ?? "—"],
  ];
  comments.forEach(([label, val]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(val, pageW - margin * 2);
    const blockH = 4 + lines.length * 4 + 3;
    if (y + blockH > pageH - bottomMargin) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 3;
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `Generated ${new Date().toLocaleDateString()} · Page ${i} of ${pageCount}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" },
    );
  }

  const fname = `${child.full_name.replace(/\s+/g, "_")}_${report.term?.name ?? "term"}_report.pdf`;
  doc.save(fname);
}

/* -------------------------------- Messages -------------------------------- */

type Profile = { id: string; full_name: string | null; email: string | null };
type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  subject: string | null;
  content: string;
  created_at: string;
  read_at: string | null;
};

function MessagesTab({ child }: { child: Child }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [peer, setPeer] = useState<string | null>(null);
  const [body, setBody] = useState("");

  // Staff/admin contacts: profiles having a role of teacher / admin / principal etc.
  const { data: contacts } = useQuery({
    queryKey: ["parent", "contacts", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: roles, error: rerr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "teacher", "super_admin"]);
      if (rerr) throw rerr;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id))).filter((id) => id !== user!.id);
      if (ids.length === 0) return [] as Profile[];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["parent", "messages", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const conversations = useMemo(() => {
    const map = new Map<string, { peer: string; last: string; unread: number }>();
    (messages ?? []).forEach((m) => {
      const other = m.sender_id === user?.id ? m.receiver_id : m.sender_id;
      const e = map.get(other);
      if (!e) {
        map.set(other, {
          peer: other,
          last: m.created_at,
          unread: m.receiver_id === user?.id && !m.read_at ? 1 : 0,
        });
      } else if (m.receiver_id === user?.id && !m.read_at) {
        e.unread += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [messages, user?.id]);

  const thread = useMemo(() => {
    if (!peer) return [];
    return (messages ?? [])
      .filter((m) =>
        (m.sender_id === user?.id && m.receiver_id === peer) ||
        (m.sender_id === peer && m.receiver_id === user?.id),
      )
      .slice()
      .reverse();
  }, [messages, peer, user?.id]);

  // Mark unread as read
  useEffect(() => {
    if (!peer || !user?.id) return;
    const unreadIds = thread
      .filter((m) => m.receiver_id === user.id && m.sender_id === peer && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    (async () => {
      const { error } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
      if (!error) qc.invalidateQueries({ queryKey: ["parent", "messages"] });
    })();
  }, [peer, user?.id, thread, qc]);

  const childContext = `[Re: ${child.full_name}${child.classes?.name ? ` · ${child.classes.name}` : ""}]`;

  const send = useMutation({
    mutationFn: async () => {
      if (!user?.id || !peer) throw new Error("Select a recipient");
      if (!body.trim()) throw new Error("Message is empty");
      const { error } = await supabase.from("messages").insert({
        sender_id: user.id,
        receiver_id: peer,
        subject: childContext,
        content: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["parent", "messages"] });
      toast.success("Message sent");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const nameOf = (id: string) => contacts?.find((c) => c.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Sidebar: contacts + conversations */}
      <Card className="p-3 space-y-3 max-h-[70vh] overflow-auto">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Start new</p>
          <Select value={peer ?? ""} onValueChange={(v) => setPeer(v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Teacher / Admin" />
            </SelectTrigger>
            <SelectContent>
              {(contacts ?? []).length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No contacts available</div>
              )}
              {(contacts ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email ?? c.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Conversations</p>
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground">No messages yet.</p>
          )}
          {conversations.map((c) => {
            const active = c.peer === peer;
            return (
              <button
                key={c.peer}
                onClick={() => setPeer(c.peer)}
                className={`w-full text-left rounded-md px-2 py-1.5 text-sm flex items-center justify-between gap-2 ${
                  active ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="truncate">{nameOf(c.peer)}</span>
                {c.unread > 0 && <Badge className="h-5 px-1.5 text-[10px]">{c.unread}</Badge>}
              </button>
            );
          })}
        </div>
        <div className="border-t pt-2">
          <Button asChild variant="ghost" size="sm" className="w-full justify-start">
            <Link to="/communication">
              <Mail className="h-4 w-4 mr-1.5" /> Open full inbox
            </Link>
          </Button>
        </div>
      </Card>

      {/* Thread + composer */}
      <Card className="p-3 flex flex-col min-h-[60vh]">
        {!peer ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a teacher or admin to start a conversation about {child.full_name}.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b pb-2 mb-2">
              <div>
                <p className="text-sm font-medium">{nameOf(peer)}</p>
                <p className="text-xs text-muted-foreground">{childContext}</p>
              </div>
            </div>
            <div className="flex-1 overflow-auto space-y-2 pr-1">
              {thread.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No messages yet. Send the first one below.
                </p>
              ) : thread.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {m.subject && <div className="text-[10px] opacity-80 mb-0.5">{m.subject}</div>}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div className="text-[10px] opacity-70 mt-1 flex items-center gap-1">
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                        {mine && <span>· {m.read_at ? "Read" : "Sent"}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t pt-2 mt-2 space-y-2">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={`Write a message about ${child.full_name}…`}
                className="min-h-[80px]"
              />
              <div className="flex justify-end">
                <Button onClick={() => send.mutate()} disabled={send.isPending || !body.trim()} size="sm">
                  {send.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n);
}

interface PrefsRow {
  user_id: string;
  promotion_in_app: boolean;
  promotion_email: boolean;
  promotion_sms: boolean;
}

function NotificationPrefsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? "";

  const prefsQ = useQuery({
    queryKey: ["notif-prefs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("user_id,promotion_in_app,promotion_email,promotion_sms")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        user_id: userId,
        promotion_in_app: true,
        promotion_email: false,
        promotion_sms: false,
      }) as PrefsRow;
    },
  });

  const [draft, setDraft] = useState<PrefsRow | null>(null);
  const current = draft ?? prefsQ.data ?? null;

  const save = useMutation({
    mutationFn: async (p: PrefsRow) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: userId,
          promotion_in_app: p.promotion_in_app,
          promotion_email: p.promotion_email,
          promotion_sms: p.promotion_sms,
        }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferences saved.");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["notif-prefs", userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (prefsQ.isLoading || !current) {
    return <Card className="p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</Card>;
  }

  const Row = ({
    label, hint, value, onChange,
  }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div>
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-medium">Promotion update notifications</h3>
        <p className="text-xs text-muted-foreground">
          Choose how you want to be notified when your child's promotion status changes.
        </p>
      </div>
      <div className="grid gap-2">
        <Row
          label="In-app notifications"
          hint="Show alerts inside the parent portal."
          value={current.promotion_in_app}
          onChange={(v) => setDraft({ ...current, promotion_in_app: v })}
        />
        <Row
          label="Email"
          hint="Send a copy to your registered email address."
          value={current.promotion_email}
          onChange={(v) => setDraft({ ...current, promotion_email: v })}
        />
        <Row
          label="SMS"
          hint="Text the update to your registered phone number."
          value={current.promotion_sms}
          onChange={(v) => setDraft({ ...current, promotion_sms: v })}
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!draft || save.isPending} onClick={() => draft && save.mutate(draft)}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Save preferences
        </Button>
      </div>
    </Card>
  );
}
