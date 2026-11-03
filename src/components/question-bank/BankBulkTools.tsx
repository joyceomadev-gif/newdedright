import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/hooks/usePermissions";
import { bankActionAllowed } from "@/lib/question-bank-editor";
import { filteredBankQuery, type BankCatalog } from "@/lib/question-bank-query";
import { bankExportFilename, bankExportRows } from "@/lib/question-bank-export";
import { removeBankQuestion } from "@/lib/question-bank-mutations";
import type { BankFilters } from "@/lib/question-bank";

export function useBankDeleteAllowed() {
  const { isStaff } = useAuth();
  const p = usePermissions();
  return (
    !p.isLoading &&
    bankActionAllowed(
      isStaff,
      p.canAccess("exams", "delete"),
      p.canAccessSubmodule("exams", "question-bank", "delete"),
    )
  );
}

export function BankExportButton({ filters, catalog }: { filters: BankFilters; catalog: BankCatalog }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const all = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await filteredBankQuery(filters)
          .order("section_order", { nullsFirst: false })
          .order("question_number", { nullsFirst: false })
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        all.push(...(data ?? []));
        if ((data?.length ?? 0) < 1000) break;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bankExportRows(all, catalog)), "Questions");
      XLSX.writeFile(wb, bankExportFilename(filters));
      toast.success(`Exported ${all.length} question(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" onClick={() => void run()} disabled={busy}>
      <Download className="h-4 w-4 mr-2" />
      {busy ? "Exporting…" : "Excel"}
    </Button>
  );
}

export function BankBulkDelete({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await removeBankQuestion(id);
        ok++;
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["standalone-question-bank"] }),
      qc.invalidateQueries({ queryKey: ["question-bank-list"] }),
    ]);
    setBusy(false);
    setOpen(false);
    onDone();
    if (failed.length) toast.error(`${ok} moved to Recycle Bin; ${failed.length} failed: ${failed[0]}`);
    else toast.success(`${ok} question(s) moved to Recycle Bin.`);
  };
  return (
    <>
      <Button variant="destructive" size="sm" disabled={!ids.length} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete selected ({ids.length})
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ids.length} question(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              They move to the Recycle Bin and can be restored. Existing exams are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
