import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileUp, Loader2, ChevronLeft, ChevronRight, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { parseDocxToBlocks } from "@/lib/docx-import/parse";
import {
  WIZARD_TYPE_LABELS,
  wizardTypeToDb,
  type DetectedSection,
  type EditableQuestion,
  type ParsedDoc,
  type WizardQuestionType,
} from "@/lib/docx-import/types";

export interface WordImportPayload {
  question_type: "mcq" | "fill_gap" | "theory" | "short_answer";
  question_text: string;
  options: string[] | null;
  correct_answer: string | null;
  marks: number;
  section_label: string | null;
  section_instruction: string | null;
  media: Array<{ type: string; url: string; caption?: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (rows: WordImportPayload[]) => Promise<void>;
  title?: string;
}

type Step = "upload" | "confirm" | "preview";

// Per-section state kept alongside the parsed doc so type flips propagate.
interface SectionState {
  id: string;
  type: WizardQuestionType; // "skip" means the whole section is dropped
}

export function WordImportWizard({ open, onClose, onImport, title = "Import questions from Word" }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedDoc | null>(null);
  const [sectionState, setSectionState] = useState<SectionState[]>([]);
  const [drafts, setDrafts] = useState<EditableQuestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setStep("upload"); setFile(null); setParsing(false); setParsed(null);
    setSectionState([]); setDrafts([]); setEditingId(null); setImporting(false);
  };

  const handleFile = async (f: File) => {
    setFile(f); setParsing(true); setParsed(null);
    try {
      const p = await parseDocxToBlocks(f);
      setParsed(p);
      const state: SectionState[] = p.sections.map((s) => ({ id: s.id, type: s.suggestedType }));
      setSectionState(state);
      setDrafts(buildDrafts(p, state));
      const totalQ = p.sections.reduce((n, s) => n + s.questions.length, 0);
      if (totalQ === 0) toast.warning("No questions detected — try a different file.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read the Word file.");
    } finally {
      setParsing(false);
    }
  };

  const changeSectionType = (sectionId: string, t: WizardQuestionType) => {
    const nextState = sectionState.map((s) => s.id === sectionId ? { ...s, type: t } : s);
    setSectionState(nextState);
    if (parsed) setDrafts(buildDrafts(parsed, nextState, drafts));
  };

  const validationErrors = useMemo(() => validateDrafts(drafts), [drafts]);

