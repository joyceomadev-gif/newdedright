import * as XLSX from "xlsx";

export type TemplateVariant = "basic" | "with_pictures" | "with_pictures_equations" | "rich";

export interface TemplateContext {
  year: string;              // e.g. "2025" or "2024/2025"
  examType: string;          // CA1 | CA2 | CA3 | Exam
  className: string;         // e.g. "Year 3 Zinnia A"
  subjectName?: string;      // optional
}

const BASE_HEADERS = [
  "year",
  "exam_type",
  "class",
  "subject",
  "section",
  "instructions",
  "question_type",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "marks",
  "difficulty",
];

const PICTURE_HEADERS = ["image_url", "image_caption"];
const EQUATION_HEADERS = ["equation_latex"];

function headersFor(variant: TemplateVariant): string[] {
  if (variant === "basic") return BASE_HEADERS;
  if (variant === "with_pictures") return [...BASE_HEADERS, ...PICTURE_HEADERS];
  return [...BASE_HEADERS, ...PICTURE_HEADERS, ...EQUATION_HEADERS];
}

function sampleRows(variant: TemplateVariant, ctx: TemplateContext): Record<string, string>[] {
  const base = {
    year: ctx.year,
    exam_type: ctx.examType,
    class: ctx.className,
    subject: ctx.subjectName ?? "",
    difficulty: "easy",
  };
  const r1 = {
    ...base,
    section: "A",
    instructions: "Choose the correct answer from the options below.",
    question_type: "mcq",
    question_text: "What is 2 + 2?",
    option_a: "2",
    option_b: "3",
    option_c: "4",
    option_d: "5",
    correct_answer: "4",
    marks: "1",
  };
  const r2 = {
    ...base,
    section: "A",
    instructions: "Choose the correct answer from the options below.",
    question_type: "mcq",
    question_text: "Which colour is the sky on a clear day?",
    option_a: "Green",
    option_b: "Blue",
    option_c: "Red",
    option_d: "Yellow",
    correct_answer: "Blue",
    marks: "1",
  };
  const r3 = {
    ...base,
    section: "B",
    instructions: "Fill in the missing word.",
    question_type: "fill_gap",
    question_text: "The capital of Nigeria is ______.",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_answer: "Abuja",
    marks: "1",
  };

  if (variant === "basic") return [r1, r2, r3];

  const pic1 = {
    ...r1,
    section: "A",
    question_text: "Look at the picture. What animal is this?",
    option_a: "Cat", option_b: "Dog", option_c: "Cow", option_d: "Goat",
    correct_answer: "Dog",
    image_url: "https://example.com/images/dog.jpg",
    image_caption: "A brown puppy sitting on grass",
  };
  const pic2 = {
    ...r3,
    section: "B",
    question_text: "Study the map above and name the country shaded in green.",
    correct_answer: "Nigeria",
    image_url: "https://example.com/images/africa-map.jpg",
    image_caption: "Political map of West Africa",
  };

  if (variant === "with_pictures") return [r1, pic1, r3, pic2];

  const eq1 = {
    ...r1,
    section: "C",
    instructions: "Solve the equation and pick the correct answer.",
    question_text: "Evaluate the expression below.",
    option_a: "5", option_b: "7", option_c: "10", option_d: "12",
    correct_answer: "10",
    image_url: "",
    image_caption: "",
    equation_latex: "\\frac{20}{4} + 5",
  };
  const eq2 = {
    ...r3,
    section: "C",
    instructions: "Look at the diagram, then complete the equation.",
    question_text: "Given the triangle above, find the missing side using the formula.",
    correct_answer: "13",
    image_url: "https://example.com/images/triangle.jpg",
    image_caption: "Right-angled triangle, legs 5 and 12",
    equation_latex: "c = \\sqrt{a^{2} + b^{2}}",
  };

  return [r1, pic1, eq1, r3, eq2];
}

