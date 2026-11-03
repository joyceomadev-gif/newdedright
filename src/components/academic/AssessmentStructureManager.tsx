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
import { Plus, Trash2, Edit2, Layers, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AssessmentStructure, AssessmentComponent } from "@/lib/assessment-config";

export function AssessmentStructureManager() {
  const qc = useQueryClient();
  const [editingStruct, setEditingStruct] = useState<Partial<AssessmentStructure> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: structures, isLoading } = useQuery({
    queryKey: ["admin-assessment-structures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_structures")
        .select("*, assessment_components(*)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        components: (s.assessment_components || []).sort(
          (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)
        ),
      })) as AssessmentStructure[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: Partial<AssessmentStructure>) => {
      if (!draft.name?.trim()) throw new Error("Structure name is required");

      const components = draft.components || [];
      const totalWeight = components.reduce((sum, c) => sum + Number(c.weight_percentage || 0), 0);
      if (components.length > 0 && Math.abs(totalWeight - 100) > 0.01) {
        toast.warning(`Total component weight is ${totalWeight}%. Recommended weight sum is 100%.`);
      }

      let structId = draft.id;
      if (structId) {
        const { error } = await supabase
          .from("assessment_structures")
          .update({
            name: draft.name,
            education_level: draft.education_level || "all",
            total_max_score: draft.total_max_score || 100,
            is_default: draft.is_default || false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", structId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("assessment_structures")
          .insert({
            name: draft.name,
            education_level: draft.education_level || "all",
            total_max_score: draft.total_max_score || 100,
            is_default: draft.is_default || false,
          })
          .select("id")
          .single();

        if (error) throw error;
        structId = data.id;
      }

      // Upsert components
      if (structId) {
        await supabase.from("assessment_components").delete().eq("structure_id", structId);

        if (components.length > 0) {
          const compPayload = components.map((c, idx) => ({
            structure_id: structId,
            code: c.code.toUpperCase().trim(),
            name: c.name.trim(),
            category: c.category || "exam_component",
            max_score: Number(c.max_score) || 10,
            weight_percentage: Number(c.weight_percentage) || 0,
            display_order: idx + 1,
            is_mandatory: c.is_mandatory ?? true,
          }));

          const { error: compErr } = await supabase.from("assessment_components").insert(compPayload);
          if (compErr) throw compErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Assessment structure saved successfully");
      setIsDialogOpen(false);
      setEditingStruct(null);
      qc.invalidateQueries({ queryKey: ["admin-assessment-structures"] });
      qc.invalidateQueries({ queryKey: ["resolved-assessment-structure"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("assessment_structures")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Structure archived");
      qc.invalidateQueries({ queryKey: ["admin-assessment-structures"] });
      qc.invalidateQueries({ queryKey: ["resolved-assessment-structure"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  function openNew(template: "standard" | "younger") {
    if (template === "younger") {
      setEditingStruct({
        name: "Nursery / Early Years Skill Criteria",
        education_level: "nursery",
        total_max_score: 10,
        is_default: false,
        components: [
          { id: "1", code: "COUNT_1_5", name: "Can count 1–5", category: "skill_criterion", max_score: 3, weight_percentage: 30, display_order: 1, is_mandatory: true },
          { id: "2", code: "WRITE_1_5", name: "Can write 1–5", category: "skill_criterion", max_score: 3, weight_percentage: 30, display_order: 2, is_mandatory: true },
          { id: "3", code: "PRONOUNCE", name: "Can pronounce words", category: "skill_criterion", max_score: 4, weight_percentage: 40, display_order: 3, is_mandatory: true },
        ],
      });
    } else {
      setEditingStruct({
        name: "Primary / Secondary CA & Exam",
        education_level: "primary",
        total_max_score: 100,
        is_default: false,
        components: [
          { id: "1", code: "CA1", name: "Continuous Assessment 1", category: "exam_component", max_score: 15, weight_percentage: 15, display_order: 1, is_mandatory: true },
          { id: "2", code: "CA2", name: "Continuous Assessment 2", category: "exam_component", max_score: 15, weight_percentage: 15, display_order: 2, is_mandatory: true },
          { id: "3", code: "EXAM", name: "End of Term Exam", category: "exam_component", max_score: 70, weight_percentage: 70, display_order: 3, is_mandatory: true },
        ],
      });
    }
    setIsDialogOpen(true);
  }

  function addComponent() {
    if (!editingStruct) return;
    const existing = editingStruct.components || [];
    const nextIdx = existing.length + 1;
    const newComp: AssessmentComponent = {
      id: String(Date.now()),
      code: `COMP${nextIdx}`,
      name: `Assessment Component ${nextIdx}`,
      category: "exam_component",
      max_score: 10,
      weight_percentage: 10,
      display_order: nextIdx,
      is_mandatory: true,
    };
    setEditingStruct({ ...editingStruct, components: [...existing, newComp] });
  }

  function removeComponent(idx: number) {
    if (!editingStruct) return;
    const comps = [...(editingStruct.components || [])];
    comps.splice(idx, 1);
    setEditingStruct({ ...editingStruct, components: comps });
  }

  function updateComponent(idx: number, patch: Partial<AssessmentComponent>) {
    if (!editingStruct) return;
    const comps = [...(editingStruct.components || [])];
    comps[idx] = { ...comps[idx], ...patch };
    setEditingStruct({ ...editingStruct, components: comps });
  }

  const currentWeightSum = (editingStruct?.components || []).reduce(
    (acc, c) => acc + (Number(c.weight_percentage) || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4" /> Assessment Structure & Early-Years Criteria Configuration
          </h3>
          <p className="text-xs text-muted-foreground">
            Define dynamic components (CA1, CA2, Mid-Term, Exam, Practical) for primary/secondary OR individual skills/criteria (Can count 1–5, Can write 1–5) for younger classes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => openNew("younger")} className="gap-1">
            <Plus className="h-4 w-4" /> Add Early Years Skill Criteria
          </Button>
          <Button size="sm" onClick={() => openNew("standard")} className="gap-1">
            <Plus className="h-4 w-4" /> Add CA / Exam Structure
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading assessment structures…</Card>
      ) : !structures || structures.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No custom assessment structures configured yet. Standard 15/15/70 defaults apply.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {structures.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">{s.name}</h4>
                    {s.is_default && <Badge variant="secondary">Default</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Level: <span className="capitalize font-medium">{s.education_level.replace("_", " ")}</span> • Max Total: {s.total_max_score}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingStruct(s); setIsDialogOpen(true); }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="border rounded-md divide-y text-xs">
                {s.components.map((c) => (
                  <div key={c.id} className="p-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={c.category === "skill_criterion" ? "outline" : "secondary"} className="text-[10px]">
                        {c.category === "skill_criterion" ? "Skill" : "Exam"}
                      </Badge>
                      <span className="font-semibold text-primary">{c.code}</span> — {c.name}
                    </div>
                    <div className="text-muted-foreground font-mono">
                      Max: {c.max_score} {c.category !== "skill_criterion" && `| ${c.weight_percentage}%`}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStruct?.id ? "Edit Assessment Structure" : "New Assessment Structure"}</DialogTitle>
          </DialogHeader>

          {editingStruct && (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Structure Name</Label>
                  <Input
                    placeholder="e.g. Primary School Standard CA/Exam"
                    value={editingStruct.name || ""}
                    onChange={(e) => setEditingStruct({ ...editingStruct, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Educational Level</Label>
                  <Select
                    value={editingStruct.education_level || "all"}
                    onValueChange={(v) => setEditingStruct({ ...editingStruct, education_level: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="nursery">Nursery / Early Years (Skills & Criteria)</SelectItem>
                      <SelectItem value="primary">Primary School</SelectItem>
                      <SelectItem value="junior_secondary">Junior Secondary</SelectItem>
                      <SelectItem value="senior_secondary">Senior Secondary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <h4 className="text-sm font-medium">Assessment Components & Criteria</h4>
                <div className="flex items-center gap-2 text-xs">
                  <span>Total Weight:</span>
                  <Badge variant={Math.abs(currentWeightSum - 100) < 0.01 ? "default" : "outline"} className={Math.abs(currentWeightSum - 100) < 0.01 ? "bg-emerald-600" : "text-amber-600"}>
                    {currentWeightSum}% {Math.abs(currentWeightSum - 100) < 0.01 ? <CheckCircle2 className="h-3 w-3 inline ml-1" /> : <AlertCircle className="h-3 w-3 inline ml-1" />}
                  </Badge>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Type</TableHead>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Component / Skill Name</TableHead>
                    <TableHead className="w-20">Max Score</TableHead>
                    <TableHead className="w-20">Weight %</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(editingStruct.components || []).map((c, idx) => (
                    <TableRow key={c.id || idx}>
                      <TableCell>
                        <Select
                          value={c.category || "exam_component"}
                          onValueChange={(v) => updateComponent(idx, { category: v as any })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exam_component">Exam Component</SelectItem>
                            <SelectItem value="skill_criterion">Skill / Criterion</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs font-mono uppercase"
                          value={c.code}
                          onChange={(e) => updateComponent(idx, { code: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs"
                          value={c.name}
                          onChange={(e) => updateComponent(idx, { name: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 text-xs tabular-nums"
                          value={c.max_score}
                          onChange={(e) => updateComponent(idx, { max_score: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8 text-xs tabular-nums"
                          value={c.weight_percentage}
                          onChange={(e) => updateComponent(idx, { weight_percentage: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => removeComponent(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Button size="sm" variant="outline" onClick={addComponent} className="w-full gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Component / Criterion Row
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(editingStruct!)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Structure"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
