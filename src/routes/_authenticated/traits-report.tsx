import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer } from "lucide-react";
import {
  useStudentTraitGroups,
  RATING_COLUMNS,
  RATING_LABEL,
  type Rating,
} from "@/lib/traits";

export const Route = createFileRoute("/_authenticated/traits-report")({
  component: TraitsReportPage,
});

interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; is_current: boolean; session?: { name: string } | null }
interface StudentRow { id: string; full_name: string }

function TraitsReportPage() {
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");

  const classesQ = useQuery({
    queryKey: ["traits-report-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });

  const termsQ = useQuery({
    queryKey: ["traits-report-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id,name,is_current,session:session_id(name)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });

  // Default term to current
  if (!termId && termsQ.data?.length) {
    const cur = termsQ.data.find((t) => t.is_current) ?? termsQ.data[0];
    if (cur) setTimeout(() => setTermId(cur.id), 0);
  }

  const studentsQ = useQuery({
    queryKey: ["traits-report-students", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id,full_name")
        .eq("class_id", classId)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const groupsQ = useStudentTraitGroups(studentId || null, termId || null);

  const student = useMemo(
    () => (studentsQ.data ?? []).find((s) => s.id === studentId) ?? null,
    [studentsQ.data, studentId],
  );
  const classRow = useMemo(
    () => (classesQ.data ?? []).find((c) => c.id === classId) ?? null,
    [classesQ.data, classId],
  );
  const term = useMemo(
    () => (termsQ.data ?? []).find((t) => t.id === termId) ?? null,
    [termsQ.data, termId],
  );

  const categorySummaries = useMemo(() => {
    return (groupsQ.data ?? []).map((g) => {
      const counts: Record<Rating | "unrated", number> = { M: 0, SP: 0, P: 0, NA: 0, unrated: 0 };
      g.items.forEach((it) => {
        if (it.rating) counts[it.rating]++; else counts.unrated++;
      });
      return { id: g.id, title: g.title, total: g.items.length, counts };
    });
  }, [groupsQ.data]);

  const overall = useMemo(() => {
    const totals: Record<Rating | "unrated", number> = { M: 0, SP: 0, P: 0, NA: 0, unrated: 0 };
    let total = 0;
    categorySummaries.forEach((c) => {
      total += c.total;
      (Object.keys(totals) as (Rating | "unrated")[]).forEach((k) => { totals[k] += c.counts[k]; });
    });
    return { total, counts: totals };
  }, [categorySummaries]);

  const ready = !!studentId && !!termId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Traits report card</h1>
          <p className="text-sm text-muted-foreground">
            Per-student, per-term summary of every trait category and item rating.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready}
          onClick={() => window.print()}
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
        </Button>
      </div>

      <Card className="p-4 print:hidden">
        <div className="flex flex-wrap gap-3 items-end">
          <FilterField label="Class">
            <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId(""); }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {(classesQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Student">
            <Select value={studentId} onValueChange={setStudentId} disabled={!classId}>
              <SelectTrigger className="w-64"><SelectValue placeholder={classId ? "Select student" : "Pick a class first"} /></SelectTrigger>
              <SelectContent>
                {(studentsQ.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Term">
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select term" /></SelectTrigger>
              <SelectContent>
                {(termsQ.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.session?.name ? `${t.session.name} · ` : ""}{t.name}{t.is_current ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </Card>

      {!ready ? (
        <Card className="p-8 text-sm text-muted-foreground text-center">
          Pick a class, student, and term to view the traits report.
        </Card>
      ) : groupsQ.isLoading ? (
        <Card className="p-8 text-sm text-muted-foreground text-center">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </Card>
      ) : (
        <Card className="p-6 space-y-6 print:shadow-none print:border-0">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <h2 className="text-lg font-semibold">{student?.full_name}</h2>
              <p className="text-xs text-muted-foreground">
                {classRow?.name}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{term?.name}{term?.is_current ? " (current)" : ""}</p>
              {term?.session?.name && <p className="text-xs text-muted-foreground">{term.session.name}</p>}
            </div>
          </div>

          {/* Overall summary */}
          <section>
            <h3 className="font-medium text-sm mb-2">Overall</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {RATING_COLUMNS.map((r) => (
                <SummaryStat key={r} label={`${r} — ${RATING_LABEL[r]}`} value={overall.counts[r]} total={overall.total} />
              ))}
              <SummaryStat label="Unrated" value={overall.counts.unrated} total={overall.total} muted />
            </div>
          </section>

          {/* Category summary */}
          <section>
            <h3 className="font-medium text-sm mb-2">Category breakdown</h3>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    {RATING_COLUMNS.map((r) => (
                      <TableHead key={r} className="text-center">{r}</TableHead>
                    ))}
                    <TableHead className="text-center">—</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categorySummaries.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.title}</TableCell>
                      <TableCell className="text-right">{c.total}</TableCell>
                      {RATING_COLUMNS.map((r) => (
                        <TableCell key={r} className="text-center">{c.counts[r] || ""}</TableCell>
                      ))}
                      <TableCell className="text-center text-muted-foreground">{c.counts.unrated || ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Per-item ratings, grouped */}
          <section className="space-y-4">
            <h3 className="font-medium text-sm">Detailed ratings</h3>
            {(groupsQ.data ?? []).map((g) => (
              <div key={g.id} className="rounded-md border overflow-hidden break-inside-avoid">
                <div className="bg-muted/40 px-3 py-2 text-sm font-medium">{g.title}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      {RATING_COLUMNS.map((r) => (
                        <TableHead key={r} className="text-center w-12">{r}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.label}</TableCell>
                        {it.rating == null ? (
                          <TableCell colSpan={RATING_COLUMNS.length} className="text-center italic text-muted-foreground">
                            Not rated yet
                          </TableCell>
                        ) : (
                          RATING_COLUMNS.map((r) => (
                            <TableCell key={r} className="text-center">
                              {it.rating === r ? <span aria-label={RATING_LABEL[r]}>✓</span> : ""}
                            </TableCell>
                          ))
                        )}
                      </TableRow>
                    ))}
                    {g.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={RATING_COLUMNS.length + 1} className="text-center text-xs text-muted-foreground">
                          No items in this category.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            ))}
          </section>

          {/* Legend */}
          <div className="border-t pt-3 flex flex-wrap gap-2">
            {RATING_COLUMNS.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {r} — {RATING_LABEL[r]}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SummaryStat({ label, value, total, muted }: { label: string; value: number; total: number; muted?: boolean }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className={`rounded-md border p-3 ${muted ? "bg-muted/30" : ""}`}>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      <p className="text-[11px] text-muted-foreground">{pct}% of {total}</p>
    </div>
  );
}
