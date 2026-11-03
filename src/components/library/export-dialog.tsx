import { useState } from "react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

type Format = "pdf" | "csv";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCsv(sections: { title: string; headers: string[]; rows: (string | number | null)[][] }[]): string {
  const lines: string[] = [];
  for (const s of sections) {
    lines.push(s.title);
    lines.push(s.headers.map(csvEscape).join(","));
    for (const r of s.rows) lines.push(r.map(csvEscape).join(","));
    lines.push("");
  }
  return lines.join("\n");
}

interface Profile { id: string; full_name: string | null; }

async function fetchProfiles(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  ((data ?? []) as Profile[]).forEach((p) => map.set(p.id, p.full_name ?? "—"));
  return map;
}

export function ExportLibraryDialog() {
  const today = format(new Date(), "yyyy-MM-dd");
  const monthAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<Format | null>(null);

  async function gather() {
    if (!from || !to || from > to) {
      throw new Error("Please choose a valid date range.");
    }
    const toEnd = `${to}T23:59:59`;

    const [booksRes, loansRes, allocRes] = await Promise.all([
      supabase.from("library_books").select("title, author, isbn, category, total_copies, available_copies").order("title"),
      supabase
        .from("book_loans")
        .select("id, book_id, borrower_id, borrowed_date, due_date, returned_date, fine_amount, fine_paid")
        .gte("borrowed_date", from)
        .lte("borrowed_date", to)
        .order("borrowed_date", { ascending: false }),
      supabase
        .from("equipment_allocations")
        .select("id, equipment_id, allocated_to, quantity, allocated_date, due_date, returned_date, status, purpose")
        .gte("allocated_date", from)
        .lte("allocated_date", to)
        .order("allocated_date", { ascending: false }),
    ]);

    if (booksRes.error) throw booksRes.error;
    if (loansRes.error) throw loansRes.error;
    if (allocRes.error) throw allocRes.error;

    const loans = loansRes.data ?? [];
    const allocs = allocRes.data ?? [];

    const bookIds = loans.map((l) => l.book_id);
    const equipIds = allocs.map((a) => a.equipment_id);
    const userIds = [...loans.map((l) => l.borrower_id), ...allocs.map((a) => a.allocated_to)];

    const [bookTitles, equipNames, profiles] = await Promise.all([
      bookIds.length
        ? supabase.from("library_books").select("id, title").in("id", Array.from(new Set(bookIds))).then((r) => {
            const m = new Map<string, string>();
            (r.data ?? []).forEach((b) => m.set(b.id, b.title));
            return m;
          })
        : Promise.resolve(new Map<string, string>()),
      equipIds.length
        ? supabase.from("equipment").select("id, name").in("id", Array.from(new Set(equipIds))).then((r) => {
            const m = new Map<string, string>();
            (r.data ?? []).forEach((e) => m.set(e.id, e.name));
            return m;
          })
        : Promise.resolve(new Map<string, string>()),
      fetchProfiles(userIds),
    ]);
    void toEnd; // reserved for future timestamp filters

    const booksSection = {
      title: "Books inventory",
      headers: ["Title", "Author", "ISBN", "Category", "Total", "Available"],
      rows: (booksRes.data ?? []).map((b) => [
        b.title,
        b.author ?? "",
        b.isbn ?? "",
        b.category ?? "",
        b.total_copies,
        b.available_copies,
      ]),
    };

    const loansSection = {
      title: `Loans (${from} to ${to})`,
      headers: ["Book", "Borrower", "Borrowed", "Due", "Returned", "Status", "Fine"],
      rows: loans.map((l) => {
        const overdue = !l.returned_date && new Date(l.due_date) < new Date();
        const status = l.returned_date ? "Returned" : overdue ? "Overdue" : "Active";
        return [
          bookTitles.get(l.book_id) ?? "—",
          profiles.get(l.borrower_id) ?? "—",
          l.borrowed_date,
          l.due_date,
          l.returned_date ?? "",
          status,
          Number(l.fine_amount ?? 0).toFixed(2),
        ];
      }),
    };

    const allocSection = {
      title: `Equipment allocations (${from} to ${to})`,
      headers: ["Equipment", "Allocated to", "Qty", "Allocated", "Due", "Returned", "Status", "Purpose"],
      rows: allocs.map((a) => [
        equipNames.get(a.equipment_id) ?? "—",
        profiles.get(a.allocated_to) ?? "—",
        a.quantity,
        a.allocated_date,
        a.due_date ?? "",
        a.returned_date ?? "",
        a.status,
        a.purpose ?? "",
      ]),
    };

    return [booksSection, loansSection, allocSection];
  }

  async function exportCsv() {
    try {
      setBusy("csv");
      const sections = await gather();
      const csv = buildCsv(sections);
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `library-report-${from}-to-${to}.csv`);
      toast.success("CSV exported");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    try {
      setBusy("pdf");
      const sections = await gather();
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Library & Resources Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Range: ${from} to ${to}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, 14, 27);
      let y = 34;
      for (const s of sections) {
        doc.setFontSize(12);
        doc.text(s.title, 14, y);
        autoTable(doc, {
          startY: y + 3,
          head: [s.headers],
          body: s.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [30, 41, 59] },
          margin: { left: 14, right: 14 },
        });
        const next = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
        y = (next?.finalY ?? y + 10) + 10;
        if (y > 180) {
          doc.addPage();
          y = 20;
        }
      }
      doc.save(`library-report-${from}-to-${to}.pdf`);
      toast.success("PDF exported");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-1.5" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export library report</DialogTitle>
          <DialogDescription>
            Includes book inventory, loans and equipment allocations within the selected date range.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp-from">From</Label>
            <Input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-to">To</Label>
            <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={busy !== null}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            {busy === "csv" ? "Exporting…" : "Download CSV"}
          </Button>
          <Button onClick={exportPdf} disabled={busy !== null}>
            <FileText className="h-4 w-4 mr-1.5" />
            {busy === "pdf" ? "Exporting…" : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
