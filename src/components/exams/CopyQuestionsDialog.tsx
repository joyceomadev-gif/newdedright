import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Props {
  exam: {
    id: string; title: string; type: string;
    subject_id: string; class_id: string; term_id: string; session_id?: string | null;
    purpose?: string | null;
  };
  onClose: () => void;
}

interface CopyResult {
  exams_created_or_updated: number;
  total_questions_copied: number;
  results: Array<{ class_id: string; status: string; reason?: string; questions_copied?: number; created?: boolean }>;
}

export function CopyQuestionsDialog({ exam, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"new" | "append" | "replace">("new");
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [includeInstructions, setIncludeInstructions] = useState(true);
  const [includeMedia, setIncludeMedia] = useState(true);
  const [includeMarks, setIncludeMarks] = useState(true);
  const [includeOrder, setIncludeOrder] = useState(true);
  const [randomize, setRandomize] = useState(false);
  const [termId, setTermId] = useState<string>(exam.term_id);
  const [result, setResult] = useState<CopyResult | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["copy-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const { data: terms } = useQuery({
    queryKey: ["copy-terms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("terms").select("id,name,is_current,session_id").order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; is_current: boolean; session_id: string }[];
    },
  });

  const classMap = useMemo(() => new Map((classes ?? []).map((c) => [c.id, c.name])), [classes]);
  const eligibleClasses = (classes ?? []).filter((c) => c.id !== exam.class_id);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const copy = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error("Pick at least one destination class.");
      const { data, error } = await supabase.rpc("copy_exam_questions", {
        _source_exam_id: exam.id,
        _dest_class_ids: Array.from(selected),
        _mode: mode,
        _options: {
          include_answers: includeAnswers,
          include_instructions: includeInstructions,
          include_media: includeMedia,
          include_marks: includeMarks,
          include_order: includeOrder,
          randomize,
        },
        _dest_term_id: termId || undefined,
        _dest_session_id: undefined,
      });
      if (error) throw error;
      return data as unknown as CopyResult;
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Copied ${r.total_questions_copied} question(s) into ${r.exams_created_or_updated} exam(s).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Copy questions — {exam.title}</DialogTitle>
          <DialogDescription>
            Copy this exam's questions to one or more destination classes. The copy is independent — editing it does not affect the original.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-muted/30 text-sm">
              <div><b>{result.total_questions_copied}</b> question(s) copied into <b>{result.exams_created_or_updated}</b> exam(s).</div>
            </div>
            <div className="rounded-md border max-h-64 overflow-y-auto">
              {result.results.map((r, i) => (
                <div key={i} className="p-2 border-b text-sm flex justify-between gap-2">
                  <span>{classMap.get(r.class_id) ?? r.class_id}</span>
                  <span className={r.status === "success" ? "text-emerald-600" : r.status === "skipped" ? "text-muted-foreground" : "text-destructive"}>
                    {r.status === "success"
                      ? `${r.questions_copied} copied${r.created ? " (new exam)" : " (existing exam)"}`
                      : `${r.status}${r.reason ? " — " + r.reason : ""}`}
                  </span>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Destination class(es)</Label>
              <div className="rounded-md border max-h-48 overflow-y-auto p-2 space-y-1">
                {eligibleClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">No other classes available.</p>
                ) : eligibleClasses.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Subject is matched by name in each destination class.</p>
            </div>

            <div>
              <Label className="text-xs">Destination term</Label>
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(terms ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}{t.is_current ? " (current)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">If a matching exam already exists</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="mt-1 space-y-1">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="new" /> Always create a new exam</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="append" /> Append to the existing exam</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="replace" /> Replace its questions</label>
              </RadioGroup>
            </div>

            <div>
              <Label className="text-xs">Copy options</Label>
              <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={includeAnswers} onCheckedChange={(v) => setIncludeAnswers(!!v)} /> Correct answers</label>
                <label className="flex items-center gap-2"><Checkbox checked={includeInstructions} onCheckedChange={(v) => setIncludeInstructions(!!v)} /> Instructions</label>
                <label className="flex items-center gap-2"><Checkbox checked={includeMedia} onCheckedChange={(v) => setIncludeMedia(!!v)} /> Images / attachments</label>
                <label className="flex items-center gap-2"><Checkbox checked={includeMarks} onCheckedChange={(v) => setIncludeMarks(!!v)} /> Scoring / marks</label>
                <label className="flex items-center gap-2"><Checkbox checked={includeOrder} onCheckedChange={(v) => setIncludeOrder(!!v)} /> Question order</label>
                <label className="flex items-center gap-2"><Checkbox checked={randomize} onCheckedChange={(v) => setRandomize(!!v)} /> Randomize after copy</label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => copy.mutate()} disabled={copy.isPending || selected.size === 0}>
                {copy.isPending ? "Copying…" : `Copy to ${selected.size} class${selected.size === 1 ? "" : "es"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
