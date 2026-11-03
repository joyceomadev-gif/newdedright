import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Download, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { parseUploadFile, downloadTemplate } from "@/lib/academics-io";
import { toast } from "sonner";

export interface BulkImportResult {
  ok: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface Props {
  title: string;
  description?: string;
  templateName: string;
  templateHeaders: string[];
  requiredHeaders?: string[];
  /** Process one row at a time; throw to mark as failed. */
  onImportRow: (row: Record<string, string>) => Promise<void>;
  onCompleted?: () => void;
  trigger?: React.ReactNode;
}

export function BulkImportDialog({
  title, description, templateName, templateHeaders, requiredHeaders = [],
  onImportRow, onCompleted, trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const reset = () => { setFile(null); setResult(null); setRunning(false); };

  const handleRun = async () => {
    if (!file) { toast.error("Choose a file first."); return; }
    setRunning(true);
    setResult(null);
    try {
      const rows = await parseUploadFile(file);
      if (rows.length === 0) throw new Error("File is empty.");

      const errors: BulkImportResult["errors"] = [];
      let ok = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const missing = requiredHeaders.filter((h) => !r[h.toLowerCase()]);
        if (missing.length) {
          errors.push({ row: i + 2, message: `Missing: ${missing.join(", ")}` });
          continue;
        }
        try {
          await onImportRow(r);
          ok++;
        } catch (e) {
          errors.push({ row: i + 2, message: (e as Error).message });
        }
      }
      const res = { ok, failed: errors.length, errors };
      setResult(res);
      if (ok > 0) onCompleted?.();
      toast[res.failed ? "warning" : "success"](`Imported ${ok}, failed ${res.failed}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline"><Upload className="h-4 w-4 mr-1" />Bulk upload</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Upload an Excel (.xlsx) or CSV file. Column headers must match the template."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-md border p-3 bg-muted/30">
            <div className="text-sm">
              <div className="font-medium">Template</div>
              <div className="text-xs text-muted-foreground">
                Headers: {templateHeaders.join(", ")}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => downloadTemplate(templateName, templateHeaders)}>
              <Download className="h-4 w-4 mr-1" />Template
            </Button>
          </div>

          <div>
            <label className="text-sm font-medium">File</label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              disabled={running}
            />
            {requiredHeaders.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: {requiredHeaders.join(", ")}
              </p>
            )}
          </div>

          {result && (
            <div className="rounded-md border p-3 space-y-2 max-h-64 overflow-y-auto">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />Imported: {result.ok}
                </span>
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-4 w-4" />Failed: {result.failed}
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs space-y-1">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <div key={i} className="text-destructive">
                      Row {e.row}: {e.message}
                    </div>
                  ))}
                  {result.errors.length > 50 && (
                    <div className="text-muted-foreground">…and {result.errors.length - 50} more.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Close</Button>
          <Button onClick={handleRun} disabled={!file || running}>
            {running ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing…</> : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
