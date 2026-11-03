import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DynamicGradingScale } from "@/lib/assessment-config";
import { GradeBand } from "@/lib/scoring";

export function GradingScaleManager() {
  const qc = useQueryClient();
  const [editingScale, setEditingScale] = useState<Partial<DynamicGradingScale> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: scales, isLoading } = useQuery({
    queryKey: ["admin-grading-scales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grading_scales")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        bands: (typeof s.bands === "string" ? JSON.parse(s.bands) : s.bands) || [],
      })) as DynamicGradingScale[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: Partial<DynamicGradingScale>) => {
      if (!draft.name?.trim()) throw new Error("Scale name is required");

      const payload = {
        name: draft.name,
        education_level: draft.education_level || "all",
        is_default: draft.is_default || false,
        bands: JSON.parse(JSON.stringify(draft.bands || [])),
        updated_at: new Date().toISOString(),
      };

      if (draft.id) {
        const { error } = await supabase.from("grading_scales").update(payload).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("grading_scales").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Grading scale saved successfully");
      setIsDialogOpen(false);
      setEditingScale(null);
      qc.invalidateQueries({ queryKey: ["admin-grading-scales"] });
      qc.invalidateQueries({ queryKey: ["resolved-grading-scale"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("grading_scales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Grading scale deleted");
      qc.invalidateQueries({ queryKey: ["admin-grading-scales"] });
      qc.invalidateQueries({ queryKey: ["resolved-grading-scale"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  function openNew() {
    setEditingScale({
      name: "",
      education_level: "all",
      is_default: false,
      bands: [
        { grade: "A", min: 70, max: 100, grade_point: 5.0, remark: "Excellent" },
        { grade: "B", min: 60, max: 69, grade_point: 4.0, remark: "Very Good" },
        { grade: "C", min: 50, max: 59, grade_point: 3.0, remark: "Good" },
        { grade: "D", min: 45, max: 49, grade_point: 2.0, remark: "Pass" },
        { grade: "E", min: 40, max: 44, grade_point: 1.0, remark: "Weak Pass" },
        { grade: "F", min: 0, max: 39, grade_point: 0.0, remark: "Fail" },
      ],
    });
    setIsDialogOpen(true);
  }

  function addBand() {
    if (!editingScale) return;
    const existing = editingScale.bands || [];
    setEditingScale({
      ...editingScale,
      bands: [...existing, { grade: "NEW", min: 0, max: 10, grade_point: 0, remark: "Pass" }],
    });
  }

  function removeBand(idx: number) {
    if (!editingScale) return;
    const bands = [...(editingScale.bands || [])];
    bands.splice(idx, 1);
    setEditingScale({ ...editingScale, bands });
  }

  function updateBand(idx: number, patch: Partial<GradeBand & { grade_point?: number }>) {
    if (!editingScale) return;
    const bands = [...(editingScale.bands || [])];
    bands[idx] = { ...bands[idx], ...patch };
    setEditingScale({ ...editingScale, bands });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Award className="h-4 w-4" /> Grading Scales & Precedence Configuration
          </h3>
          <p className="text-xs text-muted-foreground">
            Configure custom grade boundaries, remarks, and optional grade points (e.g. A1-F9, A-F, GPA 4.0/5.0) per educational level or subject.
          </p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1">
          <Plus className="h-4 w-4" /> Add Grading Scale
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading grading scales…</Card>
      ) : !scales || scales.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No custom grading scales defined yet. Default A (70-100) through F (0-39) scale applies.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scales.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{s.name}</h4>
                    {s.is_default && <Badge variant="secondary">Default</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Level: <span className="capitalize font-medium">{(s.education_level || "all").replace("_", " ")}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingScale(s); setIsDialogOpen(true); }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="border rounded-md divide-y text-xs">
                {s.bands.map((b, idx) => (
                  <div key={idx} className="p-2 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-primary">{b.grade}</span> ({b.min} – {b.max}%) — {b.remark}
                    </div>
                    {b.grade_point != null && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        GP: {b.grade_point}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingScale?.id ? "Edit Grading Scale" : "New Grading Scale"}</DialogTitle>
          </DialogHeader>

          {editingScale && (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Scale Name</Label>
                  <Input
                    placeholder="e.g. Senior Secondary WAEC Scale"
                    value={editingScale.name || ""}
                    onChange={(e) => setEditingScale({ ...editingScale, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Educational Level</Label>
                  <Select
                    value={editingScale.education_level || "all"}
                    onValueChange={(v) => setEditingScale({ ...editingScale, education_level: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="nursery">Nursery / Early Years</SelectItem>
                      <SelectItem value="primary">Primary School</SelectItem>
                      <SelectItem value="junior_secondary">Junior Secondary</SelectItem>
                      <SelectItem value="senior_secondary">Senior Secondary</SelectItem>
                      <SelectItem value="tertiary">Tertiary / University</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Grade</TableHead>
                    <TableHead className="w-20">Min %</TableHead>
                    <TableHead className="w-20">Max %</TableHead>
                    <TableHead className="w-20">Grade Point</TableHead>
                    <TableHead>Remark</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(editingScale.bands || []).map((b, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Input
                          className="h-8 text-xs font-bold uppercase"
                          value={b.grade}
                          onChange={(e) => updateBand(idx, { grade: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 text-xs tabular-nums"
                          value={b.min}
                          onChange={(e) => updateBand(idx, { min: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 text-xs tabular-nums"
                          value={b.max}
                          onChange={(e) => updateBand(idx, { max: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.1"
                          className="h-8 text-xs tabular-nums"
                          value={b.grade_point ?? ""}
                          onChange={(e) => updateBand(idx, { grade_point: e.target.value === "" ? undefined : Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs"
                          value={b.remark}
                          onChange={(e) => updateBand(idx, { remark: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => removeBand(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Button size="sm" variant="outline" onClick={addBand} className="w-full gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Grade Band
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(editingScale!)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Scale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