function instructionsSheet(variant: TemplateVariant, ctx: TemplateContext): string[][] {
  const commonTop = [
    ["Question Import Template"],
    [""],
    ["Year", ctx.year],
    ["Exam type", ctx.examType],
    ["Class", ctx.className],
    ["Subject", ctx.subjectName ?? ""],
    [""],
    ["How to use"],
    ["1. Fill one question per row on the 'Questions' sheet."],
    ["2. Do NOT rename or reorder the header row."],
    ["3. 'year', 'exam_type' and 'class' are pre-filled — leave them as is."],
    ["4. Allowed question_type values: mcq, fill_gap, short_answer, theory."],
    ["5. For MCQ, provide option_a..option_d and set correct_answer to match one of them exactly."],
    ["6. 'section' groups questions (e.g. A, B, C). 'instructions' shows once above the section."],
    ["7. 'difficulty' can be easy, medium or hard."],
  ];
  if (variant === "basic") return commonTop;
  const pics = [
    [""],
    ["Pictures"],
    ["- image_url: full https URL to the picture (JPG/PNG)."],
    ["- image_caption: short description shown under the picture (optional)."],
    ["- Leave both blank for questions without a picture."],
  ];
  if (variant === "with_pictures") return [...commonTop, ...pics];
  const eqs = [
    [""],
    ["Equations"],
    ["- equation_latex: LaTeX source (without $ signs), e.g. \\frac{a}{b} or x^{2}+y^{2}."],
    ["- Leave blank for questions without an equation."],
  ];
  return [...commonTop, ...pics, ...eqs];
}

export function downloadQuestionTemplate(variant: TemplateVariant, ctx: TemplateContext) {
  if (variant === "rich") { downloadRichTemplate(ctx); return; }
  const headers = headersFor(variant);
  const rows = sampleRows(variant, ctx);
  const aoa: (string | number)[][] = [headers, ...rows.map((r) => headers.map((h) => (r as Record<string, string>)[h] ?? ""))];
  const wb = XLSX.utils.book_new();
  const wsQ = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, wsQ, "Questions");
  const wsI = XLSX.utils.aoa_to_sheet(instructionsSheet(variant, ctx));
  XLSX.utils.book_append_sheet(wb, wsI, "Instructions");
  const suffix =
    variant === "basic" ? "text-only"
    : variant === "with_pictures" ? "with-pictures"
    : "pictures-equations";
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const name = `question-template-${safe(ctx.examType || "exam")}-${safe(ctx.className || "class")}-${safe(ctx.year || "year")}-${suffix}.xlsx`;
  XLSX.writeFile(wb, name);
}

/* =====================================================================
 * RICH TEMPLATE
 * Multi-sheet workbook covering everything the recent hand-written
 * migrations (Zinnia / Orchid / Gladiolus / Buttercups) encoded:
 *   - plain text questions
 *   - questions with pictures / diagrams / figures (0..N images each)
 *   - shared reading passages / stories (one passage → many questions)
 *   - shared figures (one image referenced by several questions)
 *   - equations (LaTeX)
 *   - sections with per-section instructions
 * Sheets:
 *   1. Exam       – one-row header for the whole workbook
 *   2. Passages   – 0..N passages, referenced by passage_id
 *   3. Questions  – one row per question
 *   4. Media      – optional manifest mapping local filenames → URLs
 *   5. Instructions – human-readable guide
 * ===================================================================== */

const RICH_EXAM_HEADERS = [
  "year", "term", "exam_type", "class", "subject",
  "duration_min", "total_marks", "instructions",
];

const RICH_PASSAGE_HEADERS = [
  "passage_id", "title", "body_text", "image_urls", "caption",
];

const RICH_QUESTION_HEADERS = [
  "section", "section_instructions", "passage_id",
  "question_no", "question_type", "question_text", "equation_latex",
  "image_urls", "image_caption",
  "option_a", "option_b", "option_c", "option_d", "option_e", "option_f",
  "correct_answer", "marks", "difficulty", "explanation",
];

const RICH_MEDIA_HEADERS = ["local_name", "uploaded_url", "alt_text"];

function richExamRows(ctx: TemplateContext): (string | number)[][] {
  return [
    RICH_EXAM_HEADERS,
    [
      ctx.year || "2025",
      "Third Term",
      ctx.examType || "Exam",
      ctx.className || "Year 3 Zinnia A",
      ctx.subjectName || "Mathematics",
      60,
      40,
      "Answer ALL questions. Section A is objective, Section B is theory.",
    ],
  ];
}

function richPassageRows(): (string | number)[][] {
  return [
    RICH_PASSAGE_HEADERS,
    [
      "P1",
      "The School Swap",
      "Ade woke up one morning to find that everything in his school had changed. The chairs were now made of jelly, the blackboard sang songs, and his teacher greeted the class in three different languages. He rubbed his eyes but nothing went back to normal...",
      "school-swap-1.jpg, school-swap-2.jpg",
      "Ade's magical classroom",
    ],
    [
      "FIG_PIE",
      "Pupils' favourite fruits (pie chart)",
      "",
      "fruit-pie-chart.png",
      "Pie chart showing 40% mango, 30% orange, 20% banana, 10% pineapple.",
    ],
  ];
}

