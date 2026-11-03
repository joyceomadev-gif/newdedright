import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildSchoolWorkbook, type ExportPageFetcher } from "@/lib/school-excel-export";

export function SchoolExcelExportButton() {
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ blob: Blob; filename: string } | null>(null);

  function download(file: { blob: Blob; filename: string }) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function handleExport() {
    if (prepared) {
      download(prepared);
      setPrepared(null);
      return;
    }
    setBusy(true);
    try {
      const fetchPage: ExportPageFetcher = async (table, fields, from, to) => {
        const { data, error } = await supabase.from(table).select(fields).is("deleted_at", null).order("id").range(from, to);
        if (error) return { data: null, error };
        return { data: data as unknown as Record<string, unknown>[], error: null };
      };
      const workbook = await buildSchoolWorkbook(fetchPage);
      const XLSX = await import("xlsx");
      const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
      const file = {
        blob: new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        filename: `school-data-${new Date().toISOString().slice(0, 10)}.xlsx`,
      };
      // Safari requires a fresh click after asynchronous preparation.
      if (/iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium/.test(navigator.userAgent)) {
        setPrepared(file);
      } else {
        download(file);
        toast.success("Excel file downloaded.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Excel export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4" />}
      {busy ? "Preparing Excel…" : prepared ? "Download Excel" : "Export to Excel"}
    </Button>
  );
}