import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichEditor } from "@/components/rich/RichEditor";
import { normalizeMcqAnswer, optionEntries } from "@/lib/exam-answer";
import { BANK_TYPES, type BankDraft } from "@/lib/question-bank-editor";
import { saveBankQuestion, type BankRecord } from "@/lib/question-bank-mutations";
import type { BankCatalog } from "@/lib/question-bank-query";
import { bankMediaEntries } from "@/lib/question-bank-media";
import { BankMediaEditor, useBankUploads } from "./BankMediaEditor";
import { BankPassagePicker } from "./BankPassagePicker";

function Selector({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  change: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={change}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={`Choose ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function BankQuestionEditor({
  source,
  duplicate,
  catalog,
  userId,
  onClose,
  onSaved,
}: {
  source: BankRecord | null;
  duplicate: boolean;
  catalog: BankCatalog;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const entries = optionEntries(source?.options);
  const initialOptions = entries.map(([, text]) => text);
  const selectedKey = normalizeMcqAnswer(source?.correct_answer, source?.options);
  const selectedIndex = entries.findIndex(([key]) => key === selectedKey);
  const [draft, setDraft] = useState<BankDraft>({
    class_id: source?.class_id ?? "",
    subject_id: source?.subject_id ?? "",
    purpose: source?.purpose ?? "exam",
    question_type: source?.question_type ?? "mcq",
    question_text: source?.question_text ?? "",
    options: initialOptions.length ? initialOptions : ["", "", "", ""],
    correct_answer:
      source?.question_type === "mcq"
        ? selectedIndex >= 0
          ? String.fromCharCode(65 + selectedIndex)
          : ""
        : (source?.correct_answer ?? ""),
    marks: source?.marks ?? 1,
    difficulty: source?.difficulty ?? "medium",
    topic: source?.topic ?? "",
    sub_topic: source?.sub_topic ?? "",
    explanation: source?.explanation ?? "",
    tags: source?.tags.join(", ") ?? "",
    section_label: source?.section_label ?? "",
    section_instruction: source?.section_instruction ?? "",
    stimulus_id: source?.stimulus_id ?? "",
    media: bankMediaEntries(source?.media ?? []),
  });
  const uploads = useBankUploads(userId);
  const [passageBusy, setPassageBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof BankDraft>(key: K, value: BankDraft[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const save = useMutation({
    mutationFn: () => {
      // Retain uploaded files if a write response is lost: it may have committed.
      uploads.commit();
      return saveBankQuestion(draft, userId, source, duplicate);
    },
    onSuccess: async () => {
      uploads.commit();
      await onSaved();
      toast.success(
        source && !duplicate ? "Question updated as draft." : "Draft question created.",
      );
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending && !uploads.busy && !passageBusy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {duplicate ? "Duplicate question" : source ? "Edit question" : "New question"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (!uploads.busy && !passageBusy && !save.isPending) save.mutate();
          }}
        >
          <fieldset
            disabled={save.isPending || uploads.busy || passageBusy}
            className="grid sm:grid-cols-2 gap-3"
          >
            <Selector
              label="Class"
              value={draft.class_id}
              options={catalog.classes}
              change={(v) =>
                setDraft((old) => ({ ...old, class_id: v, subject_id: "", stimulus_id: "" }))
              }
            />
            <Selector
              label="Subject"
              value={draft.subject_id}
              options={catalog.subjects.filter((s) => !s.class_id || s.class_id === draft.class_id)}
              change={(v) => setDraft((old) => ({ ...old, subject_id: v, stimulus_id: "" }))}
            />
            <Selector
              label="Purpose"
              value={draft.purpose}
              options={["exam", "ca1", "ca2", "ca3"].map((id) => ({ id, name: id.toUpperCase() }))}
              change={(v) => set("purpose", v)}
            />
            <Selector
              label="Question type"
              value={draft.question_type}
              options={BANK_TYPES.map((id) => ({ id, name: id.replaceAll("_", " ") }))}
              change={(v) => setDraft((old) => ({ ...old, question_type: v, correct_answer: "" }))}
            />
          </fieldset>
          <BankPassagePicker
            userId={userId}
            classId={draft.class_id}
            subjectId={draft.subject_id}
            value={draft.stimulus_id ?? ""}
            change={(id) => set("stimulus_id", id)}
            disabled={save.isPending || uploads.busy || passageBusy}
            onBusy={setPassageBusy}
          />
          <div>
            <Label>Question text</Label>
            <RichEditor value={draft.question_text} onChange={(v) => set("question_text", v)} />
          </div>
          {draft.question_type === "mcq" ? (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {draft.options.map((text, i) => (
                  <div key={i}>
                    <Label htmlFor={`bank-option-${i}`}>Option {String.fromCharCode(65 + i)}</Label>
                    <Input
                      id={`bank-option-${i}`}
                      value={text}
                      onChange={(e) =>
                        set(
                          "options",
                          draft.options.map((o, index) => (index === i ? e.target.value : o)),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={draft.options.length >= 26}
                onClick={() => set("options", [...draft.options, ""])}
              >
                Add option
              </Button>
              <Selector
                label="Correct answer"
                value={draft.correct_answer}
                options={draft.options.flatMap((text, i) =>
                  text.trim()
                    ? [
                        {
                          id: String.fromCharCode(65 + i),
                          name: `${String.fromCharCode(65 + i)}. ${text}`,
                        },
                      ]
                    : [],
                )}
                change={(v) => set("correct_answer", v)}
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="bank-answer">
                {["fill_gap", "short_answer"].includes(draft.question_type)
                  ? "Expected answer"
                  : "Model answer (optional)"}
              </Label>
              <Input
                id="bank-answer"
                value={draft.correct_answer}
                onChange={(e) => set("correct_answer", e.target.value)}
              />
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="bank-marks">Marks</Label>
              <Input
                id="bank-marks"
                type="number"
                min="0.01"
                step="any"
                value={draft.marks}
                onChange={(e) => set("marks", Number(e.target.value))}
              />
            </div>
            <Selector
              label="Difficulty"
              value={draft.difficulty}
              options={["easy", "medium", "hard"].map((id) => ({ id, name: id }))}
              change={(v) => {
                if (v === "easy" || v === "medium" || v === "hard") set("difficulty", v);
              }}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {(
              [
                ["topic", "Topic"],
                ["sub_topic", "Sub-topic"],
                ["tags", "Tags"],
                ["section_label", "Section label"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label htmlFor={`bank-${key}`}>{label}</Label>
                <Input
                  id={`bank-${key}`}
                  value={draft[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div>
            <Label>Explanation</Label>
            <RichEditor
              value={draft.explanation}
              onChange={(v) => set("explanation", v)}
              rows={2}
            />
          </div>
          <div>
            <Label>Section instruction</Label>
            <RichEditor
              value={draft.section_instruction}
              onChange={(v) => set("section_instruction", v)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Question images</Label>
            <BankMediaEditor
              media={draft.media ?? []}
              change={(media) => set("media", media)}
              uploads={uploads}
              disabled={save.isPending || passageBusy}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending || uploads.busy || passageBusy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || uploads.busy || passageBusy}>
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