  async function handleImport() {
    const kept = drafts.filter((d) => d.wizardType !== "skip");
    if (kept.length === 0) { toast.error("Nothing to import — every section is set to Skip."); return; }
    if (validationErrors.length > 0) { toast.error("Fix validation errors before importing."); return; }
    setImporting(true);
    try {
      const payload: WordImportPayload[] = kept.map(draftToPayload);
      await onImport(payload);
      toast.success(`Imported ${payload.length} question${payload.length === 1 ? "" : "s"}.`);
      reset(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const totalQuestions = parsed?.sections.reduce((n, s) => n + s.questions.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload a .docx file. The wizard detects sections, instructions and questions.
            You confirm the question type for each <em>section</em> — every question in that section is imported as that type.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === "upload" && (
          <UploadStep
            file={file} parsing={parsing} parsed={parsed}
            onPick={handleFile}
            onNext={() => setStep("confirm")}
          />
        )}

        {step === "confirm" && parsed && (
          <ConfirmStep
            sections={parsed.sections}
            state={sectionState}
            onChangeType={changeSectionType}
          />
        )}

        {step === "preview" && parsed && (
          <PreviewStep
            sections={parsed.sections}
            state={sectionState}
            drafts={drafts}
            editingId={editingId}
            onEdit={setEditingId}
            onUpdate={(patch) => setDrafts((prev) => prev.map((d) => d.id === patch.id ? patch : d))}
            errors={validationErrors}
          />
        )}

        <DialogFooter className="gap-2">
          {step !== "upload" && (
            <Button variant="outline" onClick={() => setStep(step === "preview" ? "confirm" : "upload")}>
              <ChevronLeft className="h-4 w-4 mr-1" />Back
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          {step === "upload" && (
            <Button onClick={() => setStep("confirm")} disabled={!parsed || totalQuestions === 0}>
              Confirm section types<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === "confirm" && (
            <Button onClick={() => setStep("preview")}>
              Preview<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === "preview" && (
            <Button onClick={handleImport} disabled={importing || validationErrors.length > 0}>
              {importing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing…</> : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- steps --------------------------------- */

function StepIndicator({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: "upload", label: "1 · Upload & Analyze" },
    { key: "confirm", label: "2 · Confirm section types" },
    { key: "preview", label: "3 · Preview & Edit" },
  ];
  return (
    <div className="flex gap-2 text-xs">
      {items.map((it) => (
        <span key={it.key}
          className={`px-2 py-1 rounded ${step === it.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {it.label}
        </span>
      ))}
    </div>
  );
}

function UploadStep({
  file, parsing, parsed, onPick, onNext,
}: {
  file: File | null; parsing: boolean; parsed: ParsedDoc | null;
  onPick: (f: File) => void; onNext: () => void;
}) {
  const totalQ = parsed?.sections.reduce((n, s) => n + s.questions.length, 0) ?? 0;
  return (
    <div className="space-y-3">
      <div className="rounded-md border p-4 bg-muted/30">
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">Choose a Word (.docx) file</div>
        </div>
        <Input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="mt-2 max-w-md"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
        />
        {file && <div className="text-xs text-muted-foreground mt-1">{file.name}</div>}
      </div>

      {parsing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Analyzing document…
        </div>
      )}

      {parsed && (
        <div className="rounded-md border p-4 space-y-2">
          <div className="text-sm font-medium">Detected in your document</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{parsed.counts.sections} section{parsed.counts.sections === 1 ? "" : "s"}</Badge>
            <Badge variant="secondary">{totalQ} question{totalQ === 1 ? "" : "s"}</Badge>
            <Badge variant="secondary">{parsed.counts.images} image{parsed.counts.images === 1 ? "" : "s"}</Badge>
            <Badge variant="secondary">{parsed.counts.tables} table{parsed.counts.tables === 1 ? "" : "s"}</Badge>
          </div>
          {(() => {
            let mcq = 0, theory = 0;
            for (const s of parsed.sections) {
              if (s.suggestedType === "mcq") mcq += s.questions.length;
              else if (s.suggestedType === "theory") theory += s.questions.length;
            }
            if (mcq > 0 && theory > 0) {
              return (
                <div className="rounded border border-primary/40 bg-primary/5 p-2 text-xs">
                  <div className="font-medium mb-1">Two exams will be created:</div>
                  <ul className="list-disc ml-4">
                    <li>CBT Examination — {mcq} objective question{mcq === 1 ? "" : "s"}</li>
                    <li>Written Examination — {theory} theory question{theory === 1 ? "" : "s"}</li>
                  </ul>
                  <div className="text-muted-foreground mt-1">Both inherit the current exam's session, term, class, subject and title.</div>
                </div>
              );
            }
            return null;
          })()}

          <ul className="text-xs text-muted-foreground list-disc ml-4">
            {parsed.sections.map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.headingText}</span> — {s.questions.length} question{s.questions.length === 1 ? "" : "s"} · suggested: {WIZARD_TYPE_LABELS[s.suggestedType]}
              </li>
            ))}
          </ul>
          {Object.keys(parsed.examInfo).length > 0 && (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">Exam info (informational — not saved automatically):</div>
              <ul className="list-disc ml-4">
                {Object.entries(parsed.examInfo).map(([k, v]) => <li key={k}><span className="capitalize">{k}</span>: {v}</li>)}
              </ul>
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <div className="text-xs text-amber-600">
              <div className="font-medium">Notes:</div>
              <ul className="list-disc ml-4">{parsed.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <Button size="sm" onClick={onNext} disabled={totalQ === 0}>
            Continue<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ConfirmStep({
  sections, state, onChangeType,
}: {
  sections: DetectedSection[];
  state: SectionState[];
  onChangeType: (sectionId: string, t: WizardQuestionType) => void;
}) {
  const typeFor = (id: string) => state.find((s) => s.id === id)?.type ?? "theory";
  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      <div className="text-xs text-muted-foreground">
        Confirm the type for each detected section. Every question in that section is imported as the chosen type.
        Choose <em>Skip</em> to drop a whole section.
      </div>
      {sections.map((sec) => (
        <div key={sec.id} className="rounded-md border p-3 space-y-2">
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{sec.headingText}</div>
              {sec.instructionText && (
                <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{sec.instructionText}</div>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                <Badge variant="secondary" className="text-[10px]">{sec.questions.length} question{sec.questions.length === 1 ? "" : "s"}</Badge>
                {sec.media.length > 0 && <Badge variant="secondary" className="text-[10px]">{sec.media.length} image{sec.media.length === 1 ? "" : "s"}</Badge>}
                {sec.passages.length > 0 && <Badge variant="secondary" className="text-[10px]">{sec.passages.length} passage{sec.passages.length === 1 ? "" : "s"}</Badge>}
                {sec.tables.length > 0 && <Badge variant="secondary" className="text-[10px]">{sec.tables.length} table{sec.tables.length === 1 ? "" : "s"}</Badge>}
              </div>
              {sec.questions.length > 0 && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  First question: {truncate(sec.questions[0].text, 140) || <em>(empty)</em>}
                </div>
              )}
            </div>
            <div className="w-56">
              <Label className="text-[11px] text-muted-foreground">Section type</Label>
              <Select value={typeFor(sec.id)} onValueChange={(v) => onChangeType(sec.id, v as WizardQuestionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(WIZARD_TYPE_LABELS) as WizardQuestionType[]).map((k) => (
                    <SelectItem key={k} value={k}>{WIZARD_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewStep({
  sections, state, drafts, editingId, onEdit, onUpdate, errors,
}: {
  sections: DetectedSection[];
  state: SectionState[];
  drafts: EditableQuestion[];
  editingId: string | null;
  onEdit: (id: string | null) => void;
  onUpdate: (patch: EditableQuestion) => void;
  errors: { id: string; message: string }[];
}) {
  const errorsById = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of errors) {
      const arr = m.get(e.id) ?? []; arr.push(e.message); m.set(e.id, arr);
    }
    return m;
  }, [errors]);
  const draftsBySection = useMemo(() => {
    const m = new Map<string, EditableQuestion[]>();
    for (const d of drafts) {
      const arr = m.get(d.sectionId) ?? []; arr.push(d); m.set(d.sectionId, arr);
    }
    return m;
  }, [drafts]);
  const typeFor = (id: string) => state.find((s) => s.id === id)?.type ?? "theory";

  return (
    <div className="space-y-4 max-h-[65vh] overflow-y-auto">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
          {errors.length} question{errors.length === 1 ? "" : "s"} need attention before import.
        </div>
      )}
      {sections.map((sec) => {
        const sType = typeFor(sec.id);
        const sDrafts = draftsBySection.get(sec.id) ?? [];
        if (sType === "skip") {
          return (
            <div key={sec.id} className="rounded-md border p-3 opacity-60">
              <div className="text-sm font-semibold">{sec.headingText}</div>
              <div className="text-xs text-muted-foreground">Skipped — {sDrafts.length} question{sDrafts.length === 1 ? "" : "s"} will not be imported.</div>
            </div>
          );
        }
        return (
          <div key={sec.id} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">{sec.headingText}</div>
              <Badge variant="outline">{WIZARD_TYPE_LABELS[sType]}</Badge>
            </div>
            {sec.instructionText && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{sec.instructionText}</div>}
            {sec.passages.map((p) => {
              const usedBy = sDrafts
                .filter((d) => d.sharedPassageId === p.id && d.questionNumber != null)
                .map((d) => `Q${d.questionNumber}`)
                .join(", ");
              return (
                <div key={p.id} className="text-xs bg-muted/40 p-2 rounded whitespace-pre-wrap">
                  <div className="font-medium mb-1">Passage {usedBy && <span className="text-muted-foreground font-normal">— shared with {usedBy}</span>}</div>
                  {p.text}
                </div>
              );
            })}
            {sec.media.map((img) => {
              const usedBy = sDrafts
                .filter((d) => d.sharedMediaIds.includes(img.id) && d.questionNumber != null)
                .map((d) => `Q${d.questionNumber}`)
                .join(", ");
              return (
                <div key={img.id} className="flex items-start gap-2">
                  <img src={img.dataUrl} alt={img.alt ?? ""} className="max-h-40 rounded border" />
                  {usedBy && <div className="text-xs text-muted-foreground mt-1">Shared with {usedBy}</div>}
                </div>
              );
            })}
            {sDrafts.map((d) => {
              const isEditing = editingId === d.id;
              const rowErrors = errorsById.get(d.id) ?? [];
              const skipped = d.wizardType === "skip";
              return (
                <div key={d.id} className={`rounded-md border p-3 ${skipped ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {d.questionNumber != null && <span className="text-xs text-muted-foreground">Q{d.questionNumber}</span>}
                      {skipped && <Badge variant="outline">Skipped</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onUpdate({ ...d, wizardType: skipped ? sType : "skip" })}>
                        {skipped ? "Include" : "Skip"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onEdit(isEditing ? null : d.id)}>
                        {isEditing ? <><Check className="h-4 w-4 mr-1" />Done</> : <><Pencil className="h-4 w-4 mr-1" />Edit</>}
                      </Button>
                    </div>
                  </div>

                  {rowErrors.length > 0 && (
                    <ul className="text-xs text-destructive mt-1 list-disc ml-5">
                      {rowErrors.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}

                  {!isEditing ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-sm whitespace-pre-wrap">{d.text || <em className="text-muted-foreground">(empty)</em>}</div>
                      {d.options.length > 0 && (
                        <ol className="text-sm ml-5 list-[upper-alpha]">
                          {d.options.map((o, i) => {
                            const letter = String.fromCharCode(65 + i);
                            return (
                              <li key={i} className={d.correctAnswer === letter ? "font-semibold text-primary" : ""}>{o}</li>
                            );
                          })}
                        </ol>
                      )}
                      {(d.wizardType === "mcq" || d.wizardType === "fill_gap") && (
                        <div className="text-xs text-muted-foreground">
                          Correct answer: <span className="font-medium">{formatCorrectAnswer(d) || <em>not set</em>}</span> · Marks: {d.marks}
                        </div>
                      )}
                    </div>
                  ) : (
                    <QuestionEditor draft={d} onChange={onUpdate} />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="text-[11px] text-muted-foreground">
        Question type is set per section. To change it, go back to <em>Confirm section types</em>.
      </div>
    </div>
  );
}

function QuestionEditor({ draft, onChange }: { draft: EditableQuestion; onChange: (d: EditableQuestion) => void }) {
  const patch = (p: Partial<EditableQuestion>) => onChange({ ...draft, ...p });
  const isMcq = draft.wizardType === "mcq";
  const isFill = draft.wizardType === "fill_gap";
  const isComp = draft.wizardType === "comprehension";

  return (
    <div className="mt-3 space-y-2">
      <div>
        <Label className="text-xs">Marks</Label>
        <Input type="number" min={1} value={draft.marks}
          onChange={(e) => patch({ marks: Math.max(1, Number(e.target.value) || 1) })} />
      </div>

      {isComp && (
        <div>
          <Label className="text-xs">Passage (shared for this section)</Label>
          <Textarea rows={4} value={draft.passage} onChange={(e) => patch({ passage: e.target.value })} />
        </div>
      )}

      <div>
        <Label className="text-xs">Question text</Label>
        <Textarea rows={3} value={draft.text} onChange={(e) => patch({ text: e.target.value })} />
      </div>

      {isMcq && (
        <div className="space-y-1">
          <Label className="text-xs">Options</Label>
          {[0, 1, 2, 3, 4].map((i) => (
            <Input key={i} placeholder={`Option ${String.fromCharCode(65 + i)}`}
              value={draft.options[i] ?? ""}
              onChange={(e) => {
                const opts = [...draft.options];
                opts[i] = e.target.value;
                patch({ options: opts });
              }} />
          ))}
          <Label className="text-xs">Correct answer</Label>
          <Select value={draft.correctAnswer} onValueChange={(v) => patch({ correctAnswer: v })}>
            <SelectTrigger><SelectValue placeholder="Pick an option" /></SelectTrigger>
            <SelectContent>
              {draft.options.map((o, i) => {
                const letter = String.fromCharCode(65 + i);
                if (!o.trim()) return null;
                return <SelectItem key={i} value={letter}>{letter} — {o}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {isFill && (
        <div>
          <Label className="text-xs">Expected answer</Label>
          <Input value={draft.correctAnswer} onChange={(e) => patch({ correctAnswer: e.target.value })} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------- helpers -------------------------------- */

function buildDrafts(parsed: ParsedDoc, state: SectionState[], previous?: EditableQuestion[]): EditableQuestion[] {
  const prevById = new Map((previous ?? []).map((d) => [d.id, d]));
  const out: EditableQuestion[] = [];
  for (const sec of parsed.sections) {
    const secType = state.find((s) => s.id === sec.id)?.type ?? sec.suggestedType;
    const passageText = (id?: string) => sec.passages.find((p) => p.id === id)?.text ?? "";
    for (const q of sec.questions) {
      const prev = prevById.get(q.id);
      const images = q.sharedMediaIds
        .map((id) => sec.media.find((m) => m.id === id))
        .filter(Boolean) as EditableQuestion["images"];
      const tables = q.sharedTableIds
        .map((id) => sec.tables.find((t) => t.id === id))
        .filter(Boolean) as EditableQuestion["tables"];
      out.push({
        id: q.id,
        sectionId: sec.id,
        // Preserve a per-question Skip; otherwise inherit the section type.
        wizardType: prev?.wizardType === "skip" ? "skip" : secType,
        text: prev?.text ?? q.text,
        options: prev?.options ?? q.options,
        correctAnswer: prev?.correctAnswer ?? q.correctAnswer ?? "",
        marks: prev?.marks ?? 1,
        sectionLabel: sec.headingText,
        sectionInstruction: sec.instructionText,
        passage: prev?.passage ?? passageText(q.sharedPassageId),
        images,
        tables,
        sharedMediaIds: q.sharedMediaIds,
        sharedPassageId: q.sharedPassageId,
        questionNumber: q.numberInSection ?? null,
      });
    }
  }
  return out;
}

function validateDrafts(drafts: EditableQuestion[]): { id: string; message: string }[] {
  const errs: { id: string; message: string }[] = [];
  for (const d of drafts) {
    if (d.wizardType === "skip") continue;
    if (!d.text.trim()) errs.push({ id: d.id, message: "Question text is required." });
    if (d.wizardType === "mcq") {
      const opts = d.options.filter((o) => o.trim());
      if (opts.length < 2) errs.push({ id: d.id, message: "MCQ needs at least 2 options." });
      const letter = d.correctAnswer.trim().toUpperCase();
      const idx = "ABCDE".indexOf(letter);
      if (!letter || idx < 0 || !d.options[idx]?.trim())
        errs.push({ id: d.id, message: "Correct answer must match one option." });
    }
    if (d.wizardType === "fill_gap" && !d.correctAnswer.trim())
      errs.push({ id: d.id, message: "Fill-in-the-gap needs an expected answer." });
    if (d.wizardType === "comprehension" && !d.passage.trim())
      errs.push({ id: d.id, message: "Reading Comprehension needs a passage." });
  }
  return errs;
}

function draftToPayload(d: EditableQuestion): WordImportPayload {
  const dbType = wizardTypeToDb(d.wizardType);
  const opts = d.wizardType === "mcq" ? d.options.filter((o) => o.trim()) : null;
  const media = d.images.length > 0
    ? d.images.map((img) => ({ type: "image", url: img.dataUrl, caption: img.alt }))
    : [];

  let text = d.text.trim();
  if (d.wizardType === "comprehension" && d.passage.trim()) {
    text = `PASSAGE:\n${d.passage.trim()}\n\nQUESTION:\n${text}`;
  }
  if (d.wizardType === "matching" && d.tables[0]) {
    const grid = d.tables[0].rows.map((r) => r.join(" — ")).join("\n");
    text = `${text}\n\nMatching:\n${grid}`;
  }
  // Safety net: non-MCQ questions that carry parsed sub-parts (a)/(b)/(c) get
  // them appended to the stem so nothing is silently dropped when the section
  // type is theory / comprehension / diagram.
  if (d.wizardType !== "mcq" && d.options.length >= 2) {
    const parts = d.options
      .map((o, i) => (o.trim() ? `(${String.fromCharCode(97 + i)}) ${o.trim()}` : ""))
      .filter(Boolean)
      .join("\n");
    if (parts) text = `${text}\n${parts}`;
  }

  return {
    question_type: dbType === "short_answer" ? "short_answer" : (dbType as WordImportPayload["question_type"]),
    question_text: text,
    options: opts && opts.length > 0 ? opts : null,
    correct_answer: (d.wizardType === "mcq" || d.wizardType === "fill_gap") ? d.correctAnswer.trim() || null : null,
    marks: d.marks,
    section_label: d.sectionLabel.trim() || null,
    section_instruction: d.sectionInstruction.trim() || null,
    media,
  };
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatCorrectAnswer(d: EditableQuestion): string {
  const letter = d.correctAnswer.trim().toUpperCase();
  if (d.wizardType !== "mcq") return d.correctAnswer;
  const idx = "ABCDE".indexOf(letter);
  if (idx < 0 || !d.options[idx]) return d.correctAnswer;
  return `${letter} (${d.options[idx]})`;
}
