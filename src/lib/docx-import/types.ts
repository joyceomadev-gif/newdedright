// Types used by the guided Word (.docx) import wizard.
// The wizard's own "wizard types" map to real DB question_type values at save time.

export type DbQuestionType =
  | "mcq"
  | "fill_gap"
  | "theory"
  | "short_answer"
  | "drawing"
  | "coloring"
  | "chart";

// Human-facing types the teacher picks in the wizard.
export type WizardQuestionType =
  | "mcq"
  | "theory"
  | "fill_gap"
  | "matching"
  | "comprehension"
  | "diagram"
  | "skip";

export const WIZARD_TYPE_LABELS: Record<WizardQuestionType, string> = {
  mcq: "Multiple Choice",
  theory: "Theory",
  fill_gap: "Fill in the Gap",
  matching: "Matching",
  comprehension: "Reading Comprehension",
  diagram: "Diagram Question",
  skip: "Skip (do not import)",
};

// How wizard types collapse to a real DB question_type.
export function wizardTypeToDb(t: WizardQuestionType): DbQuestionType {
  switch (t) {
    case "mcq":
      return "mcq";
    case "fill_gap":
      return "fill_gap";
    case "theory":
    case "matching":
    case "comprehension":
    case "diagram":
      return "theory";
    case "skip":
      return "theory";
  }
}

export interface DetectedImage {
  id: string;         // stable id so shared diagrams aren't duplicated
  dataUrl: string;
  alt?: string;
}

export interface DetectedTable {
  id: string;
  rows: string[][];
}

export interface DetectedPassage {
  id: string;
  text: string;
}

export interface DetectedQuestion {
  id: string;
  numberInSection?: number;   // may restart per section
  text: string;
  options: string[];          // only populated when the section is MCQ-style
  correctAnswer?: string;
  // References to shared media/passages living on the parent section. Never inlined here.
  sharedMediaIds: string[];
  sharedTableIds: string[];
  sharedPassageId?: string;
}

export interface DetectedSection {
  id: string;
  index: number;              // 0-based section position
  headingText: string;        // "SECTION A – Multiple Choice Questions"
  instructionText: string;    // e.g. "Answer all questions."
  suggestedType: WizardQuestionType;
  questions: DetectedQuestion[];
  // Shared assets belonging to the section, referenced by questions via id.
  media: DetectedImage[];
  tables: DetectedTable[];
  passages: DetectedPassage[];
  // Anything we couldn't attach automatically.
  unassignedImages: DetectedImage[];
  unassignedTables: DetectedTable[];
}

export interface ExamInfoGuess {
  title?: string;
  subject?: string;
  class?: string;
  duration?: string;
  marks?: string;
  date?: string;
}

export interface ParsedDoc {
  examInfo: ExamInfoGuess;
  sections: DetectedSection[];
  warnings: string[];
  counts: {
    sections: number;
    questions: number;
    images: number;
    tables: number;
  };
}

// The editable draft each question becomes on the Preview/Edit step.
// wizardType is inherited from the section but stored per-draft so per-question
// "Skip" and section-type flips are easy to apply.
export interface EditableQuestion {
  id: string;
  sectionId: string;
  wizardType: WizardQuestionType;
  text: string;
  options: string[];
  correctAnswer: string;
  marks: number;
  sectionLabel: string;
  sectionInstruction: string;
  passage: string;                 // resolved passage text (from sharedPassageId)
  images: DetectedImage[];         // resolved shared images
  tables: DetectedTable[];         // resolved shared tables
  sharedMediaIds: string[];
  sharedPassageId?: string;
  questionNumber: number | null;
}
