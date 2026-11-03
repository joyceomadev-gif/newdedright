import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Download, Loader2 } from "lucide-react";
import { parseUploadFile, downloadTemplate, exportToExcel } from "@/lib/academics-io";
import { supabase } from "@/integrations/supabase/client";
import { executeStudentImport, type ExistingStudent, type StudentImportEntry } from "@/lib/student-import";
import { toast } from "sonner";

const headers = ["admission_no", "first_name", "last_name", "full_name", "middle_name", "gender", "date_of_birth", "place_of_birth", "class_name", "address", "phone", "student_login_email", "contact_email_1", "contact_email_2", "contact_phone_1", "contact_phone_2", "nationality", "state_of_origin", "lga", "religion"];
export function StudentImportDialog({ onCompleted }: { onCompleted: () => void }) {
  const [open, setOpen] = useState(false), [running, setRunning] = useState(false);
  const [file, setFile] = useState<File | null>(null), [result, setResult] = useState<StudentImportEntry[] | null>(null);
  async function run() {
    if (!file) return;
    setRunning(true); setResult(null);
    try {
      const rows = await parseUploadFile(file);
      if (!rows.length) throw new Error("File is empty");
      const existing: ExistingStudent[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from("students").select("id,admission_no,full_name,date_of_birth,deleted_at").order("id").range(from, from + 499);
        if (error) throw error;
        existing.push(...(data ?? []));
        if ((data ?? []).length < 500) break;
      }
      const { data: classes, error } = await supabase.from("classes").select("id,name").is("deleted_at", null);
      if (error) throw error;
      const entries = await executeStudentImport(rows, classes ?? [], existing, async (payload) => {
        if ("id" in payload && payload.id) {
          const { id, ...fields } = payload;
          const { error } = await supabase.from("students").update(fields).eq("id", id);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase.from("students").insert(payload);
          if (error) throw new Error(error.message);
        }
      });
      setResult(entries); onCompleted();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setRunning(false); }
  }
  const imported = result?.filter((r) => r.status === "Imported") ?? [];
  const updated = result?.filter((r) => r.status === "Updated") ?? [];
  const saved = [...imported, ...updated];
  return <Dialog open={open} onOpenChange={(o) => { if (!running) setOpen(o); }}>
    <DialogTrigger asChild><Button variant="outline"><Upload className="mr-1 h-4 w-4" />Bulk upload</Button></DialogTrigger>
    <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Bulk admit students</DialogTitle></DialogHeader>
      <div className="flex gap-3 items-center"><Input aria-label="Student import file" type="file" accept=".xlsx,.xls,.csv" disabled={running} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} /><Button variant="outline" onClick={() => downloadTemplate("students-import-template", headers)}><Download className="mr-1 h-4 w-4" />Template</Button></div>
      {result && <div className="space-y-3" aria-label="Student import summary">
        <p className="font-semibold">Total imported: {imported.length} · Updated: {updated.length} · Total skipped: {result.length - saved.length}</p>
        <p>Gender (imported/updated): Male {saved.filter((r) => r.gender === "Male").length} · Female {saved.filter((r) => r.gender === "Female").length} · Empty {saved.filter((r) => r.gender === "Empty").length}</p>
        <Button variant="outline" onClick={() => exportToExcel("student-reimport-results.xlsx", "Results", result, [
          { header: "File row", accessor: (r) => r.row }, { header: "Admission number", accessor: (r) => r.admission },
          { header: "Full name", accessor: (r) => r.name }, { header: "Gender", accessor: (r) => r.gender },
          { header: "Status", accessor: (r) => r.status }, { header: "Reasons", accessor: (r) => r.reasons.join("; ") },
          { header: "Flags", accessor: (r) => r.flags.join("; ") },
        ])}><Download className="mr-1 h-4 w-4" />Download complete report</Button>
        <h3 className="font-semibold">Skipped rows</h3><div className="max-h-48 overflow-y-auto text-sm space-y-2">{result.filter((r) => r.status === "Skipped").map((r) => <p key={r.row}>Row {r.row} · {r.admission} · {r.name}: {r.reasons.join("; ")}</p>)}</div>
        <h3 className="font-semibold">Flagged rows</h3><div className="max-h-48 overflow-y-auto text-sm space-y-2">{result.filter((r) => r.flags.length || r.reasons.some((s) => s.includes("manual decision"))).map((r) => <p key={r.row}>Row {r.row} · {r.name}: {[...r.flags, ...r.reasons.filter((s) => s.includes("manual decision"))].join("; ")}</p>)}</div>
      </div>}
      <DialogFooter><Button variant="outline" disabled={running} onClick={() => setOpen(false)}>Close</Button><Button disabled={!file || running || !!result} onClick={run}>{running ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Importing…</> : "Import"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
