import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, Video, FileText, Newspaper, Plus, Search, ExternalLink, Upload, Wrench, RotateCcw, Trash2, Pencil } from "lucide-react";
import { ExportLibraryDialog } from "@/components/library/export-dialog";
import { softDelete } from "@/lib/soft-delete";
import { SessionSelect, useCurrentSessionId } from "@/components/SessionSelect";

export const Route = createFileRoute("/_authenticated/library")({
  component: LibraryPage,
});

type ResourceType = "pdf" | "ebook" | "journal" | "video" | "article" | "other";
type AllocStatus = "allocated" | "returned" | "overdue" | "lost";
type Condition = "new" | "good" | "fair" | "poor" | "out_of_service";

interface BookRow { id: string; title: string; author: string | null; isbn: string | null; category: string | null; total_copies: number; available_copies: number; }
interface ResourceRow { id: string; title: string; type: ResourceType; category: string | null; author: string | null; description: string | null; file_url: string | null; external_url: string | null; thumbnail_url: string | null; duration_minutes: number | null; view_count: number; created_at: string; }
interface LoanRow { id: string; book_id: string; borrower_id: string; borrowed_date: string; due_date: string; returned_date: string | null; fine_amount: number; fine_paid: boolean; fine_note: string | null; library_books?: { title: string } | null; profiles?: { full_name: string | null } | null; }
interface EquipmentRow { id: string; name: string; category: string | null; serial_number: string | null; location: string | null; condition: Condition; total_quantity: number; available_quantity: number; notes: string | null; }
interface AllocRow { id: string; equipment_id: string; allocated_to: string; quantity: number; allocated_date: string; due_date: string | null; returned_date: string | null; status: AllocStatus; purpose: string | null; equipment?: { name: string } | null; profiles?: { full_name: string | null } | null; }

