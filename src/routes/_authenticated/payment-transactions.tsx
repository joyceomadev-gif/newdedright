import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, Search } from "lucide-react";
import { SessionSelect, ALL_SESSIONS, useSessions } from "@/components/SessionSelect";
import { PaginationBar, usePagedSlice } from "@/components/ui/pagination-bar";

export const Route = createFileRoute("/_authenticated/payment-transactions")({
  component: PaymentTransactionsPage,
});

type Txn = {
  id: string;
  fee_id: string;
  reference: string;
  amount: number;
  payment_method: string | null;
  paid_at: string;
  raw_payload: unknown;
  created_at: string;
  academic_session_id: string | null;
  term_id: string | null;
};

type FeeInfo = {
  id: string;
  description: string;
  amount: number;
  student_id: string;
  students: { id: string; full_name: string; admission_no: string } | null;
};

const fmt = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n || 0);

function PaymentTransactionsPage() {
  const [refQ, setRefQ] = useState("");
  const [feeQ, setFeeQ] = useState("");
  const [studentQ, setStudentQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Txn | null>(null);
  const [sessionFilter, setSessionFilter] = useState<string>(ALL_SESSIONS);
  const [termFilter, setTermFilter] = useState<string>("all");

  const { data: sessionList } = useSessions();
  const sessionNameById = useMemo(
    () => Object.fromEntries((sessionList ?? []).map((x) => [x.id, x.name])) as Record<string, string>,
    [sessionList],
  );
  const { data: terms } = useQuery({
    queryKey: ["terms-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id, name, session_id").order("created_at");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; session_id: string | null }[];
    },
  });
  const termNameById = useMemo(
    () => Object.fromEntries((terms ?? []).map((t) => [t.id, t.name])) as Record<string, string>,
    [terms],
  );

  const { data: txns, isLoading } = useQuery({
    queryKey: ["payment-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .order("paid_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Txn[];
    },
  });

  const feeIds = useMemo(() => Array.from(new Set((txns ?? []).map((t) => t.fee_id))), [txns]);

  const { data: fees } = useQuery({
    queryKey: ["payment-transactions", "fees", feeIds],
    enabled: feeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fees")
        .select("id, description, amount, student_id, students:students(id, full_name, admission_no)")
        .in("id", feeIds);
      if (error) throw error;
      return (data ?? []) as unknown as FeeInfo[];
    },
  });

  const feeMap = useMemo(() => {
    const m = new Map<string, FeeInfo>();
    (fees ?? []).forEach((f) => m.set(f.id, f));
    return m;
  }, [fees]);

  const filtered = useMemo(() => {
    return (txns ?? []).filter((t) => {
      if (refQ && !t.reference.toLowerCase().includes(refQ.toLowerCase())) return false;
      const fee = feeMap.get(t.fee_id);
      if (feeQ) {
        const hay = `${fee?.description ?? ""} ${t.fee_id}`.toLowerCase();
        if (!hay.includes(feeQ.toLowerCase())) return false;
      }
      if (studentQ) {
        const s = fee?.students;
        const hay = `${s?.full_name ?? ""} ${s?.admission_no ?? ""}`.toLowerCase();
        if (!hay.includes(studentQ.toLowerCase())) return false;
      }
      if (sessionFilter !== ALL_SESSIONS && t.academic_session_id !== sessionFilter) return false;
      if (termFilter !== "all" && t.term_id !== termFilter) return false;
      if (from && t.paid_at < from) return false;
      if (to && t.paid_at > `${to}T23:59:59`) return false;
      return true;
    });
  }, [txns, refQ, feeQ, studentQ, from, to, feeMap, sessionFilter, termFilter]);

  const [page, setPage] = useState(1);
  const { pageItems, totalPages, page: safePage, start, end } = usePagedSlice(filtered, page, setPage);

  const total = useMemo(
    () => filtered.reduce((s, t) => s + Number(t.amount || 0), 0),
    [filtered],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Payment Transactions</h1>
        <p className="text-sm text-muted-foreground">
          All processed payment webhook events. Use filters to narrow results.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <SessionSelect label="Session" allowAll autoDefault={false} value={sessionFilter} onChange={setSessionFilter} />
          <div className="space-y-1">
            <Label htmlFor="termQ">Term</Label>
            <select
              id="termQ"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
            >
              <option value="all">All terms</option>
              {(terms ?? [])
                .filter((t) => sessionFilter === ALL_SESSIONS || t.session_id === sessionFilter)
                .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="refQ">Reference</Label>
            <Input id="refQ" value={refQ} onChange={(e) => setRefQ(e.target.value)} placeholder="txn_..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="feeQ">Fee / invoice</Label>
            <Input id="feeQ" value={feeQ} onChange={(e) => setFeeQ(e.target.value)} placeholder="Description or id" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="studentQ">Student</Label>
            <Input id="studentQ" value={studentQ} onChange={(e) => setStudentQ(e.target.value)} placeholder="Name or admission no" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            {filtered.length} transactions
          </div>
          <div>Total: <span className="font-medium text-foreground">{fmt(total)}</span></div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paid at</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((t) => {
                const fee = feeMap.get(t.fee_id);
                const s = fee?.students;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(t.paid_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                    <TableCell>
                      {s ? (
                        <div className="text-sm">
                          <div>{s.full_name}</div>
                          <div className="text-xs text-muted-foreground">{s.admission_no}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{fee?.description ?? t.fee_id}</TableCell>
                    <TableCell className="text-sm">{sessionNameById[t.academic_session_id ?? ""] ?? "—"}</TableCell>
                    <TableCell className="text-sm capitalize">{termNameById[t.term_id ?? ""] ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t.payment_method ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(Number(t.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(t)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No transactions match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
        <div className="px-4 pb-3">
          <PaginationBar page={safePage} totalPages={totalPages} totalItems={filtered.length} start={start} end={end} onPageChange={setPage} />
        </div>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transaction detail</DialogTitle>
            <DialogDescription>
              Reference <span className="font-mono">{selected?.reference}</span>
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-muted-foreground text-xs">Amount</div><div>{fmt(Number(selected.amount))}</div></div>
                <div><div className="text-muted-foreground text-xs">Method</div><div>{selected.payment_method ?? "—"}</div></div>
                <div><div className="text-muted-foreground text-xs">Paid at</div><div>{new Date(selected.paid_at).toLocaleString()}</div></div>
                <div><div className="text-muted-foreground text-xs">Recorded</div><div>{new Date(selected.created_at).toLocaleString()}</div></div>
                <div className="col-span-2"><div className="text-muted-foreground text-xs">Fee id</div><div className="font-mono text-xs break-all">{selected.fee_id}</div></div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">Raw payload</div>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-80">
{JSON.stringify(selected.raw_payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
