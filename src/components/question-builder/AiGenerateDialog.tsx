import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateAiQuestions,
  type AiGeneratedQuestion,
} from "@/lib/ai-questions.functions";
import { emptyQuestion, uid, type BuilderItem } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (items: BuilderItem[]) => void;
  /** Optional context (e.g. shared passage HTML) to seed the prompt. */
  context?: string;
}

export function AiGenerateDialog({ open, onClose, onInsert, context }: Props) {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [qType, setQType] = useState<"mcq" | "theory" | "short_answer">("mcq");
  const [gradeLevel, setGradeLevel] = useState("");
  const [extra, setExtra] = useState(context ?? "");

  const gen = useServerFn(generateAiQuestions);
  const mutate = useMutation({
    mutationFn: async () => {
      if (!topic.trim()) throw new Error("Enter a topic.");
      const raw = await gen({
        data: {
          topic: topic.trim(),
          count,
          qType,
          gradeLevel: gradeLevel.trim() || undefined,
          context: extra.trim() || undefined,
        },
      });
      if (!raw.length) throw new Error("No questions returned. Try a different topic.");
      return raw;
    },
    onSuccess: (raw) => {
      onInsert(raw.map(aiToBuilderItem));
      toast.success(`Added ${raw.length} question${raw.length === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Generate questions with AI
          </DialogTitle>
          <DialogDescription>
            Draft exam questions in seconds. Review and edit them after — nothing is auto-published.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Topic / learning objective</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Photosynthesis, WW2 causes, Quadratic equations"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Question type</Label>
              <Select value={qType} onValueChange={(v) => setQType(v as typeof qType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple choice</SelectItem>
                  <SelectItem value="theory">Theory / essay</SelectItem>
                  <SelectItem value="short_answer">Short answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Count</Label>
              <Input
                type="number"
                min={1}
                max={15}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Grade / class</Label>
              <Input
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                placeholder="e.g. JSS2"
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference passage / context (optional)</Label>
            <Textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Paste a passage, formula sheet or bullet points the AI should base questions on."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutate.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutate.mutate()} disabled={mutate.isPending}>
            {mutate.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" /> Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function aiToBuilderItem(q: AiGeneratedQuestion): BuilderItem {
  const base = emptyQuestion(q.qType);
  return {
    id: uid(),
    kind: "question",
    question: {
      ...base,
      html: q.html,
      qType: q.qType,
      marks: q.marks,
      options: q.qType === "mcq" ? (q.options ?? ["", "", "", "", ""]) : undefined,
      correctAnswer: q.correctAnswer ?? "",
      subQuestions: [],
    },
  };
}
