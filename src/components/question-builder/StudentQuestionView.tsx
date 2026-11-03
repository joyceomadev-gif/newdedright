import { normalizeMcqAnswer } from "@/lib/exam-answer";
import { Fragment } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RichHtml, RichView } from "@/components/rich/RichView";
import type {
  BuilderGroup,
  BuilderItem,
  BuilderQuestion,
  SharedResource,
  SubQuestion,
} from "./types";

/**
 * Answer key convention used by the CBT runner:
 *   - Standalone question (no sub-questions):   `${rowId}`
 *   - Standalone question with sub-qs:          `${rowId}::s:${subId}`
 *   - Group child question (no sub-qs):         `${rowId}::q:${qId}`
 *   - Group child question sub-question:        `${rowId}::q:${qId}::s:${subId}`
 * The primary MCQ correct_answer on the row still maps to the bare `${rowId}` key
 * for legacy questions (no content_json).
 */
export function ansKey(
  rowId: string,
  opts: { qId?: string; subId?: string } = {},
): string {
  let k = rowId;
  if (opts.qId) k += `::q:${opts.qId}`;
  if (opts.subId) k += `::s:${opts.subId}`;
  return k;
}

interface Props {
  rowId: string;
  item: BuilderItem;
  answers: Record<string, string>;
  setAnswer: (key: string, value: string) => void;
  displayNumber: number; // top-level number shown to student (1., 2., …)
}

export function StudentQuestionView({
  rowId,
  item,
  answers,
  setAnswer,
  displayNumber,
}: Props) {
  if (item.kind === "question") {
    return (
      <QuestionBlock
        rowId={rowId}
        q={item.question}
        answers={answers}
        setAnswer={setAnswer}
        prefix={`${displayNumber}.`}
      />
    );
  }
  return (
    <GroupBlock
      rowId={rowId}
      group={item.group}
      answers={answers}
      setAnswer={setAnswer}
      startNumber={displayNumber}
    />
  );
}

function GroupBlock({
  rowId,
  group,
  answers,
  setAnswer,
  startNumber,
}: {
  rowId: string;
  group: BuilderGroup;
  answers: Record<string, string>;
  setAnswer: (k: string, v: string) => void;
  startNumber: number;
}) {
  return (
    <div className="space-y-4">
      {group.shared.map((s) => (
        <SharedBlock key={s.id} resource={s} />
      ))}
      <div className="space-y-4">
        {group.questions.map((q, idx) => (
          <QuestionBlock
            key={q.id}
            rowId={rowId}
            qId={q.id}
            q={q}
            answers={answers}
            setAnswer={setAnswer}
            prefix={`${startNumber}${suffixLetter(idx)}.`}
          />
        ))}
      </div>
    </div>
  );
}

function suffixLetter(i: number): string {
  // For a group's first question keep the plain number; then a, b, c…
  if (i === 0) return "";
  return String.fromCharCode(96 + i); // 1 => 'a'
}

function SharedBlock({ resource }: { resource: SharedResource }) {
  const label =
    resource.kind === "instruction" ? null : (
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        {resource.kind}
      </div>
    );
  return (
    <div className="rounded border bg-muted/30 p-3 text-sm">
      {label}
      <RichHtml html={resource.html ?? ""} />
      {resource.caption && (
        <div className="mt-1 text-xs italic text-muted-foreground">
          {resource.caption}
        </div>
      )}
    </div>
  );
}