function LibraryPage() {
  const { isStaff, user } = useAuth();
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Library &amp; Resources</h1>
          <p className="text-sm text-muted-foreground">Books, digital library, video lectures, borrowing and equipment.</p>
        </div>
        {isStaff && <ExportLibraryDialog />}
      </header>
      <Tabs defaultValue="digital" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="digital"><FileText className="h-4 w-4 mr-1.5" />Digital library</TabsTrigger>
          <TabsTrigger value="videos"><Video className="h-4 w-4 mr-1.5" />Video lectures</TabsTrigger>
          <TabsTrigger value="books"><BookOpen className="h-4 w-4 mr-1.5" />Books</TabsTrigger>
          <TabsTrigger value="loans"><RotateCcw className="h-4 w-4 mr-1.5" />Borrow</TabsTrigger>
          <TabsTrigger value="equipment"><Wrench className="h-4 w-4 mr-1.5" />Equipment</TabsTrigger>
        </TabsList>
        <TabsContent value="digital"><ResourcesTab kinds={["pdf","ebook","journal","article","other"]} canManage={isStaff} /></TabsContent>
        <TabsContent value="videos"><ResourcesTab kinds={["video"]} canManage={isStaff} videoOnly /></TabsContent>
        <TabsContent value="books"><BooksTab canManage={isStaff} userId={user?.id ?? null} /></TabsContent>
        <TabsContent value="loans"><LoansTab canManage={isStaff} /></TabsContent>
        <TabsContent value="equipment"><EquipmentTab canManage={isStaff} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Digital resources / videos -------------------- */
function ResourcesTab({ kinds, canManage, videoOnly }: { kinds: ResourceType[]; canManage: boolean; videoOnly?: boolean }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["library_resources", kinds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("library_resources").select("*").in("type", kinds).order("created_at", { ascending: false });
      if (error) throw error;
      return data as ResourceRow[];
    },
  });

  const filtered = useMemo(() => data.filter(r => !q || r.title.toLowerCase().includes(q.toLowerCase()) || (r.author ?? "").toLowerCase().includes(q.toLowerCase()) || (r.category ?? "").toLowerCase().includes(q.toLowerCase())), [data, q]);

  const del = useMutation({
    mutationFn: async (id: string) => { await softDelete("library_resources", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["library_resources"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const incView = async (id: string, current: number) => {
    await supabase.from("library_resources").update({ view_count: current + 1 }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["library_resources"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources..." className="pl-9" />
        </div>
        {canManage && (
          <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
            <DialogTrigger asChild><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add resource</Button></DialogTrigger>
            <ResourceDialog videoOnly={videoOnly} editing={editing} onClose={() => { setOpen(false); setEditing(null); }} onSaved={() => qc.invalidateQueries({ queryKey: ["library_resources"] })} />
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No resources yet.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(r => (
            <Card key={r.id} className="overflow-hidden flex flex-col">
              <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                {r.thumbnail_url ? (
                  <img src={r.thumbnail_url} alt={r.title} className="w-full h-full object-cover" />
                ) : r.type === "video" ? <Video className="h-10 w-10 text-muted-foreground" /> : <FileText className="h-10 w-10 text-muted-foreground" />}
              </div>
              <div className="p-4 space-y-2 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight line-clamp-2">{r.title}</h3>
                  <Badge variant="secondary" className="capitalize shrink-0">{r.type}</Badge>
                </div>
                {r.author && <p className="text-xs text-muted-foreground">{r.author}</p>}
                {r.description && <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-2">
                  <span>{r.view_count} views</span>
                  {r.duration_minutes ? <span>{r.duration_minutes} min</span> : r.category ? <span>{r.category}</span> : null}
                </div>
                <div className="flex gap-2 pt-1">
                  {(r.file_url || r.external_url) && (
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1"
                      onClick={async () => {
                        incView(r.id, r.view_count);
                        let target = r.external_url;
                        if (r.file_url) {
                          target = await getSignedUrl("library-files", r.file_url) ?? r.external_url;
                        }
                        if (target) window.open(target, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />Open
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete?")) del.mutate(r.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceDialog({ editing, onClose, onSaved, videoOnly }: { editing: ResourceRow | null; onClose: () => void; onSaved: () => void; videoOnly?: boolean }) {
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    type: (editing?.type ?? (videoOnly ? "video" : "pdf")) as ResourceType,
    category: editing?.category ?? "",
    author: editing?.author ?? "",
    description: editing?.description ?? "",
    file_url: editing?.file_url ?? "",
    external_url: editing?.external_url ?? "",
    thumbnail_url: editing?.thumbnail_url ?? "",
    duration_minutes: editing?.duration_minutes ?? null,
  });
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File, field: "file_url" | "thumbnail_url") => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${field}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("library-files").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("library-files").getPublicUrl(path);
      setForm(f => ({ ...f, [field]: data.publicUrl }));
      toast.success("Uploaded");
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null };
      if (editing) {
        const { error } = await supabase.from("library_resources").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("library_resources").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit" : "Add"} resource</DialogTitle>
        <DialogDescription>Upload a file or link to an external URL.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ResourceType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["pdf","ebook","journal","video","article","other"] as ResourceType[]).map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Mathematics" /></div>
        </div>
        <div><Label>Author / Publisher</Label><Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
        <div>
          <Label>File upload</Label>
          <div className="flex gap-2 items-center">
            <Input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "file_url"); }} disabled={uploading} />
          </div>
          {form.file_url && <p className="text-xs text-muted-foreground mt-1 truncate">✓ {form.file_url}</p>}
        </div>
        <div><Label>Or external URL (YouTube, Vimeo, etc.)</Label><Input value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://..." /></div>
        <div>
          <Label>Thumbnail</Label>
          <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, "thumbnail_url"); }} disabled={uploading} />
          {form.thumbnail_url && <p className="text-xs text-muted-foreground mt-1 truncate">✓ {form.thumbnail_url}</p>}
        </div>
        {form.type === "video" && <div><Label>Duration (minutes)</Label><Input type="number" value={form.duration_minutes ?? ""} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value ? Number(e.target.value) : null })} /></div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title || uploading}><Upload className="h-4 w-4 mr-1" />Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* -------------------- Books -------------------- */
function BooksTab({ canManage, userId }: { canManage: boolean; userId: string | null }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BookRow | null>(null);
  const [borrowing, setBorrowing] = useState<BookRow | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["library_books"],
    queryFn: async () => {
      const { data, error } = await supabase.from("library_books").select("*").order("title");
      if (error) throw error;
      return data as BookRow[];
    },
  });

  const filtered = data.filter(b => !q || b.title.toLowerCase().includes(q.toLowerCase()) || (b.author ?? "").toLowerCase().includes(q.toLowerCase()));

  const del = useMutation({
    mutationFn: async (id: string) => { await softDelete("library_books", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["library_books"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const borrowSessionId = useCurrentSessionId();
  const borrow = useMutation({
    mutationFn: async (book: BookRow) => {
      if (!userId) throw new Error("Not signed in");
      if (book.available_copies <= 0) throw new Error("No copies available");
      const due = new Date(); due.setDate(due.getDate() + 14);
      const { error } = await supabase.from("book_loans").insert({ book_id: book.id, borrower_id: userId, due_date: due.toISOString().slice(0, 10), ...(borrowSessionId ? { academic_session_id: borrowSessionId } : {}) });
      if (error) throw error;
      await supabase.from("library_books").update({ available_copies: book.available_copies - 1 }).eq("id", book.id);
    },
    onSuccess: () => { toast.success("Borrowed — due in 14 days"); qc.invalidateQueries({ queryKey: ["library_books"] }); qc.invalidateQueries({ queryKey: ["book_loans"] }); setBorrowing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search books..." className="pl-9" />
        </div>
        {canManage && (
          <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
            <DialogTrigger asChild><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add book</Button></DialogTrigger>
            <BookDialog editing={editing} onClose={() => { setOpen(false); setEditing(null); }} onSaved={() => qc.invalidateQueries({ queryKey: ["library_books"] })} />
          </Dialog>
        )}
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Title</TableHead><TableHead>Author</TableHead><TableHead>Category</TableHead><TableHead>ISBN</TableHead><TableHead>Available</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No books</TableCell></TableRow> :
              filtered.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.title}</TableCell>
                  <TableCell>{b.author ?? "—"}</TableCell>
                  <TableCell>{b.category ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{b.isbn ?? "—"}</TableCell>
                  <TableCell><Badge variant={b.available_copies > 0 ? "default" : "destructive"}>{b.available_copies}/{b.total_copies}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {!canManage && userId && (
                      <Button size="sm" variant="outline" disabled={b.available_copies <= 0 || borrow.isPending} onClick={() => setBorrowing(b)}>
                        Borrow
                      </Button>
                    )}
                    {canManage && <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(b)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) del.mutate(b.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!borrowing} onOpenChange={(o) => !o && setBorrowing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrow “{borrowing?.title}”</DialogTitle>
            <DialogDescription>You will borrow one copy with a 14-day return window.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrowing(null)}>Cancel</Button>
            <Button onClick={() => borrowing && borrow.mutate(borrowing)} disabled={borrow.isPending}>Confirm borrow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookDialog({ editing, onClose, onSaved }: { editing: BookRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    author: editing?.author ?? "",
    isbn: editing?.isbn ?? "",
    category: editing?.category ?? "",
    total_copies: editing?.total_copies ?? 1,
    available_copies: editing?.available_copies ?? 1,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (editing) { const { error } = await supabase.from("library_books").update(form).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("library_books").insert(form); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} book</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Author</Label><Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
        </div>
        <div><Label>ISBN</Label><Input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total copies</Label><Input type="number" value={form.total_copies} onChange={(e) => setForm({ ...form, total_copies: Number(e.target.value) })} /></div>
          <div><Label>Available</Label><Input type="number" value={form.available_copies} onChange={(e) => setForm({ ...form, available_copies: Number(e.target.value) })} /></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !form.title}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

/* -------------------- Loans -------------------- */
function LoansTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fining, setFining] = useState<LoanRow | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const { data = [] } = useQuery({
    queryKey: ["book_loans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("book_loans").select("*, library_books:book_id(title)").order("borrowed_date", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as LoanRow[];
      const ids = Array.from(new Set(rows.map(r => r.borrower_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = new Map((profs ?? []).map(p => [p.id, p.full_name]));
        rows.forEach(r => { r.profiles = { full_name: map.get(r.borrower_id) ?? null }; });
      }
      return rows;
    },
  });

  const isOverdue = (l: LoanRow) => !l.returned_date && l.due_date < today;
  const overdueLoans = useMemo(() => data.filter(isOverdue), [data, today]);
  const fines = useMemo(() => data.filter(l => l.fine_amount > 0), [data]);
  const totalOutstanding = fines.filter(f => !f.fine_paid).reduce((s, f) => s + Number(f.fine_amount), 0);

  const ret = useMutation({
    mutationFn: async (loan: LoanRow) => {
      const { error } = await supabase.from("book_loans").update({ returned_date: today }).eq("id", loan.id);
      if (error) throw error;
      const { data: book } = await supabase.from("library_books").select("available_copies").eq("id", loan.book_id).single();
      if (book) await supabase.from("library_books").update({ available_copies: book.available_copies + 1 }).eq("id", loan.book_id);
    },
    onSuccess: () => { toast.success("Returned"); qc.invalidateQueries({ queryKey: ["book_loans"] }); qc.invalidateQueries({ queryKey: ["library_books"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaid = useMutation({
    mutationFn: async (loan: LoanRow) => {
      const { error } = await supabase.from("book_loans").update({ fine_paid: !loan.fine_paid }).eq("id", loan.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["book_loans"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Active borrows</p><p className="text-2xl font-semibold">{data.filter(l => !l.returned_date).length}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-2xl font-semibold text-destructive">{overdueLoans.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Outstanding fines</p><p className="text-2xl font-semibold">{totalOutstanding.toFixed(2)}</p></Card>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">All borrow records</h2>
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New borrow</Button></DialogTrigger>
              <LoanDialog onClose={() => setOpen(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["book_loans"] }); qc.invalidateQueries({ queryKey: ["library_books"] }); }} />
            </Dialog>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Book</TableHead><TableHead>Borrower</TableHead><TableHead>Borrowed</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Fine</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {data.length === 0 ? <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">No borrow records</TableCell></TableRow> :
                data.map(l => {
                  const overdue = isOverdue(l);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.library_books?.title ?? "—"}</TableCell>
                      <TableCell>{l.profiles?.full_name ?? l.borrower_id.slice(0, 8)}</TableCell>
                      <TableCell>{l.borrowed_date}</TableCell>
                      <TableCell>{l.due_date}</TableCell>
                      <TableCell>{l.returned_date ? <Badge variant="secondary">Returned</Badge> : overdue ? <Badge variant="destructive">Overdue</Badge> : <Badge>Active</Badge>}</TableCell>
                      <TableCell>{l.fine_amount > 0 ? <Badge variant={l.fine_paid ? "secondary" : "destructive"}>{Number(l.fine_amount).toFixed(2)} {l.fine_paid ? "paid" : "due"}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      {canManage && <TableCell className="text-right space-x-1">
                        {!l.returned_date && <Button size="sm" variant="outline" onClick={() => ret.mutate(l)}><RotateCcw className="h-3.5 w-3.5 mr-1" />Return</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setFining(l)}>Fine</Button>
                      </TableCell>}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Fines</h2>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Borrower</TableHead><TableHead>Book</TableHead><TableHead>Amount</TableHead><TableHead>Note</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {fines.length === 0 ? <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-8">No fines recorded</TableCell></TableRow> :
                fines.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>{f.profiles?.full_name ?? f.borrower_id.slice(0, 8)}</TableCell>
                    <TableCell>{f.library_books?.title ?? "—"}</TableCell>
                    <TableCell>{Number(f.fine_amount).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.fine_note ?? "—"}</TableCell>
                    <TableCell>{f.fine_paid ? <Badge variant="secondary">Paid</Badge> : <Badge variant="destructive">Unpaid</Badge>}</TableCell>
                    {canManage && <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => togglePaid.mutate(f)}>{f.fine_paid ? "Mark unpaid" : "Mark paid"}</Button>
                    </TableCell>}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={!!fining} onOpenChange={(o) => !o && setFining(null)}>
        {fining && <FineDialog loan={fining} onClose={() => setFining(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["book_loans"] })} />}
      </Dialog>
    </div>
  );
}

function FineDialog({ loan, onClose, onSaved }: { loan: LoanRow; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState<number>(Number(loan.fine_amount) || 0);
  const [note, setNote] = useState(loan.fine_note ?? "");
  const [paid, setPaid] = useState(loan.fine_paid);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("book_loans").update({ fine_amount: amount, fine_note: note || null, fine_paid: paid }).eq("id", loan.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Fine recorded"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record fine</DialogTitle><DialogDescription>{loan.library_books?.title} — {loan.profiles?.full_name ?? "borrower"}</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div><Label>Amount</Label><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 7 days overdue" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />Marked as paid</label>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function LoanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [bookId, setBookId] = useState("");
  const [borrowerId, setBorrowerId] = useState("");
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); });
  const [loanSessionId, setLoanSessionId] = useState<string>("");

  const { data: books = [] } = useQuery({
    queryKey: ["loan-books"],
    queryFn: async () => { const { data } = await supabase.from("library_books").select("id, title, available_copies").gt("available_copies", 0); return data ?? []; },
  });
  const { data: people = [] } = useQuery({
    queryKey: ["loan-people"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("id, full_name").order("full_name").limit(500); return data ?? []; },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("book_loans").insert({ book_id: bookId, borrower_id: borrowerId, due_date: dueDate, ...(loanSessionId ? { academic_session_id: loanSessionId } : {}) });
      if (error) throw error;
      const { data: book } = await supabase.from("library_books").select("available_copies").eq("id", bookId).single();
      if (book) await supabase.from("library_books").update({ available_copies: Math.max(0, book.available_copies - 1) }).eq("id", bookId);
    },
    onSuccess: () => { toast.success("Borrow record created"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New borrow record</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <SessionSelect value={loanSessionId} onChange={setLoanSessionId} />
        <div>
          <Label>Book</Label>
          <Select value={bookId} onValueChange={setBookId}>
            <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
            <SelectContent>{books.map((b: { id: string; title: string; available_copies: number }) => <SelectItem key={b.id} value={b.id}>{b.title} ({b.available_copies})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Borrower</Label>
          <Select value={borrowerId} onValueChange={setBorrowerId}>
            <SelectTrigger><SelectValue placeholder="Select borrower" /></SelectTrigger>
            <SelectContent>{people.map((p: { id: string; full_name: string | null }) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Due date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!bookId || !borrowerId || save.isPending}>Create</Button></DialogFooter>
    </DialogContent>
  );
}

/* -------------------- Equipment -------------------- */
function EquipmentTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState<EquipmentRow | null>(null);
  const [editing, setEditing] = useState<EquipmentRow | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment"],
    queryFn: async () => { const { data, error } = await supabase.from("equipment").select("*").order("name"); if (error) throw error; return data as EquipmentRow[]; },
  });
  const { data: allocs = [] } = useQuery({
    queryKey: ["equipment_allocations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment_allocations").select("*, equipment:equipment_id(name)").order("allocated_date", { ascending: false }).limit(50);
      if (error) throw error;
      const rows = (data ?? []) as AllocRow[];
      const ids = Array.from(new Set(rows.map(r => r.allocated_to)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = new Map((profs ?? []).map(p => [p.id, p.full_name]));
        rows.forEach(r => { r.profiles = { full_name: map.get(r.allocated_to) ?? null }; });
      }
      return rows;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await softDelete("equipment", id); const error = null as any; if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["equipment"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ret = useMutation({
    mutationFn: async (a: AllocRow) => {
      const { error } = await supabase.from("equipment_allocations").update({ returned_date: new Date().toISOString().slice(0, 10), status: "returned" as AllocStatus }).eq("id", a.id);
      if (error) throw error;
      const { data: eq } = await supabase.from("equipment").select("available_quantity").eq("id", a.equipment_id).single();
      if (eq) await supabase.from("equipment").update({ available_quantity: eq.available_quantity + a.quantity }).eq("id", a.equipment_id);
    },
    onSuccess: () => { toast.success("Returned"); qc.invalidateQueries({ queryKey: ["equipment_allocations"] }); qc.invalidateQueries({ queryKey: ["equipment"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Equipment & resources</h2>
          {canManage && (
            <Dialog open={open || !!editing} onOpenChange={(o) => { if (!o) { setOpen(false); setEditing(null); } }}>
              <DialogTrigger asChild><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add equipment</Button></DialogTrigger>
              <EquipmentDialog editing={editing} onClose={() => { setOpen(false); setEditing(null); }} onSaved={() => qc.invalidateQueries({ queryKey: ["equipment"] })} />
            </Dialog>
          )}
        </div>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Location</TableHead><TableHead>Condition</TableHead><TableHead>Available</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {equipment.length === 0 ? <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-8">No equipment</TableCell></TableRow> :
                equipment.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell>{e.category ?? "—"}</TableCell>
                    <TableCell>{e.location ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{e.condition.replace("_", " ")}</Badge></TableCell>
                    <TableCell><Badge variant={e.available_quantity > 0 ? "default" : "destructive"}>{e.available_quantity}/{e.total_quantity}</Badge></TableCell>
                    {canManage && <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setAllocOpen(e)} disabled={e.available_quantity <= 0}>Allocate</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) del.mutate(e.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {allocOpen && (
        <Dialog open={!!allocOpen} onOpenChange={(o) => !o && setAllocOpen(null)}>
          <AllocationDialog equipment={allocOpen} onClose={() => setAllocOpen(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["equipment_allocations"] }); qc.invalidateQueries({ queryKey: ["equipment"] }); }} />
        </Dialog>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Recent allocations</h2>
        <Card>
          <Table>
            <TableHeader><TableRow><TableHead>Equipment</TableHead><TableHead>Allocated to</TableHead><TableHead>Qty</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {allocs.length === 0 ? <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-8">No allocations</TableCell></TableRow> :
                allocs.map(a => {
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = a.status === "allocated" && a.due_date && a.due_date < today;
                  const display: AllocStatus = overdue ? "overdue" : a.status;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.equipment?.name ?? "—"}</TableCell>
                      <TableCell>{a.profiles?.full_name ?? a.allocated_to.slice(0, 8)}</TableCell>
                      <TableCell>{a.quantity}</TableCell>
                      <TableCell>{a.allocated_date}</TableCell>
                      <TableCell>{a.due_date ?? "—"}</TableCell>
                      <TableCell><Badge variant={display === "returned" ? "secondary" : display === "overdue" || display === "lost" ? "destructive" : "default"} className="capitalize">{display}</Badge></TableCell>
                      {canManage && <TableCell className="text-right">{a.status === "allocated" && <Button size="sm" variant="outline" onClick={() => ret.mutate(a)}><RotateCcw className="h-3.5 w-3.5 mr-1" />Return</Button>}</TableCell>}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function EquipmentDialog({ editing, onClose, onSaved }: { editing: EquipmentRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    category: editing?.category ?? "",
    serial_number: editing?.serial_number ?? "",
    location: editing?.location ?? "",
    condition: (editing?.condition ?? "good") as Condition,
    total_quantity: editing?.total_quantity ?? 1,
    available_quantity: editing?.available_quantity ?? 1,
    notes: editing?.notes ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (editing) { const { error } = await supabase.from("equipment").update(form).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("equipment").insert(form); if (error) throw error; }
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} equipment</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Lab, Sports" /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Serial number</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
          <div>
            <Label>Condition</Label>
            <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v as Condition })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["new","good","fair","poor","out_of_service"] as Condition[]).map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total quantity</Label><Input type="number" value={form.total_quantity} onChange={(e) => setForm({ ...form, total_quantity: Number(e.target.value) })} /></div>
          <div><Label>Available</Label><Input type="number" value={form.available_quantity} onChange={(e) => setForm({ ...form, available_quantity: Number(e.target.value) })} /></div>
        </div>
        <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Save</Button></DialogFooter>
    </DialogContent>
  );
}

function AllocationDialog({ equipment, onClose, onSaved }: { equipment: EquipmentRow; onClose: () => void; onSaved: () => void }) {
  const [allocatedTo, setAllocatedTo] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [dueDate, setDueDate] = useState("");
  const [purpose, setPurpose] = useState("");

  const { data: people = [] } = useQuery({
    queryKey: ["alloc-staff"],
    queryFn: async () => {
      const { data } = await supabase.from("staff").select("user_id, full_name").eq("is_active", true).not("user_id", "is", null).order("full_name").limit(500);
      return (data ?? []).filter((s): s is { user_id: string; full_name: string } => !!s.user_id);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (quantity > equipment.available_quantity) throw new Error(`Cannot allocate ${quantity}; only ${equipment.available_quantity} available`);
      if (quantity <= 0) throw new Error("Quantity must be positive");
      const { error } = await supabase.from("equipment_allocations").insert({ equipment_id: equipment.id, allocated_to: allocatedTo, quantity, due_date: dueDate || null, purpose });
      if (error) throw error;
      await supabase.from("equipment").update({ available_quantity: equipment.available_quantity - quantity }).eq("id", equipment.id);
    },
    onSuccess: () => { toast.success("Allocated"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Allocate {equipment.name}</DialogTitle><DialogDescription>{equipment.available_quantity} available</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Allocate to staff</Label>
          <Select value={allocatedTo} onValueChange={setAllocatedTo}>
            <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
            <SelectContent>{people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Quantity</Label><Input type="number" min={1} max={equipment.available_quantity} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
          <div><Label>Due date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>
        <div><Label>Purpose</Label><Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => save.mutate()} disabled={!allocatedTo || save.isPending}>Allocate</Button></DialogFooter>
    </DialogContent>
  );
}
