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

async function masterSeed() {
  console.log("==================================================");
  console.log("🚀 STARTING MASTER DB CLEAN & SEED PROCEDURE...");
  console.log("==================================================\n");

  // 1. Session Setup
  let { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("name", "2025/2026 Academic Session")
    .maybeSingle();

  if (!session) {
    const { data: newSess, error } = await supabase
      .from("sessions")
      .insert({
        name: "2025/2026 Academic Session",
        start_date: "2025-09-01",
        end_date: "2026-07-30",
        is_current: true,
      })
      .select("id")
      .single();
    if (error) console.error("Error session:", error);
    session = newSess;
  } else {
    await supabase.from("sessions").update({ is_current: true }).eq("id", session.id);
  }
  console.log("✅ Academic Session ID:", session?.id);

  // 2. Term Setup
  let { data: term } = await supabase
    .from("terms")
    .select("id")
    .eq("session_id", session.id)
    .eq("name", "third")
    .maybeSingle();

  if (!term) {
    const { data: newTerm, error } = await supabase
      .from("terms")
      .insert({
        session_id: session.id,
        name: "third",
        start_date: "2026-05-01",
        end_date: "2026-07-30",
        is_current: true,
      })
      .select("id")
      .single();
    if (error) console.error("Error term:", error);
    term = newTerm;
  } else {
    await supabase.from("terms").update({ is_current: true }).eq("id", term.id);
  }
  console.log("✅ Term ID (third / Term 3):", term?.id);

  // 3. School Settings
  await supabase.from("school_settings").upsert({
    id: 1,
    school_name: "Gila University Suite Academy",
    ca1_weight: 15,
    ca2_weight: 0,
    ca3_weight: 0,
    exam_weight: 70,
    grading_scale: JSON.stringify([
      { grade: "A", min: 70, max: 100, remark: "Excellent", grade_point: 5 },
      { grade: "B", min: 60, max: 69, remark: "Very Good", grade_point: 4 },
      { grade: "C", min: 50, max: 59, remark: "Good", grade_point: 3 },
      { grade: "D", min: 45, max: 49, remark: "Pass", grade_point: 2 },
      { grade: "E", min: 40, max: 44, remark: "Weak Pass", grade_point: 1 },
      { grade: "F", min: 0, max: 39, remark: "Fail", grade_point: 0 },
    ]),
  });
  console.log("✅ School Settings configured.");

  // 4. Classes Setup
  let { data: lavender } = await supabase
    .from("classes")
    .select("id")
    .eq("name", "LAVENDER")
    .maybeSingle();

  if (!lavender) {
    const { data: newKlass } = await supabase
      .from("classes")
      .insert({ name: "LAVENDER", level: "primary" })
      .select("id")
      .single();
    lavender = newKlass;
  } else {
    await supabase.from("classes").update({ level: "primary" }).eq("id", lavender.id);
  }
  console.log("✅ Class LAVENDER (primary) ID:", lavender?.id);

  // 5. Assessment Structure Setup
  // Primary structure: CA1 (15 | 30%), EXAM (70 | 70%)
  let { data: priStruct } = await supabase
    .from("assessment_structures")
    .select("id")
    .eq("education_level", "primary")
    .is("deleted_at", null)
    .maybeSingle();

  if (!priStruct) {
    const { data: newStr } = await supabase
      .from("assessment_structures")
      .insert({
        name: "Primary Assessment Structure",
        education_level: "primary",
        total_max_score: 100,
        is_default: false,
      })
      .select("id")
      .single();
    priStruct = newStr;
  }

  if (priStruct) {
    await supabase.from("assessment_components").delete().eq("structure_id", priStruct.id);
    await supabase.from("assessment_components").insert([
      { structure_id: priStruct.id, code: "CA1", name: "Continuous Assessment 1", max_score: 15, weight_percentage: 30, display_order: 1, is_mandatory: true },
      { structure_id: priStruct.id, code: "EXAM", name: "End of Term Exam", max_score: 70, weight_percentage: 70, display_order: 2, is_mandatory: true },
    ]);
    console.log("✅ Primary Assessment Structure configured (CA1: 15/30%, EXAM: 70/70%).");
  }

  // 6. Grading Scale Setup (Scale A)
  let { data: scaleA } = await supabase
    .from("grading_scales")
    .select("id")
    .eq("name", "Scale A")
    .maybeSingle();

  const scaleBands = [
    { grade: "A", min: 70, max: 100, remark: "Excellent", grade_point: 5 },
    { grade: "B", min: 60, max: 69, remark: "Very Good", grade_point: 4 },
    { grade: "C", min: 50, max: 59, remark: "Good", grade_point: 3 },
    { grade: "D", min: 45, max: 49, remark: "Pass", grade_point: 2 },
    { grade: "E", min: 40, max: 44, remark: "Weak Pass", grade_point: 1 },
    { grade: "F", min: 0, max: 39, remark: "Fail", grade_point: 0 },
  ];

  if (!scaleA) {
    await supabase.from("grading_scales").insert({
      name: "Scale A",
      education_level: "all",
      is_default: true,
      bands: JSON.stringify(scaleBands),
    });
  } else {
    await supabase.from("grading_scales").update({ bands: JSON.stringify(scaleBands), is_default: true }).eq("id", scaleA.id);
  }
  console.log("✅ Dynamic Grading Scale (Scale A) configured.");

  // 7. Subjects for LAVENDER
  const lavenderSubjectNames = ["Mathematics", "English Language", "Accounting", "Basic Science"];
  const lavenderSubjectsMap = {};

  for (const name of lavenderSubjectNames) {
    let { data: subj } = await supabase
      .from("subjects")
      .select("id")
      .eq("class_id", lavender.id)
      .eq("name", name)
      .maybeSingle();

    if (!subj) {
      const { data: newSubj } = await supabase
        .from("subjects")
        .insert({ name, code: name.substring(0, 3).toUpperCase(), class_id: lavender.id })
        .select("id")
        .single();
      subj = newSubj;
    }
    if (subj) lavenderSubjectsMap[name] = subj.id;
  }
  console.log("✅ LAVENDER Subjects:", Object.keys(lavenderSubjectsMap));

  // 8. Students in LAVENDER
  const studentData = [
    { full_name: "Teyu Godwin", admission_no: "N|020|0777" },
    { full_name: "Adebayo Ayominde Godwin", admission_no: "N|020|0629" },
    { full_name: "Adegbite Hesidel", admission_no: "N|020|0424" },
    { full_name: "Adeyemi Adedeji", admission_no: "N|020|0403" },
    { full_name: "Arabina Grace", admission_no: "P|020|0375" },
    { full_name: "Bello Chidubem", admission_no: "P|020|0511" },
  ];
  const lavenderStudents = [];

  for (const st of studentData) {
    let { data: student } = await supabase
      .from("students")
      .select("id,full_name,admission_no")
      .eq("class_id", lavender.id)
      .eq("admission_no", st.admission_no)
      .maybeSingle();

    if (!student) {
      const { data: newSt } = await supabase
        .from("students")
        .insert({ full_name: st.full_name, admission_no: st.admission_no, class_id: lavender.id, status: "active" })
        .select("id,full_name,admission_no")
        .single();
      student = newSt;
    }
    if (student) lavenderStudents.push(student);
  }
  console.log(`✅ Loaded ${lavenderStudents.length} Active Students in LAVENDER (including Teyu Godwin).`);

  // 9. CBT Exams & Questions for LAVENDER
  const mathSubjId = lavenderSubjectsMap["Mathematics"];
  const engSubjId = lavenderSubjectsMap["English Language"];

  async function getOrCreateExam(title, subjectId) {
    let { data: exam } = await supabase
      .from("exams")
      .select("id")
      .eq("class_id", lavender.id)
      .eq("subject_id", subjectId)
      .eq("term_id", term.id)
      .maybeSingle();

    if (!exam) {
      const { data: newExam } = await supabase
        .from("exams")
        .insert({
          title,
          class_id: lavender.id,
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
      exam = newExam;
    }
    return exam;
  }

  const mathExam = await getOrCreateExam("Mathematics End of Term CBT Exam", mathSubjId);
  if (mathExam) {
    await supabase.from("questions").delete().eq("exam_id", mathExam.id);
    await supabase.from("questions").insert([
      {
        exam_id: mathExam.id, question_text: "What is 15 + 27?", question_type: "mcq", marks: 5, position: 1,
        options: [{ key: "A", text: "32" }, { key: "B", text: "42" }, { key: "C", text: "52" }, { key: "D", text: "40" }], correct_answer: "B",
      },
      {
        exam_id: mathExam.id, question_text: "Solve for x: 2x + 6 = 20.", question_type: "mcq", marks: 5, position: 2,
        options: [{ key: "A", text: "x = 5" }, { key: "B", text: "x = 6" }, { key: "C", text: "x = 7" }, { key: "D", text: "x = 8" }], correct_answer: "C",
      },
      {
        exam_id: mathExam.id, question_text: "Calculate area of rectangle 8cm x 5cm.", question_type: "mcq", marks: 5, position: 3,
        options: [{ key: "A", text: "40 sq cm" }, { key: "B", text: "26 sq cm" }, { key: "C", text: "13 sq cm" }], correct_answer: "A",
      },
      {
        exam_id: mathExam.id, question_text: "What is 144 / 12?", question_type: "mcq", marks: 5, position: 4,
        options: [{ key: "A", text: "10" }, { key: "B", text: "11" }, { key: "C", text: "12" }], correct_answer: "C",
      },
      {
        exam_id: mathExam.id, question_text: "Theory Question 1: Show calculation for perimeter and area of square side 9cm.",
        question_type: "theory", marks: 25, position: 5, options: null, correct_answer: null,
      },
      {
        exam_id: mathExam.id, question_text: "Theory Question 2: List all prime numbers between 1 and 20.",
        question_type: "theory", marks: 25, position: 6, options: null, correct_answer: null,
      },
    ]);
    console.log("✅ Mathematics CBT Exam & Questions ready (Draft mode).");
  }

  const engExam = await getOrCreateExam("English Language End of Term CBT Exam", engSubjId);
  if (engExam) {
    await supabase.from("questions").delete().eq("exam_id", engExam.id);
    await supabase.from("questions").insert([
      {
        exam_id: engExam.id, question_text: "Choose the correct antonym for 'GENEROUS':", question_type: "mcq", marks: 5, position: 1,
        options: [{ key: "A", text: "Stingy" }, { key: "B", text: "Kind" }, { key: "C", text: "Polite" }], correct_answer: "A",
      },
      {
        exam_id: engExam.id, question_text: "Identify noun: 'The swift leopard ran through the forest.'", question_type: "mcq", marks: 5, position: 2,
        options: [{ key: "A", text: "swift" }, { key: "B", text: "leopard" }, { key: "C", text: "ran" }], correct_answer: "B",
      },
      {
        exam_id: engExam.id, question_text: "Which is a proper noun?", question_type: "mcq", marks: 5, position: 3,
        options: [{ key: "A", text: "city" }, { key: "B", text: "river" }, { key: "C", text: "Nigeria" }], correct_answer: "C",
      },
      {
        exam_id: engExam.id, question_text: "Past tense of 'SPEAK':", question_type: "mcq", marks: 5, position: 4,
        options: [{ key: "A", text: "Speaked" }, { key: "B", text: "Spoke" }, { key: "C", text: "Spoken" }], correct_answer: "B",
      },
      {
        exam_id: engExam.id, question_text: "Theory Question 1: Write a composition describing your first day at school.",
        question_type: "theory", marks: 25, position: 5, options: null, correct_answer: null,
      },
      {
        exam_id: engExam.id, question_text: "Theory Question 2: Summarize three main reasons for environmental conservation.",
        question_type: "theory", marks: 25, position: 6, options: null, correct_answer: null,
      },
    ]);
    console.log("✅ English Language CBT Exam & Questions ready (Draft mode).");
  }

  // 10. Broadsheet Header & Broadsheet Sample Scores
  let { data: header } = await supabase
    .from("broadsheet_headers")
    .select("id")
    .eq("session_id", session.id)
    .eq("term_id", term.id)
    .eq("class_id", lavender.id)
    .maybeSingle();

  if (!header) {
    const { data: newHead } = await supabase
      .from("broadsheet_headers")
      .insert({
        session_id: session.id,
        term_id: term.id,
        class_id: lavender.id,
        status: "draft",
      })
      .select("id")
      .single();
    header = newHead;
  }

  if (header) {
    const rows = [];
    for (const st of lavenderStudents) {
      for (const subjId of Object.values(lavenderSubjectsMap)) {
        const ca1 = Math.floor(Math.random() * 4) + 11; // 11-14 out of 15
        const examScore = Math.floor(Math.random() * 15) + 45; // 45-59 out of 70
        rows.push({
          header_id: header.id,
          session_id: session.id,
          term_id: term.id,
          class_id: lavender.id,
          student_id: st.id,
          subject_id: subjId,
          ca1,
          ca2: null,
          ca3: null,
          exam_score: examScore,
        });
      }
    }

    const { error: errRows } = await supabase
      .from("broadsheets")
      .upsert(rows, { onConflict: "session_id,term_id,class_id,student_id,subject_id" });

    if (!errRows) console.log(`✅ Broadsheet sample score records upserted (${rows.length} rows).`);
  }

  console.log("\n==================================================");
  console.log("🎉 MASTER SEED PROCEDURE COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

masterSeed().catch(console.error);
