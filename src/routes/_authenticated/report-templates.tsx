import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Copy, Pencil, Eye, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { softDelete } from "@/lib/soft-delete";
import {
  TEMPLATE_PRESETS,
  NURSERY_RATING,
  DEFAULT_GRADE_SCALE,
  type TemplateLayout,
} from "@/lib/report-templates-defaults";
import { UnifiedReportCard } from "@/components/report-card/UnifiedReportCard";

export const Route = createFileRoute("/_authenticated/report-templates")({
  component: ReportTemplatesPage,
});

interface TemplateRow {
  id: string;
  name: string;
  code: string | null;
  section: string | null;
  class_id: string | null;
  term_id: string | null;
  session_id: string | null;
  status: string;
  layout: TemplateLayout;
  notes: string | null;
  updated_at: string;
}
interface ClassRow { id: string; name: string }
interface TermRow  { id: string; name: string; session_id: string }
interface SessRow  { id: string; name: string; is_current: boolean }

const SECTIONS = ["nursery", "primary", "secondary"] as const;

function emptyLayout(): TemplateLayout {
  return {
    kind: "competency",
    header: { schoolName: "", tagline: "" },
    ratingScale: [...NURSERY_RATING],
    competencyAreas: [],
    comments: {
      teacherPrompt: "Class teacher's comment",
      principalPrompt: "Head teacher's comment",
      showAttendance: true,
      showNextTermDate: true,
    },
  };
}

function ReportTemplatesPage() {
  const { roles } = useAuth();
  const isAdmin = roles.some((r) => ["super_admin", "admin", "admin1", "admin2", "admin3"].includes(r));
  const qc = useQueryClient();

  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);
  const [previewing, setPreviewing] = useState<TemplateRow | null>(null);
  const [filterSection, setFilterSection] = useState<string>("all");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_templates")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TemplateRow[];
    },
  });
  const { data: classes = [] } = useQuery({
    queryKey: ["classes-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").is("deleted_at", null).order("name");
      if (error) throw error;
      return (data ?? []) as ClassRow[];
    },
  });
  const { data: terms = [] } = useQuery({
    queryKey: ["terms-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,session_id").order("start_date");
      if (error) throw error;
      return (data ?? []) as TermRow[];
    },
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sessions").select("id,name,is_current").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (row: Partial<TemplateRow>) => {
      if (!row.name?.trim()) throw new Error("Template name is required");
      const payload = {
        name: row.name!.trim(),
        code: row.code ?? null,
        section: row.section ?? null,
        class_id: row.class_id ?? null,
        term_id: row.term_id ?? null,
        session_id: row.session_id ?? null,
        status: row.status ?? "active",
        layout: (row.layout ?? emptyLayout()) as unknown as never,
        notes: row.notes ?? null,
      };
      if (row.id) {
        const { error } = await supabase.from("report_templates").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("report_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["report-templates"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (row: TemplateRow) => {
      const { error } = await supabase.from("report_templates").insert({
        name: row.name + " (Copy)",
        code: row.code,
        section: row.section,
        class_id: row.class_id,
        term_id: row.term_id,
        session_id: row.session_id,
        status: "draft",
        layout: row.layout as unknown as never,
        notes: row.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duplicated");
      qc.invalidateQueries({ queryKey: ["report-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async (row: TemplateRow) => {
      const next = row.status === "active" ? "archived" : "active";
      const { error } = await supabase.from("report_templates").update({ status: next }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (row: TemplateRow) => softDelete("report_templates", row.id),
    onSuccess: () => {
      toast.success("Template moved to recycle bin");
      qc.invalidateQueries({ queryKey: ["report-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(
    () => templates.filter((t) => filterSection === "all" || t.section === filterSection),
    [templates, filterSection],
  );

  const classById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c.name])), [classes]);
  const termById  = useMemo(() => Object.fromEntries(terms.map((t) => [t.id, t.name])), [terms]);

  if (!isAdmin) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Only administrators can manage report templates.</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to="/administration"><ArrowLeft className="h-4 w-4 mr-1" /> Administration</Link>
        </Button>
        <h1 className="text-xl font-semibold">Report Templates</h1>
        <div className="ml-auto flex items-center gap-2">
          <Select value={filterSection} onValueChange={setFilterSection}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setEditing({ layout: emptyLayout(), status: "active" })}>
            <Plus className="h-4 w-4 mr-1" /> New template
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="text-xs text-muted-foreground mb-2">Quick start from a preset:</div>
        <div className="flex gap-2 flex-wrap">
          {TEMPLATE_PRESETS.map((p) => (
            <Button key={p.id} size="sm" variant="outline"
              onClick={() => setEditing({
                name: p.label, section: p.section, status: "draft", layout: p.layout,
              })}
            >{p.label}</Button>
          ))}
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                No templates yet. Start from a preset above.
              </TableCell></TableRow>
            ) : filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell><Badge variant="secondary">{t.section ?? "any"}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.class_id ? classById[t.class_id] ?? "class" : "any class"} · {t.term_id ? termById[t.term_id] ?? "term" : "any term"}
                </TableCell>
                <TableCell><Badge variant="outline">{t.layout?.kind ?? "—"}</Badge></TableCell>
                <TableCell>
                  <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setPreviewing(t)} title="Preview"><Eye className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(t)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => duplicate.mutate(t)} title="Duplicate"><Copy className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => archive.mutate(t)}>
                      {t.status === "active" ? "Archive" : "Activate"}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm("Move template to recycle bin?")) remove.mutate(t);
                    }} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {editing && (
        <TemplateEditor
          value={editing}
          classes={classes}
          terms={terms}
          sessions={sessions}
          onCancel={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          saving={save.isPending}
        />
      )}
      {previewing && (
        <TemplatePreviewDialog template={previewing} onClose={() => setPreviewing(null)} />
      )}
    </div>
  );
}

