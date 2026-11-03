import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Copy, Trash2, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichView } from "@/components/rich/RichView";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/hooks/usePermissions";
import { bankActionAllowed } from "@/lib/question-bank-editor";
import { supabase } from "@/integrations/supabase/client";
import { loadBankRecord, removeBankQuestion, type BankRecord } from "@/lib/question-bank-mutations";
import type { BankCatalog } from "@/lib/question-bank-query";
import { BankQuestionEditor } from "./BankQuestionEditor";

export function BankQuestionActions({ catalog, id }: { catalog: BankCatalog; id?: string }) {
  const { user, isStaff } = useAuth();
  const permissions = usePermissions();
  const qc = useQueryClient();
  const [editor, setEditor] = useState<{ source: BankRecord | null; duplicate: boolean } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowed = (action: "write" | "edit" | "delete") =>
    !permissions.isLoading &&
    bankActionAllowed(
      isStaff,
      permissions.canAccess("exams", action),
      permissions.canAccessSubmodule("exams", "question-bank", action),
    );
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["standalone-question-bank"] }),
      qc.invalidateQueries({ queryKey: ["question-bank-list"] }),
    ]);
  };
  const open = async (duplicate: boolean) => {
    if (!user || !allowed(duplicate || !id ? "write" : "edit")) return;
    setBusy(true);
    try {
      setEditor({ source: id ? await loadBankRecord(id) : null, duplicate });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load question.");
    } finally {
      setBusy(false);
    }
  };
  const revisions = useQuery({
    queryKey: ["standalone-question-bank", user?.id, "revisions", id],
    enabled: history && !!id,
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("question_bank_revisions")
        .select("id,created_at,snapshot")
        .eq("question_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!user) return null;
  return (
    <>
      {!id ? (
        allowed("write") && (
          <Button onClick={() => void open(false)} disabled={busy}>
            <Plus className="h-4 w-4 mr-2" />
            New question
          </Button>
        )
      ) : (
        <div className="flex gap-1">
          {allowed("edit") && (
            <Button
              size="icon"
              variant="ghost"
              title="Edit question"
              aria-label="Edit question"
              disabled={busy}
              onClick={() => void open(false)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {allowed("write") && (
            <Button
              size="icon"
              variant="ghost"
              title="Duplicate question"
              aria-label="Duplicate question"
              disabled={busy}
              onClick={() => void open(true)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            title="Revision history"
            aria-label="Revision history"
            onClick={() => setHistory(true)}
          >
            <History className="h-4 w-4" />
          </Button>
          {allowed("delete") && (
            <Button
              size="icon"
              variant="ghost"
              title="Delete question"
              aria-label="Delete question"
              className="text-destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      {editor && (
        <BankQuestionEditor
          source={editor.source}
          duplicate={editor.duplicate}
          catalog={catalog}
          userId={user.id}
          onClose={() => setEditor(null)}
          onSaved={refresh}
        />
      )}
      <Dialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!busy) setConfirmDelete(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move question to Recycle Bin?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            This removes it from the bank and future random question selection. Existing exam papers
            and results remain unchanged.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!id || !allowed("delete")) return;
                setBusy(true);
                try {
                  await removeBankQuestion(id);
                  await refresh();
                  setConfirmDelete(false);
                  toast.success("Question moved to Recycle Bin.");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Unable to delete question.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Removing…" : "Move to Recycle Bin"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revision history</DialogTitle>
          </DialogHeader>
          {revisions.isPending ? (
            <p>Loading revisions…</p>
          ) : revisions.isError ? (
            <p role="alert">{revisions.error.message}</p>
          ) : !revisions.data.length ? (
            <p>No revisions recorded.</p>
          ) : (
            revisions.data.map((r) => (
              <article key={r.id} className="border-b py-3">
                <p className="text-sm text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
                <RichView
                  content={
                    r.snapshot &&
                    typeof r.snapshot === "object" &&
                    !Array.isArray(r.snapshot) &&
                    typeof r.snapshot.question_text === "string"
                      ? r.snapshot.question_text
                      : "Snapshot unavailable"
                  }
                />
              </article>
            ))
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