function richQuestionRows(): (string | number)[][] {
  return [
    RICH_QUESTION_HEADERS,
    // --- Section A: plain MCQ ---
    ["A", "Choose the correct answer.", "", 1, "mcq", "What is 12 + 7?", "",
     "", "",
     "17", "18", "19", "20", "", "", "19", 1, "easy", "12 + 7 = 19"],
    // --- Section A: MCQ with a picture ---
    ["A", "Choose the correct answer.", "", 2, "mcq", "What animal is shown in the picture?", "",
     "dog.jpg", "A brown puppy sitting on grass",
     "Cat", "Dog", "Cow", "Goat", "", "", "Dog", 1, "easy", ""],
    // --- Section A: MCQ that shares a figure with the next question ---
    ["A", "Use the pie chart to answer questions 3 and 4.", "FIG_PIE", 3, "mcq",
     "Which fruit is the pupils' favourite?", "",
     "", "",
     "Mango", "Orange", "Banana", "Pineapple", "", "", "Mango", 1, "easy",
     "40% is the largest slice."],
    ["A", "", "FIG_PIE", 4, "mcq",
     "What percentage of pupils chose orange?", "",
     "", "",
     "10%", "20%", "30%", "40%", "", "", "30%", 1, "medium", ""],
    // --- Section A: math MCQ with LaTeX equation ---
    ["A", "", "", 5, "mcq",
     "Evaluate the expression below.", "\\frac{20}{4} + 5",
     "", "",
     "5", "7", "10", "12", "", "", "10", 1, "medium", "20 / 4 = 5, 5 + 5 = 10"],
    // --- Section B: comprehension using passage P1 ---
    ["B", "Read the passage above then answer questions 6 – 8.", "P1", 6, "short_answer",
     "What was strange about the chairs in Ade's school?", "",
     "", "", "", "", "", "", "", "",
     "They were made of jelly", 2, "easy", ""],
    ["B", "", "P1", 7, "short_answer",
     "How did the teacher greet the class?", "",
     "", "", "", "", "", "", "", "",
     "In three different languages", 2, "medium", ""],
    ["B", "", "P1", 8, "theory",
     "In your own words, describe how Ade felt when he saw the changes. (3 – 5 sentences)", "",
     "", "", "", "", "", "", "", "",
     "", 5, "hard", "Look for surprise, confusion or wonder in the answer."],
    // --- Section C: theory with a figure ---
    ["C", "Study the diagram then answer the question.", "", 9, "theory",
     "Using the right-angled triangle shown, find the length of the hypotenuse.", "c = \\sqrt{a^{2} + b^{2}}",
     "triangle.jpg", "Right-angled triangle with legs 5 and 12",
     "", "", "", "", "", "", "13", 3, "medium",
     "√(25 + 144) = √169 = 13"],
    // --- Section C: fill-in-the-gap ---
    ["C", "", "", 10, "fill_gap",
     "The capital of Nigeria is ______.", "",
     "", "", "", "", "", "", "", "",
     "Abuja", 1, "easy", ""],
  ];
}

function richMediaRows(): (string | number)[][] {
  return [
    RICH_MEDIA_HEADERS,
    ["school-swap-1.jpg", "", "Ade in his classroom with jelly chairs"],
    ["school-swap-2.jpg", "", "Singing blackboard"],
    ["fruit-pie-chart.png", "", "Pie chart of favourite fruits"],
    ["dog.jpg", "", "Brown puppy on grass"],
    ["triangle.jpg", "", "Right-angled triangle 5-12-13"],
  ];
}

