import { normalizeMcqAnswer } from "./exam-answer";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  topic: z.string().min(2).max(400),
  count: z.number().int().min(1).max(15).default(5),
  qType: z.enum(["mcq", "theory", "short_answer"]).default("mcq"),
  gradeLevel: z.string().max(80).optional(),
  context: z.string().max(8000).optional(),
});

export interface AiGeneratedQuestion {
  html: string;
  qType: "mcq" | "theory" | "short_answer";
  marks: number;
  options?: string[];
  correctAnswer?: string;
  modelAnswer?: string;
}

/**
 * Generate a batch of exam-ready questions via the Lovable AI Gateway.
 * Returns simple JSON that the client converts into BuilderItem[].
 */
export const generateAiQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<AiGeneratedQuestion[]> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI is not configured on this workspace.");

    const system = [
      "You are an experienced examinations officer producing questions for school exam papers.",
      "Return STRICT JSON only (no prose, no code fences) matching this schema:",
      `{"questions":[{"html":"<p>...</p>","qType":"mcq|theory|short_answer","marks":1,"options":["a","b","c","d","e"],"correctAnswer":"exact option text","modelAnswer":"..."}]}`,
      "- html: the question stem as safe HTML (paragraphs, lists, <strong>, <em>, tables OK).",
      "- For MCQ: give 5 options (A–E); correctAnswer MUST be the exact text of the correct option.",
      "- For theory / short_answer: omit options; put a concise modelAnswer.",
      "- Do not repeat questions. Keep language age-appropriate.",
    ].join("\n");

    const user = [
      `Generate ${data.count} ${labelForType(data.qType)} question(s) about: ${data.topic}.`,
      data.gradeLevel ? `Target grade level: ${data.gradeLevel}.` : "",
      data.context ? `Reference passage / context:\n${data.context}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`AI request failed (${res.status}): ${txt.slice(0, 300)}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const parsed = safeJson(raw);
    const arr = Array.isArray(parsed?.questions) ? parsed.questions : [];

    return arr.slice(0, data.count).map((raw): AiGeneratedQuestion => {
      const q = raw as Record<string, unknown>;
      const qType =
        q.qType === "theory" || q.qType === "short_answer" ? q.qType : "mcq";
      const opts: string[] = Array.isArray(q.options)
        ? q.options.map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 6)
        : [];
      const correct = typeof q.correctAnswer === "string" ? q.correctAnswer.trim() : "";
      return {
        html: sanitizeHtml(String(q.html ?? "")),
        qType,
        marks: Number(q.marks) > 0 ? Number(q.marks) : qType === "theory" ? 5 : 1,
        options: qType === "mcq" ? (opts.length >= 2 ? opts : undefined) : undefined,
        correctAnswer:
          qType === "mcq"
            ? normalizeMcqAnswer(correct, opts) ?? undefined
            : qType === "short_answer"
              ? correct || undefined
              : undefined,
        modelAnswer:
          typeof q.modelAnswer === "string" && q.modelAnswer.trim()
            ? sanitizeHtml(q.modelAnswer)
            : undefined,
      };
    });
  });

function labelForType(t: "mcq" | "theory" | "short_answer") {
  return t === "mcq" ? "multiple-choice" : t === "theory" ? "theory / essay" : "short-answer";
}

function safeJson(s: string): { questions?: unknown[] } | null {
  try {
    return JSON.parse(s);
  } catch {
    // Some models still wrap in ```json ... ```
    const m = s.match(/```json\s*([\s\S]+?)```/i) ?? s.match(/```([\s\S]+?)```/);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Very light HTML sanitization — strip <script>/<style> + event handlers. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "");
}