function QuestionBlock({
  rowId,
  qId,
  q,
  answers,
  setAnswer,
  prefix,
}: {
  rowId: string;
  qId?: string;
  q: BuilderQuestion;
  answers: Record<string, string>;
  setAnswer: (k: string, v: string) => void;
  prefix: string;
}) {
  const hasSubs = q.subQuestions.length > 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2">
        <div className="flex-1 text-sm">
          <span className="font-medium mr-1">{prefix}</span>
          <RichHtml inline html={q.html ?? ""} />
        </div>
        <Badge variant="outline">{questionTotalMarks(q)} mk</Badge>
      </div>

      {!hasSubs && (
        <AnswerInput
          q={q}
          value={answers[ansKey(rowId, { qId })] ?? ""}
          onChange={(v) => setAnswer(ansKey(rowId, { qId }), v)}
        />
      )}

      {hasSubs && (
        <ol className="space-y-3 ml-4 list-none">
          {q.subQuestions.map((s, i) => (
            <li key={s.id} className="space-y-1">
              <div className="flex justify-between gap-2">
                <div className="flex-1 text-sm">
                  <span className="font-medium mr-1">
                    {String.fromCharCode(97 + i)})
                  </span>
                  <RichHtml inline html={s.html ?? ""} />
                </div>
                {s.marks ? (
                  <span className="text-xs text-muted-foreground">
                    ({s.marks} mk)
                  </span>
                ) : null}
              </div>
              <SubAnswerInput
                sub={s}
                value={answers[ansKey(rowId, { qId, subId: s.id })] ?? ""}
                onChange={(v) =>
                  setAnswer(ansKey(rowId, { qId, subId: s.id }), v)
                }
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AnswerInput({
  q,
  value,
  onChange,
}: {
  q: BuilderQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (q.qType === "mcq" && opts.length > 0) {
    return (
      <div className="space-y-1">
        {opts.map((o, i) => {
          const key = String.fromCharCode(65 + i);
          return (
            <label
              key={key}
              className={`flex gap-2 items-start p-2 rounded border cursor-pointer ${
                value === key ? "border-primary bg-primary/5" : ""
              }`}
            >
              <input
                type="radio"
                name={`ans-${q.id}`}
                checked={value === key}
                onChange={() => onChange(key)}
              />
              <span className="text-sm">
                <strong>{key}.</strong> <RichView content={o} className="inline" />
              </span>
            </label>
          );
        })}
      </div>
    );
  }
  if (q.qType === "theory") {
    return (
      <Fragment>
        <Textarea
          rows={6}
          placeholder="Write your answer here…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground italic">
          This is a theory question and will be graded by your teacher.
        </p>
      </Fragment>
    );
  }
  return (
    <Input
      placeholder="Your answer"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SubAnswerInput({
  sub,
  value,
  onChange,
}: {
  sub: SubQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  // Sub-questions are always teacher-graded (free-form).
  void sub;
  return (
    <Textarea
      rows={3}
      placeholder="Write your answer here…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function questionTotalMarks(q: BuilderQuestion): number {
  const sub = q.subQuestions.reduce((a, s) => a + (Number(s.marks) || 0), 0);
  return sub > 0 ? sub : Number(q.marks) || 0;
}

/* ---------- Helpers used by the CBT runner ---------- */

export interface GradeableUnit {
  key: string; // answers key
  qId?: string;
  subId?: string;
  label: string; // e.g. "3a", "3b", "5"
  marks: number;
  correctAnswer: string | null; // uppercase MCQ letter or plain text; null => teacher grades
  needsGrading: boolean;
  questionText: string; // plain-text snippet for the answer log
  optionsForLog: string[] | null;
}

/**
 * Flatten one BuilderItem into gradeable units. Used at submit time to score
 * MCQs, mark theory/sub-questions as needing grading, and to build the
 * exam_attempts.answers log in the same shape existing grading code expects.
 */
export function itemGradeableUnits(
  rowId: string,
  item: BuilderItem,
  displayNumber: number,
): GradeableUnit[] {
  const out: GradeableUnit[] = [];
  const push = (
    q: BuilderQuestion,
    label: string,
    opts: { qId?: string } = {},
  ) => {
    if (q.subQuestions.length > 0) {
      q.subQuestions.forEach((s, i) => {
        out.push({
          key: ansKey(rowId, { qId: opts.qId, subId: s.id }),
          qId: opts.qId,
          subId: s.id,
          label: `${label}${String.fromCharCode(97 + i)}`,
          marks: Number(s.marks) || 0,
          correctAnswer: null,
          needsGrading: true,
          questionText: htmlToPlain(s.html),
          optionsForLog: null,
        });
      });
      return;
    }
    const cleanOpts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    const isMcq = q.qType === "mcq" && cleanOpts.length > 0;
    let correct: string | null = null;
    if (isMcq && q.correctAnswer) {
      correct = normalizeMcqAnswer(q.correctAnswer, cleanOpts);
    } else if (q.qType === "short_answer" || q.qType === "fill_gap") {
      correct = (q.correctAnswer ?? "").trim() || null;
    }
    out.push({
      key: ansKey(rowId, { qId: opts.qId }),
      qId: opts.qId,
      label,
      marks: Number(q.marks) || 0,
      correctAnswer: correct,
      needsGrading: q.qType === "theory",
      questionText: htmlToPlain(q.html),
      optionsForLog: isMcq ? cleanOpts : null,
    });
  };

  if (item.kind === "question") {
    push(item.question, `${displayNumber}`);
  } else {
    item.group.questions.forEach((q, i) => {
      const label = `${displayNumber}${i === 0 ? "" : String.fromCharCode(96 + i)}`;
      push(q, label, { qId: q.id });
    });
  }
  return out;
}

function htmlToPlain(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ");
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

/** Try to parse a stored content_json blob into a BuilderItem. */
export function parseContentJson(raw: unknown): BuilderItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { kind?: string };
  if (obj.kind === "question" || obj.kind === "group") return raw as BuilderItem;
  return null;
}
