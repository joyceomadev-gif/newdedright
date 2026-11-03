import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { softDelete } from "@/lib/soft-delete";

export const Route = createFileRoute("/_authenticated/trait-admin")({
  component: TraitAdminPage,
});

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name too long"),
});
const itemSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(120, "Label too long"),
});

interface TraitCategory { id: string; name: string; display_order: number }
interface TraitItem { id: string; category_id: string; label: string; display_order: number }

function TraitAdminPage() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["trait-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trait_categories")
        .select("id,name,display_order")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as TraitCategory[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["trait-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trait_items")
        .select("id,category_id,label,display_order")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as TraitItem[];
    },
  });

  // Default selection
  if (!activeCategoryId && categoriesQ.data?.length) {
    setTimeout(() => setActiveCategoryId(categoriesQ.data![0].id), 0);
  }

  const itemsForActive = useMemo(
    () => (itemsQ.data ?? []).filter((i) => i.category_id === activeCategoryId),
    [itemsQ.data, activeCategoryId],
  );

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <Card className="p-8 text-sm text-center text-muted-foreground">
        You need admin access to manage traits and skills.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Traits & skills setup</h1>
        <p className="text-sm text-muted-foreground">Add, reorder, rename, and remove rating categories and the items inside them.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryPanel
          categories={categoriesQ.data ?? []}
          loading={categoriesQ.isLoading}
          activeId={activeCategoryId}
          onSelect={setActiveCategoryId}
          onChanged={() => qc.invalidateQueries({ queryKey: ["trait-categories"] })}
        />
        <ItemPanel
          activeCategory={(categoriesQ.data ?? []).find((c) => c.id === activeCategoryId) ?? null}
          items={itemsForActive}
          loading={itemsQ.isLoading}
          onChanged={() => qc.invalidateQueries({ queryKey: ["trait-items"] })}
        />
      </div>
    </div>
  );
}

// =====================================================================
// Category panel
// =====================================================================

