import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  exam: { id: string; title: string; class_id: string; subject_id: string; purpose?: string | null };
  onClose: () => void;
}

interface SaveResult {
  added: number; updated: number; skipped: number; new_versions: number;
  errors: Array<{ question_id: string; error: string }>;
  total_saved: number;
}

export function SaveToBankDialog({ exam, onClose }: Props) {
  const [scope, setScope] = useState<"all" | "select">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dupMode, setDupMode] = useState<"skip" | "replace" | "new_version">("skip");
  const [topic, setTopic] = useState("");
  const [subTopic, setSubTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [tagsText, setTagsText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [result, setResult] = useState<SaveResult | null>(null);

  const { data: questions } = useQuery({
    queryKey: ["save-bank-qs", exam.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions")
        .select("id,question_text,question_type,marks")
        .eq("exam_id", exam.id)
        .order("section_order", { nullsFirst: false })
        .order("question_number", { nullsFirst: false })
        .order("position", { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const save = useMutation({
    mutationFn: async () => {
      const ids = scope === "select" ? selectedIds : null;
      if (scope === "select" && selectedIds.length === 0) throw new Error("Select at least one question.");
      const tags = tagsText.split(",").map((s) => s.trim()).filter(Boolean);
      const keywords = keywordsText.split(",").map((s) => s.trim()).filter(Boolean);
      const { data, error } = await supabase.rpc("save_exam_to_bank", {
        _exam_id: exam.id,
        _question_ids: ids ?? undefined,
        _metadata: {
          topic: topic || undefined,
          sub_topic: subTopic || undefined,
          difficulty,
          tags,
          keywords,
        },
        _dup_mode: dupMode,
      });
      if (error) throw error;
      return data as unknown as SaveResult;
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Saved ${r.total_saved} question(s) to the bank.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save to Question Bank — {exam.title}</DialogTitle>
          <DialogDescription>Save this exam's questions to the central Question Bank with topic, difficulty and tags for reuse.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 bg-muted/30 space-y-1">
              <div>Total saved: <b>{result.total_saved}</b></div>
              <div>New questions added: <b>{result.added}</b></div>
              <div>Updated (replaced): <b>{result.updated}</b></div>
              <div>New versions created: <b>{result.new_versions}</b></div>
              <div>Duplicates skipped: <b>{result.skipped}</b></div>
              {result.errors.length > 0 && <div className="text-destructive">Errors: {result.errors.length}</div>}
            </div>
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">What to save</Label>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as typeof scope)} className="mt-1 space-y-1">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" /> All questions ({questions?.length ?? 0})</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="select" /> Selected questions only</label>
              </RadioGroup>
              {scope === "select" && (
                <div className="rounded-md border max-h-40 overflow-y-auto p-2 mt-2 space-y-1">
                  {(questions ?? []).map((q) => (
                    <label key={q.id} className="flex items-start gap-2 text-xs cursor-pointer p-1 hover:bg-muted rounded">
                      <Checkbox checked={selected.has(q.id)} onCheckedChange={() => toggle(q.id)} />
                      <span className="flex-1 line-clamp-2">{(q.question_text ?? "").replace(/<[^>]+>/g, " ").slice(0, 120)}</span>
                      <span className="text-muted-foreground shrink-0">{q.question_type} · {q.marks}mk</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Topic</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Sub-topic</Label>
                <Input value={subTopic} onChange={(e) => setSubTopic(e.target.value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="h-9" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Keywords (comma-separated)</Label>
                <Input value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} className="h-9" />
              </div>
            </div>

            <div>
              <Label className="text-xs">If a question already exists in the bank</Label>
              <RadioGroup value={dupMode} onValueChange={(v) => setDupMode(v as typeof dupMode)} className="mt-1 space-y-1">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="skip" /> Skip duplicates</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="replace" /> Replace existing (previous version kept as revision)</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="new_version" /> Save as new version</label>
              </RadioGroup>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save to bank"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