function TemplateEditor({
  value, classes, terms, sessions, onCancel, onSave, saving,
}: {
  value: Partial<TemplateRow>;
  classes: ClassRow[]; terms: TermRow[]; sessions: SessRow[];
  onCancel: () => void;
  onSave: (v: Partial<TemplateRow>) => void;
  saving: boolean;
}) {
  const [row, setRow] = useState<Partial<TemplateRow>>(value);
  const layout = row.layout ?? emptyLayout();
  const setLayout = (l: TemplateLayout) => setRow({ ...row, layout: l });

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.id ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Configure layout, competencies or grade scale, and comments.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="meta">
          <TabsList>
            <TabsTrigger value="meta">Details</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
            <TabsTrigger value="grading">Grading</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="json">Advanced JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="meta" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Name *</Label>
                <Input value={row.name ?? ""} onChange={(e) => setRow({ ...row, name: e.target.value })} placeholder="e.g. Nursery – Glitters 1" />
              </div>
              <div><Label>Code</Label>
                <Input value={row.code ?? ""} onChange={(e) => setRow({ ...row, code: e.target.value })} placeholder="Optional short code" />
              </div>
              <div><Label>Section</Label>
                <Select value={row.section ?? "any"} onValueChange={(v) => setRow({ ...row, section: v === "any" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any section</SelectItem>
                    {SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Class</Label>
                <Select value={row.class_id ?? "any"} onValueChange={(v) => setRow({ ...row, class_id: v === "any" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any class</SelectItem>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Term</Label>
                <Select value={row.term_id ?? "any"} onValueChange={(v) => setRow({ ...row, term_id: v === "any" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any term</SelectItem>
                    {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Session</Label>
                <Select value={row.session_id ?? "any"} onValueChange={(v) => setRow({ ...row, session_id: v === "any" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any session</SelectItem>
                    {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={row.status ?? "active"} onValueChange={(v) => setRow({ ...row, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Layout kind</Label>
                <Select value={layout.kind} onValueChange={(v: "competency" | "score" | "hybrid") => setLayout({ ...layout, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="competency">Competency checklist (Nursery)</SelectItem>
                    <SelectItem value="score">Score-based (Primary/Secondary)</SelectItem>
                    <SelectItem value="hybrid">Hybrid – both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={row.notes ?? ""} onChange={(e) => setRow({ ...row, notes: e.target.value })} rows={2} />
            </div>
          </TabsContent>

          <TabsContent value="layout" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>School name (header)</Label>
                <Input value={layout.header?.schoolName ?? ""} onChange={(e) => setLayout({ ...layout, header: { ...layout.header, schoolName: e.target.value } })} />
              </div>
              <div><Label>Tagline</Label>
                <Input value={layout.header?.tagline ?? ""} onChange={(e) => setLayout({ ...layout, header: { ...layout.header, tagline: e.target.value } })} />
              </div>
            </div>

            {(layout.kind === "competency" || layout.kind === "hybrid") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Learning / Competency Areas</Label>
                  <Button size="sm" variant="outline" onClick={() => setLayout({
                    ...layout,
                    competencyAreas: [...(layout.competencyAreas ?? []), { id: crypto.randomUUID(), title: "New area", items: [] }],
                  })}><Plus className="h-3 w-3 mr-1" /> Add area</Button>
                </div>
                {(layout.competencyAreas ?? []).map((area, ai) => (
                  <Card key={area.id} className="p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input value={area.title} onChange={(e) => {
                        const areas = [...(layout.competencyAreas ?? [])];
                        areas[ai] = { ...area, title: e.target.value };
                        setLayout({ ...layout, competencyAreas: areas });
                      }} />
                      <Button size="icon" variant="ghost" onClick={() => {
                        const areas = (layout.competencyAreas ?? []).filter((_, i) => i !== ai);
                        setLayout({ ...layout, competencyAreas: areas });
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="space-y-1">
                      {area.items.map((it, ii) => (
                        <div key={ii} className="flex gap-2">
                          <Input value={it} onChange={(e) => {
                            const areas = [...(layout.competencyAreas ?? [])];
                            const items = [...area.items]; items[ii] = e.target.value;
                            areas[ai] = { ...area, items };
                            setLayout({ ...layout, competencyAreas: areas });
                          }} />
                          <Button size="icon" variant="ghost" onClick={() => {
                            const areas = [...(layout.competencyAreas ?? [])];
                            areas[ai] = { ...area, items: area.items.filter((_, i) => i !== ii) };
                            setLayout({ ...layout, competencyAreas: areas });
                          }}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => {
                        const areas = [...(layout.competencyAreas ?? [])];
                        areas[ai] = { ...area, items: [...area.items, ""] };
                        setLayout({ ...layout, competencyAreas: areas });
                      }}><Plus className="h-3 w-3 mr-1" /> Add item</Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Additional dynamic assessment sections (Conduct, Handwriting, Library, etc.) */}
            <div className="space-y-2 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label>Additional Assessment Sections</Label>
                <Button size="sm" variant="outline" onClick={() => setLayout({
                  ...layout,
                  assessmentSections: [
                    ...(layout.assessmentSections ?? []),
                    { id: crypto.randomUUID(), title: "New section", items: [] },
                  ],
                })}><Plus className="h-3 w-3 mr-1" /> Add section</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Behavioural / co-curricular sections rendered as item + rating grids below academics
                (e.g. Conduct &amp; Work Habits, Handwriting, Library, Home Performance, Enrichment).
              </p>
              {(layout.assessmentSections ?? []).map((sec, si) => (
                <Card key={sec.id} className="p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input value={sec.title} onChange={(e) => {
                      const secs = [...(layout.assessmentSections ?? [])];
                      secs[si] = { ...sec, title: e.target.value };
                      setLayout({ ...layout, assessmentSections: secs });
                    }} />
                    <Button size="icon" variant="ghost" onClick={() => {
                      const secs = (layout.assessmentSections ?? []).filter((_, i) => i !== si);
                      setLayout({ ...layout, assessmentSections: secs });
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                  <div className="space-y-1">
                    {sec.items.map((it, ii) => (
                      <div key={ii} className="flex gap-2">
                        <Input value={it} onChange={(e) => {
                          const secs = [...(layout.assessmentSections ?? [])];
                          const items = [...sec.items]; items[ii] = e.target.value;
                          secs[si] = { ...sec, items };
                          setLayout({ ...layout, assessmentSections: secs });
                        }} />
                        <Button size="icon" variant="ghost" onClick={() => {
                          const secs = [...(layout.assessmentSections ?? [])];
                          secs[si] = { ...sec, items: sec.items.filter((_, i) => i !== ii) };
                          setLayout({ ...layout, assessmentSections: secs });
                        }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => {
                      const secs = [...(layout.assessmentSections ?? [])];
                      secs[si] = { ...sec, items: [...sec.items, ""] };
                      setLayout({ ...layout, assessmentSections: secs });
                    }}><Plus className="h-3 w-3 mr-1" /> Add item</Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>


          <TabsContent value="grading" className="space-y-3 pt-3">
            {(layout.kind === "competency" || layout.kind === "hybrid") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Rating scale (competency)</Label>
                  <Button size="sm" variant="outline" onClick={() => setLayout({
                    ...layout, ratingScale: [...(layout.ratingScale ?? []), { code: "", label: "" }],
                  })}><Plus className="h-3 w-3 mr-1" /> Add level</Button>
                </div>
                {(layout.ratingScale ?? []).map((lvl, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr_2fr_auto] gap-2 items-center">
                    <Input value={lvl.code} placeholder="Code" onChange={(e) => {
                      const s = [...(layout.ratingScale ?? [])]; s[i] = { ...lvl, code: e.target.value };
                      setLayout({ ...layout, ratingScale: s });
                    }} />
                    <Input value={lvl.label} placeholder="Label" onChange={(e) => {
                      const s = [...(layout.ratingScale ?? [])]; s[i] = { ...lvl, label: e.target.value };
                      setLayout({ ...layout, ratingScale: s });
                    }} />
                    <Input value={lvl.description ?? ""} placeholder="Description" onChange={(e) => {
                      const s = [...(layout.ratingScale ?? [])]; s[i] = { ...lvl, description: e.target.value };
                      setLayout({ ...layout, ratingScale: s });
                    }} />
                    <Button size="icon" variant="ghost" onClick={() => {
                      const s = (layout.ratingScale ?? []).filter((_, x) => x !== i);
                      setLayout({ ...layout, ratingScale: s });
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            )}
            {(layout.kind === "score" || layout.kind === "hybrid") && (
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label>Grade scale (score-based)</Label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLayout({ ...layout, gradeScale: [...DEFAULT_GRADE_SCALE] })}>Load default</Button>
                    <Button size="sm" variant="outline" onClick={() => setLayout({
                      ...layout, gradeScale: [...(layout.gradeScale ?? []), { grade: "", min: 0, max: 0, remark: "" }],
                    })}><Plus className="h-3 w-3 mr-1" /> Add band</Button>
                  </div>
                </div>
                {(layout.gradeScale ?? []).map((g, i) => (
                  <div key={i} className="grid grid-cols-[80px_80px_80px_1fr_auto] gap-2 items-center">
                    <Input value={g.grade} placeholder="Grade" onChange={(e) => {
                      const s = [...(layout.gradeScale ?? [])]; s[i] = { ...g, grade: e.target.value };
                      setLayout({ ...layout, gradeScale: s });
                    }} />
                    <Input type="number" value={g.min} placeholder="Min" onChange={(e) => {
                      const s = [...(layout.gradeScale ?? [])]; s[i] = { ...g, min: Number(e.target.value) };
                      setLayout({ ...layout, gradeScale: s });
                    }} />
                    <Input type="number" value={g.max} placeholder="Max" onChange={(e) => {
                      const s = [...(layout.gradeScale ?? [])]; s[i] = { ...g, max: Number(e.target.value) };
                      setLayout({ ...layout, gradeScale: s });
                    }} />
                    <Input value={g.remark} placeholder="Remark" onChange={(e) => {
                      const s = [...(layout.gradeScale ?? [])]; s[i] = { ...g, remark: e.target.value };
                      setLayout({ ...layout, gradeScale: s });
                    }} />
                    <Button size="icon" variant="ghost" onClick={() => {
                      const s = (layout.gradeScale ?? []).filter((_, x) => x !== i);
                      setLayout({ ...layout, gradeScale: s });
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="comments" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Teacher comment prompt</Label>
                <Input value={layout.comments?.teacherPrompt ?? ""} onChange={(e) => setLayout({ ...layout, comments: { ...layout.comments, teacherPrompt: e.target.value } })} />
              </div>
              <div><Label>Principal / Head comment prompt</Label>
                <Input value={layout.comments?.principalPrompt ?? ""} onChange={(e) => setLayout({ ...layout, comments: { ...layout.comments, principalPrompt: e.target.value } })} />
              </div>
            </div>
            <div><Label>Footer note</Label>
              <Textarea rows={2} value={layout.footerNote ?? ""} onChange={(e) => setLayout({ ...layout, footerNote: e.target.value })} />
            </div>
          </TabsContent>

          <TabsContent value="json" className="pt-3">
            <Label>Layout JSON</Label>
            <Textarea
              rows={16} className="font-mono text-xs"
              value={JSON.stringify(layout, null, 2)}
              onChange={(e) => {
                try { setLayout(JSON.parse(e.target.value)); } catch { /* ignore until valid */ }
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">Advanced. Malformed JSON is ignored until valid.</p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onSave(row)} disabled={saving}>{saving ? "Saving…" : "Save template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreviewDialog({ template, onClose }: { template: TemplateRow; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[900px] max-h-[95vh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle>Preview – {template.name}</DialogTitle>
          <DialogDescription>
            A4 portrait preview using the unified report card framework. Print produces the same layout.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted/30 p-4 rounded-md overflow-x-auto">
          <div style={{ transform: "scale(0.85)", transformOrigin: "top left", width: "210mm" }}>
            <UnifiedReportCard
              layout={template.layout}
              student={{
                name: "SAMPLE STUDENT",
                admissionNumber: "MVA/2026/001",
                className: "SAMPLE CLASS",
                age: 5,
                attendance: "100/100",
                daysOpen: 100,
                daysAbsent: 0,
                classTeacher: "Mrs. Sample",
                classAverage: 68,
                overallPosition: "3rd",
              }}
              subjects={template.layout.kind !== "competency"
                ? (template.layout.subjectsPlaceholder ?? ["English Language", "Mathematics", "Basic Science"])
                    .map((s, i) => ({
                      subject: s,
                      ca1: 8 + (i % 3),
                      ca2: 7 + (i % 4),
                      ca3: 15 + (i % 5),
                      exam: 42 + (i % 15),
                      classAverage: 60 + (i % 10),
                    }))
                : undefined}
              teacherComment="A hardworking student with good potential. Keep it up!"
              directorComment="Well done. Aim higher next term."
              principalComment=""
              vacationDate="12th December, 2026"
              resumptionDate="8th January, 2027"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}>Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
