/**
 * Read-only examination paper view.
 * Used for Written / Practical / Oral exams: the student reads the questions
 * on screen and writes answers in their manual answer booklet.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, AlertTriangle } from "lucide-react";
import { RichView } from "@/components/rich/RichView";
import { SignedImage } from "@/lib/storage";
import { StudentQuestionView, parseContentJson } from "@/components/question-builder/StudentQuestionView";

interface Row {
  id: string;
  question_text: string;
  options: unknown;
  marks: number;
  position: number;
  media: unknown;
  question_type: string;
  content_json: unknown;
  section_title: string | null;
  section_instruction: string | null;
  section_order: number | null;
}

export function ExamPaperView({ exam, onDone }: { exam: any; onDone: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["exam-paper", exam.id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("student_get_exam_questions", { _exam_id: exam.id });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading examination paper…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" /><span className="font-medium">Unable to open paper</span>
        </div>
        <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button variant="outline" onClick={onDone}>Back</Button>
      </Card>
    );
  }

  const questions = data ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div>
          <p className="font-semibold">{exam.title}</p>
          <p className="text-xs text-muted-foreground">
            {exam.subjects?.name ?? exam.subject_name ?? ""} · {String(exam.type).toUpperCase()} · Max {exam.max_score}
            {exam.duration_minutes ? ` · ${exam.duration_minutes} min` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Answer all questions in your answer booklet. This paper is read-only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>Close</Button>
        </div>
      </Card>

      {!questions.length ? (
        <Card className="p-6 text-sm text-muted-foreground">No questions have been attached to this examination yet.</Card>
      ) : (
        questions.map((q, i) => {
          const item = parseContentJson(q.content_json);
          const sec = q.section_title;
          const prev = i > 0 ? questions[i - 1].section_title : null;
          const first = sec && sec !== prev;
          const opts: any = q.options;
          const oe: [string, string][] = Array.isArray(opts)
            ? opts.map((o: any, idx: number) => [String.fromCharCode(65 + idx), String(o)])
            : opts && typeof opts === "object"
              ? Object.entries(opts).map(([k, v]) => [k, String(v)])
              : [];
          return (
            <div key={q.id} className="space-y-3">
              {first && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <Badge className="uppercase text-xs">{sec}</Badge>
                  {q.section_instruction && <div className="text-sm pt-1"><RichView content={q.section_instruction} /></div>}
                </div>
              )}
              <Card className="p-4 space-y-2">
                {item ? (
                  <div className="pointer-events-none opacity-95">
                    <StudentQuestionView rowId={q.id} item={item} displayNumber={i + 1} answers={{}} setAnswer={() => {}} />
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="font-semibold whitespace-nowrap">{i + 1}.</span>
                        <RichView content={q.question_text} className="flex-1 min-w-0 text-sm font-medium" />
                      </div>
                      <Badge variant="outline">{q.marks} mk</Badge>
                    </div>
                    {Array.isArray(q.media) && (q.media as any[]).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(q.media as any[]).filter((m) => m?.url || m?.path).map((m, mi) => (
                          <figure key={mi}>
                            <SignedImage bucket={m.bucket ?? "question-media"} src={m.path ?? m.url} alt={m.caption ?? ""} className="max-h-64 rounded border object-contain bg-white" />
                            {m.caption && <figcaption className="text-xs text-muted-foreground">{m.caption}</figcaption>}
                          </figure>
                        ))}
                      </div>
                    )}
                    {oe.length > 0 && (
                      <ol className="space-y-1 ml-6">
                        {oe.map(([k, v]) => (
                          <li key={k} className="text-sm"><strong>{k}.</strong> <RichView content={v} className="inline" /></li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </Card>
            </div>
          );
        })
      )}

      <div className="flex justify-end print:hidden">
        <Button variant="outline" onClick={onDone}>Back to exam list</Button>
      </div>
    </div>
  );
}

export default ExamPaperView;
