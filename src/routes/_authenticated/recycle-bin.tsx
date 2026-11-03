import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, RotateCcw, Trash2, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { listRecycleBin, restoreRow, hardDeleteRow, type RecycleBinRow } from "@/lib/soft-delete";

export const Route = createFileRoute("/_authenticated/recycle-bin")({
  head: () => ({
    meta: [
      { title: "Recycle Bin — Administration" },
      { name: "description", content: "Super-admin recycle bin: restore or permanently delete records." },
      { property: "og:title", content: "Recycle Bin — School Administration" },
      { property: "og:description", content: "Manage and restore deleted school records with audited actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecycleBinPage,
});

function summarize(snapshot: Record<string, unknown>): string {
  const s = snapshot as Record<string, unknown>;
  const keys = ["title", "name", "full_name", "question_text", "subject", "description", "email"];
  for (const k of keys) {
    const v = s[k];
    if (typeof v === "string" && v.trim()) return v.length > 80 ? v.slice(0, 80) + "…" : v;
  }
  return String(s.id ?? "");
}

function RecycleBinPage() {
  const { user, roles, loading } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("");
  const [confirmHard, setConfirmHard] = useState<RecycleBinRow | null>(null);

  const enabled = !!user && !!isSuperAdmin;

  const { data, isLoading, error } = useQuery({
    queryKey: ["recycle-bin"],
    queryFn: () => listRecycleBin(),
    enabled,
  });

  const rows = data ?? [];

  const tables = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.table_name);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (tableFilter && r.table_name !== tableFilter) return false;
      if (!q) return true;
      return (
        r.table_name.toLowerCase().includes(q) ||
        (r.delete_reason ?? "").toLowerCase().includes(q) ||
        summarize(r.snapshot).toLowerCase().includes(q)
      );
    });
  }, [rows, filter, tableFilter]);

  const restoreMut = useMutation({
    mutationFn: ({ table, id }: { table: string; id: string }) => restoreRow(table, id),
    onSuccess: () => {
      toast.success("Record restored");
      qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    },
    onError: (e: any) => toast.error(e.message || "Restore failed"),
  });

  const hardMut = useMutation({
    mutationFn: ({ table, id, reason }: { table: string; id: string; reason?: string }) =>
      hardDeleteRow(table, id, reason),
    onSuccess: () => {
      toast.success("Record permanently deleted");
      setConfirmHard(null);
      qc.invalidateQueries({ queryKey: ["recycle-bin"] });
    },
    onError: (e: any) => toast.error(e.message || "Permanent delete failed"),
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card className="p-8 text-center space-y-4">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-semibold">Super Admin access required</h1>
          <p className="text-muted-foreground">
            The Recycle Bin can only be viewed and managed by Super Administrators.
          </p>
          <Button asChild variant="outline">
            <Link to="/administration">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Administration
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/administration">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Recycle Bin</h1>
            <Badge variant="secondary">Super Admin only</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Records deleted from the app are held here. Restore to bring them back, or permanently delete to remove for good. Every action is audit-logged.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Search reason, table, or content…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-sm"
          />
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="">All tables ({rows.length})</option>
            {tables.map((t) => (
              <option key={t} value={t}>
                {t} ({rows.filter((r) => r.table_name === t).length})
              </option>
            ))}
          </select>
          <div className="ml-auto text-sm text-muted-foreground">
            {filtered.length} shown
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 text-destructive">
            {(error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            The recycle bin is empty.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={`${r.table_name}:${r.record_id}`}>
                  <TableCell>
                    <Badge variant="outline">{r.table_name}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="truncate" title={summarize(r.snapshot)}>
                      {summarize(r.snapshot)}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.record_id.slice(0, 8)}…
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="text-sm truncate" title={r.delete_reason ?? ""}>
                      {r.delete_reason || <span className="text-muted-foreground italic">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(r.deleted_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        restoreMut.mutate({ table: r.table_name, id: r.record_id })
                      }
                      disabled={restoreMut.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmHard(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete forever
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <AlertDialog open={!!confirmHard} onOpenChange={(o) => !o && setConfirmHard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. A snapshot will be kept in the audit log, but the live record will be removed from the database.
              <div className="mt-3 p-3 rounded bg-muted text-xs font-mono break-all">
                {confirmHard?.table_name} / {confirmHard?.record_id}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                confirmHard &&
                hardMut.mutate({
                  table: confirmHard.table_name,
                  id: confirmHard.record_id,
                  reason: "Permanent delete from Recycle Bin",
                })
              }
            >
              {hardMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