function richInstructions(ctx: TemplateContext): (string | number)[][] {
  return [
    ["Rich Question Import Template"],
    [""],
    ["Pre-filled for", `${ctx.examType || "Exam"} • ${ctx.className || "Class"} • ${ctx.year || "Year"}${ctx.subjectName ? " • " + ctx.subjectName : ""}`],
    [""],
    ["What this template supports"],
    ["• Plain text questions (any subject)."],
    ["• Questions with one or more pictures / diagrams / figures."],
    ["• Comprehension passages, stories or cloze paragraphs shared by many questions."],
    ["• A single figure (map, chart, diagram) shared by several questions."],
    ["• Math equations written in LaTeX."],
    ["• Sections (A / B / C…) with instructions shown once above the section."],
    [""],
    ["Sheets in this workbook"],
    ["1. Exam        – one row describing the whole exam. Fill it in first."],
    ["2. Passages    – optional. One row per reading passage or shared figure."],
    ["3. Questions   – one row per question. Reference a passage by its passage_id."],
    ["4. Media       – optional. List picture filenames here so the importer can resolve them."],
    ["5. Instructions – this sheet."],
    [""],
    ["Step-by-step"],
    ["1. Fill the Exam sheet (year, term, exam_type, class, subject, duration_min, total_marks, instructions)."],
    ["2. For each reading passage or shared figure, add ONE row on the Passages sheet and give it a short passage_id (e.g. P1, MAP, PIE)."],
    ["3. On the Questions sheet, add one row per question."],
    ["   • section: A, B, C… – questions with the same section are grouped together."],
    ["   • section_instructions: type once on the FIRST question of the section; leave blank on the rest."],
    ["   • passage_id: fill this on every question that belongs to a passage / shared figure. Leave blank for standalone questions."],
    ["   • question_no: 1, 2, 3… (renumber freely – used only for display order)."],
    ["   • question_type: one of mcq | true_false | fill_gap | short_answer | theory | matching."],
    ["   • question_text: the question itself. HTML is allowed if you already use rich text."],
    ["   • equation_latex: LaTeX WITHOUT $ signs, e.g. \\frac{a}{b} or x^{2}+y^{2}. Leave blank for non-math questions."],
    ["   • image_urls: comma-separated. Either a full https URL, or a filename you listed on the Media sheet."],
    ["   • image_caption: short description shown under the image."],
    ["   • option_a..option_f: MCQ options (up to 6). Leave blanks for non-MCQ."],
    ["   • correct_answer: for MCQ, the option TEXT that is correct (e.g. \"Blue\"); for multi-correct MCQ, separate with a semicolon (e.g. \"Blue;Red\"); for fill_gap / short_answer, the expected answer; leave blank for theory."],
    ["   • marks: whole number. Defaults to 1 if blank."],
    ["   • difficulty: easy | medium | hard."],
    ["   • explanation: optional teacher note / marking guide."],
    [""],
    ["Pictures – two ways to attach them"],
    ["A) You already have a public URL: paste the full https URL directly into image_urls."],
    ["B) You are uploading the picture with the workbook:"],
    ["   1. Put the filename (e.g. dog.jpg) in image_urls on the Questions sheet."],
    ["   2. List the same filename on the Media sheet under local_name."],
    ["   3. Upload the picture files alongside the workbook when importing."],
    ["   The importer replaces every local_name with the uploaded URL."],
    [""],
    ["Shared passages / figures"],
    ["• Add ONE Passages row per passage or shared figure."],
    ["• Give it a short passage_id (e.g. P1, SCHOOL_SWAP, FIG_PIE)."],
    ["• Put the story or paragraph in body_text."],
    ["• For a shared figure with no body text, leave body_text blank and put the picture in image_urls."],
    ["• On each Questions row that uses this passage, set passage_id to the same code."],
    ["• The passage is stored once and shown above every question that references it."],
    [""],
    ["Reusing this template for another class"],
    ["1. Change the Exam sheet values (year, term, exam_type, class, subject)."],
    ["2. Clear the Passages and Questions rows and add your own."],
    ["3. Save with a new filename – the workbook name is only a label."],
    [""],
    ["Common mistakes to avoid"],
    ["• Do not rename or reorder header columns on any sheet."],
    ["• Do not leave question_type blank."],
    ["• For MCQ, correct_answer must match one of the option cells EXACTLY (spelling, case, spacing)."],
    ["• If you reference a passage_id on the Questions sheet, that same id must exist on the Passages sheet."],
    ["• Filenames in image_urls that are not on the Media sheet must be full https URLs."],
    [""],
    ["Worked example"],
    ["This workbook ships with a fully-populated example on every sheet – 10 questions covering all patterns above. Delete the example rows before importing your own content."],
  ];
}

function downloadRichTemplate(ctx: TemplateContext) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(richExamRows(ctx)), "Exam");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(richPassageRows()), "Passages");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(richQuestionRows()), "Questions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(richMediaRows()), "Media");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(richInstructions(ctx)), "Instructions");
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const name = `question-template-rich-${safe(ctx.examType || "exam")}-${safe(ctx.className || "class")}-${safe(ctx.year || "year")}.xlsx`;
  XLSX.writeFile(wb, name);
}

