import { compactMcq, normalizeMcqAnswer } from "@/lib/exam-answer";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QuestionBuilder } from "./QuestionBuilder";
import {
  BuilderDoc,
  BuilderItem,
  emptyQuestion,
  flattenItemHtml,
  htmlToPlain,
  itemTotalMarks,
  legacyToItem,
  newDoc,
  uid,
} from "./types";

interface QuestionRowLite {
  id: string;
  question_text: string | null;
  options: unknown;
  correct_answer: string | null;
  marks: number | null;
  question_type: string | null;
  position?: number | null;
  content_json?: unknown;
}

interface Props {
  examId: string;
  sectionId?: string | null;
  row?: QuestionRowLite;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Full-page Question Builder dialog. Replaces the classic single-question form
 * with a block-based paper builder. Backward compatible: legacy rows without
 * content_json load as one question item; new/edited rows save both
 * content_json (structured) and question_text (flattened HTML) so the student
 * exam-taking screen keeps working unchanged.
 */
export function QuestionBuilderDialog({ examId, sectionId, row, nextPosition, onClose, onSaved }: Props) {
  const isEdit = !!row;

  const [doc, setDoc] = useState<BuilderDoc>(() => initialDoc(row));

  const save = useMutation({
    mutationFn: async () => {
      if (doc.items.length === 0) throw new Error("Add at least one question.");
      for (const it of doc.items) validateItem(it);

      if (isEdit && row) {
        // Editing a single existing row: keep it a single item.
        const it = doc.items[0];
        const payload = itemToRowPayload(it);
        const { error } = await supabase
          .from("questions")
          .update({
            ...payload,
            section_id: sectionId ?? (row as any)?.section_id ?? null,
            position: row.position ?? nextPosition,
          })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        // Insert one row per top-level item (question or group).
        let pos = nextPosition;
        const rows = doc.items.map((it) => ({
          ...itemToRowPayload(it),
          exam_id: examId,
          section_id: sectionId ?? null,
          position: pos++,
        }));
        const { error } = await supabase.from("questions").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Question saved." : `Added ${doc.items.length} item${doc.items.length === 1 ? "" : "s"}.`);
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle>{isEdit ? "Question Builder — edit" : "Question Builder"}</DialogTitle>
          <DialogDescription>
            Build examination questions with rich text, tables, images, formulas, diagrams, sub-questions and question groups.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-3">
          <QuestionBuilder doc={doc} onChange={setDoc} />
        </div>
        <DialogFooter className="border-t px-6 py-3">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isEdit ? "Save" : "Save all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Adapters ---------- */
function initialDoc(row?: QuestionRowLite): BuilderDoc {
  if (!row) return newDoc();
  if (row.content_json && typeof row.content_json === "object") {
    const raw = row.content_json as { items?: BuilderItem[]; version?: number };
    if ("kind" in raw && (raw.kind === "question" || raw.kind === "group")) {
      return { version: 1, items: [row.content_json as BuilderItem] };
    }
    if (Array.isArray(raw.items) && raw.items.length) {
      return { version: 1, items: raw.items };
    }
  }
  return { version: 1, items: [legacyToItem(row)] };
}

function validateItem(it: BuilderItem) {
  if (it.kind === "question") {
    validateQuestion(it.question);
  } else {
    if (!it.group.questions.length) throw new Error("A question group needs at least one question.");
    it.group.questions.forEach(validateQuestion);
  }
}
function validateQuestion(q: import("./types").BuilderQuestion) {
  const plain = htmlToPlain(q.html);
  if (!plain) throw new Error("Every question needs some text.");
  if (q.qType === "mcq") {
    const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) throw new Error("Multi-choice questions need at least 2 options.");
    if (!normalizeMcqAnswer(q.correctAnswer, q.options)) {
      throw new Error("Multi-choice questions need a correct answer that matches one option.");
    }
  }
  if ((q.qType === "fill_gap" || q.qType === "short_answer") && !q.correctAnswer?.trim()) {
    throw new Error("Fill-in-the-gap and short-answer questions need an expected answer.");
  }
}

function itemToRowPayload(it: BuilderItem) {
  const flat = flattenItemHtml(it);
  const marks = itemTotalMarks(it);
  const primary =
    it.kind === "question" ? it.question : it.group.questions[0];
  const qType =
    it.kind === "question" && it.question.qType === "mcq" && it.question.subQuestions.length === 0
      ? "mcq"
      : "theory";
  const normalized = compactMcq(primary?.options, primary?.correctAnswer);
  const options = qType === "mcq" ? normalized.options : null;
  const correct = qType === "mcq" ? normalized.correct : null;
  const canonical = JSON.parse(JSON.stringify(it)) as BuilderItem;
  const children = canonical.kind === "question" ? [canonical.question] : canonical.group.questions;
  for (const child of children) {
    if (child.qType !== "mcq") continue;
    const mcq = compactMcq(child.options, child.correctAnswer);
    child.options = mcq.options;
    child.correctAnswer = mcq.correct ?? "";
  }
  return {
    question_text: flat,
    options: options && options.length ? options : null,
    correct_answer: correct,
    marks: marks || 1,
    question_type: qType,
    content_json: canonical as never,
  };
}

/** Convenience: build a fresh doc pre-seeded with one question. */
export function seededDoc(): BuilderDoc {
  return {
    version: 1,
    items: [{ id: uid(), kind: "question", question: emptyQuestion("theory") }],
  };
}
