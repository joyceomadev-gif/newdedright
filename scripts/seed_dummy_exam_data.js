import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env manually
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase URL or Key in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function seedExams() {
  console.log("Seeding CBT Exams & Questions into Supabase...");

  // 1. Get current Session, Term, Class (LAVENDER)
  const { data: session } = await supabase.from("sessions").select("id").eq("is_current", true).limit(1).single();
  const { data: term } = await supabase.from("terms").select("id").eq("is_current", true).limit(1).single();
  const { data: klass } = await supabase.from("classes").select("id").eq("name", "LAVENDER").single();

  if (!session || !term || !klass) {
    console.error("Session, Term, or Class LAVENDER not found.");
    return;
  }

  // 2. Ensure Student "Teyu Godwin" exists in LAVENDER
  let { data: teyu } = await supabase
    .from("students")
    .select("id,full_name")
    .eq("class_id", klass.id)
    .ilike("full_name", "%teyu%")
    .maybeSingle();

  if (!teyu) {
    const { data: newTeyu, error: errTeyu } = await supabase
      .from("students")
      .insert({
        full_name: "Teyu Godwin",
        admission_no: "N|020|0777",
        class_id: klass.id,
        status: "active",
      })
      .select("id,full_name")
      .single();
    if (errTeyu) console.error("Error creating Teyu student:", errTeyu);
    else teyu = newTeyu;
  }
  console.log("Student Teyu Godwin ID:", teyu?.id);

  // 3. Fetch subjects for LAVENDER
  const { data: subjects } = await supabase.from("subjects").select("id,name").eq("class_id", klass.id);
  if (!subjects || subjects.length === 0) {
    console.error("No subjects found for LAVENDER.");
    return;
  }

  const mathSubj = subjects.find(s => s.name.toLowerCase().includes("math")) || subjects[0];
  const engSubj = subjects.find(s => s.name.toLowerCase().includes("english")) || subjects[1] || subjects[0];

  // Helper to create or fetch exam
  async function getOrCreateExam(title, subjectId) {
    let { data: exam } = await supabase
      .from("exams")
      .select("id")
      .eq("class_id", klass.id)
      .eq("subject_id", subjectId)
      .eq("term_id", term.id)
      .maybeSingle();

    if (!exam) {
      const { data: newExam, error: errEx } = await supabase
        .from("exams")
        .insert({
          title,
          class_id: klass.id,
          subject_id: subjectId,
          term_id: term.id,
          session_id: session.id,
          purpose: "exam",
          type: "cbt",
          status: "draft",
          published: false,
          max_score: 70,
          duration_minutes: 45,
          question_source: "manual",
          time_zone: "UTC",
        })
        .select("id")
        .single();
      if (errEx) { console.error(`Error creating ${title}:`, errEx); return null; }
      exam = newExam;
    }
    return exam;
  }

  // 4. Mathematics CBT Exam
  const mathExam = await getOrCreateExam("Mathematics End of Term CBT Exam", mathSubj.id);
  if (mathExam) {
    console.log("Mathematics CBT Exam ID:", mathExam.id);
    await supabase.from("questions").delete().eq("exam_id", mathExam.id);

    const mathQuestions = [
      {
        exam_id: mathExam.id,
        question_text: "What is 15 + 27?",
        question_type: "mcq",
        marks: 5,
        position: 1,
        options: [
          { key: "A", text: "32" },
          { key: "B", text: "42" },
          { key: "C", text: "52" },
          { key: "D", text: "40" }
        ],
        correct_answer: "B",
      },
      {
        exam_id: mathExam.id,
        question_text: "Solve for x: 2x + 6 = 20.",
        question_type: "mcq",
        marks: 5,
        position: 2,
        options: [
          { key: "A", text: "x = 5" },
          { key: "B", text: "x = 6" },
          { key: "C", text: "x = 7" },
          { key: "D", text: "x = 8" }
        ],
        correct_answer: "C",
      },
      {
        exam_id: mathExam.id,
        question_text: "Calculate the area of a rectangle with length 8cm and width 5cm.",
        question_type: "mcq",
        marks: 5,
        position: 3,
        options: [
          { key: "A", text: "40 sq cm" },
          { key: "B", text: "26 sq cm" },
          { key: "C", text: "13 sq cm" },
          { key: "D", text: "48 sq cm" }
        ],
        correct_answer: "A",
      },
      {
        exam_id: mathExam.id,
        question_text: "What is 144 divided by 12?",
        question_type: "mcq",
        marks: 5,
        position: 4,
        options: [
          { key: "A", text: "10" },
          { key: "B", text: "11" },
          { key: "C", text: "12" },
          { key: "D", text: "14" }
        ],
        correct_answer: "C",
      },
      {
        exam_id: mathExam.id,
        question_text: "Theory Question 1: Show your step-by-step calculation to find the perimeter and area of a square with side length 9cm.",
        question_type: "theory",
        marks: 25,
        position: 5,
        options: null,
        correct_answer: null,
      },
      {
        exam_id: mathExam.id,
        question_text: "Theory Question 2: Explain the difference between prime numbers and composite numbers, and list all prime numbers between 1 and 20.",
        question_type: "theory",
        marks: 25,
        position: 6,
        options: null,
        correct_answer: null,
      },
    ];

    const { error: errMathQ } = await supabase.from("questions").insert(mathQuestions);
    if (errMathQ) console.error("Error inserting Math questions:", errMathQ);
    else console.log(`Inserted ${mathQuestions.length} questions for Mathematics exam.`);
  }

  // 5. English Language CBT Exam
  const engExam = await getOrCreateExam("English Language End of Term CBT Exam", engSubj.id);
  if (engExam) {
    console.log("English Language CBT Exam ID:", engExam.id);
    await supabase.from("questions").delete().eq("exam_id", engExam.id);

    const engQuestions = [
      {
        exam_id: engExam.id,
        question_text: "Choose the correct antonym for the word 'GENEROUS':",
        question_type: "mcq",
        marks: 5,
        position: 1,
        options: [
          { key: "A", text: "Stingy" },
          { key: "B", text: "Kind" },
          { key: "C", text: "Polite" },
          { key: "D", text: "Brave" }
        ],
        correct_answer: "A",
      },
      {
        exam_id: engExam.id,
        question_text: "Identify the noun in the sentence: 'The swift leopard ran through the forest.'",
        question_type: "mcq",
        marks: 5,
        position: 2,
        options: [
          { key: "A", text: "swift" },
          { key: "B", text: "leopard" },
          { key: "C", text: "ran" },
          { key: "D", text: "through" }
        ],
        correct_answer: "B",
      },
      {
        exam_id: engExam.id,
        question_text: "Which of the following is a proper noun?",
        question_type: "mcq",
        marks: 5,
        position: 3,
        options: [
          { key: "A", text: "city" },
          { key: "B", text: "river" },
          { key: "C", text: "Nigeria" },
          { key: "D", text: "building" }
        ],
        correct_answer: "C",
      },
      {
        exam_id: engExam.id,
        question_text: "Choose the correct past tense of 'SPEAK':",
        question_type: "mcq",
        marks: 5,
        position: 4,
        options: [
          { key: "A", text: "Speaked" },
          { key: "B", text: "Spoke" },
          { key: "C", text: "Spoken" },
          { key: "D", text: "Speaking" }
        ],
        correct_answer: "B",
      },
      {
        exam_id: engExam.id,
        question_text: "Essay Question 1: Write a composition of about 150 words describing your memorable first day at school.",
        question_type: "theory",
        marks: 25,
        position: 5,
        options: null,
        correct_answer: null,
      },
      {
        exam_id: engExam.id,
        question_text: "Essay Question 2: Read the provided passage carefully and summarize the three main reasons for environmental conservation.",
        question_type: "theory",
        marks: 25,
        position: 6,
        options: null,
        correct_answer: null,
      },
    ];

    const { error: errEngQ } = await supabase.from("questions").insert(engQuestions);
    if (errEngQ) console.error("Error inserting English questions:", errEngQ);
    else console.log(`Inserted ${engQuestions.length} questions for English exam.`);
  }

  // Set published = true & status = 'published' via query if possible
  if (mathExam) {
    await supabase.from("exams").update({ published: true, status: "published" }).eq("id", mathExam.id);
  }
  if (engExam) {
    await supabase.from("exams").update({ published: true, status: "published" }).eq("id", engExam.id);
  }

  console.log("\nCBT Test Exams successfully created & seeded with MCQ and Theory questions!");
}

seedExams().catch(console.error);