function CategoryPanel({
  categories, loading, activeId, onSelect, onChanged,
}: {
  categories: TraitCategory[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: TraitCategory } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TraitCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const move = useMutation({
    mutationFn: async ({ a, b }: { a: TraitCategory; b: TraitCategory }) => {
      setBusyId(a.id);
      // Swap display_order via two updates
      const { error: e1 } = await supabase
        .from("trait_categories")
        .update({ display_order: b.display_order })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("trait_categories")
        .update({ display_order: a.display_order })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => { onChanged(); setBusyId(null); },
    onError: (e: Error) => { toast.error(e.message); setBusyId(null); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("trait_categories", id); const error = null as any;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Category deleted.");
      setConfirmDelete(null);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Categories</h2>
        <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="space-y-1">
          {categories.map((c, idx) => {
            const isActive = c.id === activeId;
            return (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${isActive ? "bg-muted/40" : ""}`}
              >
                <button
                  className="flex-1 text-left text-sm font-medium truncate"
                  onClick={() => onSelect(c.id)}
                >
                  <Badge variant="outline" className="mr-2 text-[10px]">{c.display_order}</Badge>
                  {c.name}
                </button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7"
                  disabled={idx === 0 || move.isPending}
                  onClick={() => move.mutate({ a: c, b: categories[idx - 1] })}
                  aria-label="Move up"
                >
                  {busyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7"
                  disabled={idx === categories.length - 1 || move.isPending}
                  onClick={() => move.mutate({ a: c, b: categories[idx + 1] })}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ mode: "edit", row: c })} aria-label="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDelete(c)} aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <CategoryDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        nextOrder={(categories[categories.length - 1]?.display_order ?? 0) + 1}
        onSaved={() => { setDialog(null); onChanged(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" and all its items will be permanently removed. Existing student ratings on those items will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => { e.preventDefault(); if (confirmDelete) del.mutate(confirmDelete.id); }}
            >
              {del.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CategoryDialog({
  dialog, onClose, nextOrder, onSaved,
}: {
  dialog: { mode: "create" | "edit"; row?: TraitCategory } | null;
  onClose: () => void;
  nextOrder: number;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Sync local state when dialog opens
  const key = dialog ? `${dialog.mode}|${dialog.row?.id ?? "new"}` : "";
  const [lastKey, setLastKey] = useState("");
  if (dialog && lastKey !== key) {
    setTimeout(() => {
      setLastKey(key);
      setName(dialog.row?.name ?? "");
      setError(null);
    }, 0);
  }

  const save = useMutation({
    mutationFn: async () => {
      const parsed = categorySchema.safeParse({ name });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Invalid input");
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
      }
      if (dialog?.mode === "edit" && dialog.row) {
        const { error } = await supabase
          .from("trait_categories")
          .update({ name: parsed.data.name })
          .eq("id", dialog.row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("trait_categories")
          .insert({ name: parsed.data.name, display_order: nextOrder });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(dialog?.mode === "edit" ? "Category updated." : "Category added.");
      onSaved();
    },
    onError: (e: Error) => { if (!error) toast.error(e.message); },
  });

  return (
    <Dialog open={!!dialog} onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "edit" ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>Group related rating items under one category.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            maxLength={80}
            onChange={(e) => { setName(e.target.value); setError(null); }}
            placeholder="e.g. Conduct & Work Habit"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Item panel
// =====================================================================

function ItemPanel({
  activeCategory, items, loading, onChanged,
}: {
  activeCategory: TraitCategory | null;
  items: TraitItem[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row?: TraitItem } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TraitItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const move = useMutation({
    mutationFn: async ({ a, b }: { a: TraitItem; b: TraitItem }) => {
      setBusyId(a.id);
      const { error: e1 } = await supabase
        .from("trait_items").update({ display_order: b.display_order }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("trait_items").update({ display_order: a.display_order }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => { onChanged(); setBusyId(null); },
    onError: (e: Error) => { toast.error(e.message); setBusyId(null); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await softDelete("trait_items", id); const error = null as any;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted.");
      setConfirmDelete(null);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Items</h2>
          <p className="text-xs text-muted-foreground">{activeCategory ? activeCategory.name : "Select a category to manage its items."}</p>
        </div>
        <Button size="sm" disabled={!activeCategory} onClick={() => setDialog({ mode: "create" })}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
        </Button>
      </div>

      {!activeCategory ? (
        <p className="text-sm text-muted-foreground">No category selected.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items yet in this category.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it, idx) => (
            <li key={it.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <span className="flex-1 text-sm truncate">
                <Badge variant="outline" className="mr-2 text-[10px]">{it.display_order}</Badge>
                {it.label}
              </span>
              <Button
                size="icon" variant="ghost" className="h-7 w-7"
                disabled={idx === 0 || move.isPending}
                onClick={() => move.mutate({ a: it, b: items[idx - 1] })}
                aria-label="Move up"
              >
                {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="icon" variant="ghost" className="h-7 w-7"
                disabled={idx === items.length - 1 || move.isPending}
                onClick={() => move.mutate({ a: it, b: items[idx + 1] })}
                aria-label="Move down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ mode: "edit", row: it })} aria-label="Edit">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDelete(it)} aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ItemDialog
        dialog={dialog}
        category={activeCategory}
        nextOrder={(items[items.length - 1]?.display_order ?? 0) + 1}
        onClose={() => setDialog(null)}
        onSaved={() => { setDialog(null); onChanged(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.label}" will be permanently removed. Any student ratings on this item will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => { e.preventDefault(); if (confirmDelete) del.mutate(confirmDelete.id); }}
            >
              {del.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ItemDialog({
  dialog, category, nextOrder, onClose, onSaved,
}: {
  dialog: { mode: "create" | "edit"; row?: TraitItem } | null;
  category: TraitCategory | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const key = dialog ? `${dialog.mode}|${dialog.row?.id ?? "new"}` : "";
  const [lastKey, setLastKey] = useState("");
  if (dialog && lastKey !== key) {
    setTimeout(() => {
      setLastKey(key);
      setLabel(dialog.row?.label ?? "");
      setError(null);
    }, 0);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!category) throw new Error("No category selected");
      const parsed = itemSchema.safeParse({ label });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Invalid input");
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
      }
      if (dialog?.mode === "edit" && dialog.row) {
        const { error } = await supabase
          .from("trait_items")
          .update({ label: parsed.data.label })
          .eq("id", dialog.row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("trait_items")
          .insert({ category_id: category.id, label: parsed.data.label, display_order: nextOrder });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(dialog?.mode === "edit" ? "Item updated." : "Item added.");
      onSaved();
    },
    onError: (e: Error) => { if (!error) toast.error(e.message); },
  });

  return (
    <Dialog open={!!dialog} onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialog?.mode === "edit" ? "Edit item" : "Add item"}</DialogTitle>
          <DialogDescription>{category ? `In category: ${category.name}` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            maxLength={120}
            onChange={(e) => { setLabel(e.target.value); setError(null); }}
            placeholder="e.g. Punctuality"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
