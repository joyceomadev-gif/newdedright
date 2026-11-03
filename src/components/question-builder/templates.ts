// Templates the teacher can pick from the "Create from Exam Paper" menu.
import {
  BuilderDoc,
  emptyQuestion,
  emptyGroup,
  uid,
  type BuilderQuestion,
  type SharedResource,
} from "./types";

export type TemplateId =
  | "theory"
  | "objective"
  | "practical"
  | "comprehension"
  | "case_study"
  | "passage_based"
  | "diagram_based"
  | "table_based";

export const TEMPLATES: {
  id: TemplateId;
  label: string;
  description: string;
}[] = [
  { id: "theory", label: "Theory Paper", description: "One question with sub-questions (1a, 1b…)." },
  { id: "objective", label: "Objective Paper", description: "Five multiple-choice questions to start." },
  { id: "practical", label: "Practical Paper", description: "Task-style theory questions with model answers." },
  { id: "comprehension", label: "Comprehension", description: "Shared passage + 5 questions (1–5)." },
  { id: "case_study", label: "Case Study", description: "Shared scenario + 4 questions." },
  { id: "passage_based", label: "Passage-Based", description: "Shared passage + 5 questions." },
  { id: "diagram_based", label: "Diagram-Based", description: "Shared diagram + 4 questions." },
  { id: "table_based", label: "Table-Based", description: "Shared table + 4 questions." },
];

function nQuestions(n: number, qType: BuilderQuestion["qType"] = "theory"): BuilderQuestion[] {
  return Array.from({ length: n }, () => emptyQuestion(qType));
}
function shared(kind: SharedResource["kind"], html = ""): SharedResource {
  return { id: uid(), kind, html };
}

export function buildFromTemplate(id: TemplateId): BuilderDoc {
  switch (id) {
    case "theory": {
      const q = emptyQuestion("theory");
      q.subQuestions = [
        { id: uid(), html: "", marks: 2 },
        { id: uid(), html: "", marks: 3 },
      ];
      return { version: 1, items: [{ id: uid(), kind: "question", question: q }] };
    }
    case "objective":
      return {
        version: 1,
        items: nQuestions(5, "mcq").map((q) => ({ id: uid(), kind: "question", question: q })),
      };
    case "practical": {
      const q = emptyQuestion("theory");
      q.subQuestions = [
        { id: uid(), html: "", marks: 4, modelAnswer: "" },
        { id: uid(), html: "", marks: 6, modelAnswer: "" },
      ];
      return { version: 1, items: [{ id: uid(), kind: "question", question: q }] };
    }
    case "comprehension":
    case "passage_based": {
      const g = emptyGroup();
      g.shared = [
        shared("instruction", "<p>Read the passage below and answer the questions that follow.</p>"),
        shared("passage"),
      ];
      g.questions = nQuestions(5, "theory");
      return { version: 1, items: [{ id: uid(), kind: "group", group: g }] };
    }
    case "case_study": {
      const g = emptyGroup();
      g.shared = [
        shared("instruction", "<p>Study the case study below and answer the questions that follow.</p>"),
        shared("passage"),
      ];
      g.questions = nQuestions(4, "theory");
      return { version: 1, items: [{ id: uid(), kind: "group", group: g }] };
    }
    case "diagram_based": {
      const g = emptyGroup();
      g.shared = [
        shared("instruction", "<p>Study the diagram below and answer the questions that follow.</p>"),
        shared("diagram"),
      ];
      g.questions = nQuestions(4, "theory");
      return { version: 1, items: [{ id: uid(), kind: "group", group: g }] };
    }
    case "table_based": {
      const g = emptyGroup();
      g.shared = [
        shared("instruction", "<p>Study the table below and answer the questions that follow.</p>"),
        shared("table"),
      ];
      g.questions = nQuestions(4, "theory");
      return { version: 1, items: [{ id: uid(), kind: "group", group: g }] };
    }
  }
}
