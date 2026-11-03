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

async function seed() {
  console.log("Seeding test data into Supabase...");

  // 1. Session
  let { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("name", "2025/2026 Academic Session")
    .maybeSingle();

  if (!session) {
    const { data: newSess, error: errSess } = await supabase
      .from("sessions")
      .insert({
        name: "2025/2026 Academic Session",
        start_date: "2025-09-01",
        end_date: "2026-07-30",
        is_current: true,
      })
      .select("id")
      .single();
    if (errSess) { console.error("Error creating session:", errSess); return; }
    session = newSess;
  }
  console.log("Session ID:", session.id);

  // 2. Term
  let { data: term } = await supabase
    .from("terms")
    .select("id")
    .eq("session_id", session.id)
    .maybeSingle();

  if (!term) {
    const { data: newTerm, error: errTerm } = await supabase
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
    if (errTerm) { console.error("Error creating term:", errTerm); return; }
    term = newTerm;
  }
  console.log("Term ID:", term.id);

  // 3. Class
  let { data: klass } = await supabase
    .from("classes")
    .select("id")
    .eq("name", "LAVENDER")
    .maybeSingle();

  if (!klass) {
    const { data: newKlass, error: errKlass } = await supabase
      .from("classes")
      .insert({
        name: "LAVENDER",
        level: "primary",
      })
      .select("id")
      .single();
    if (errKlass) { console.error("Error creating class:", errKlass); return; }
    klass = newKlass;
  }
  console.log("Class LAVENDER ID:", klass.id);

  // 4. Subjects for LAVENDER
  const subjectNames = ["English Language", "Mathematics", "Accounting", "Basic Science"];
  const subjectsMap = {};

  for (const name of subjectNames) {
    let { data: subj } = await supabase
      .from("subjects")
      .select("id")
      .eq("class_id", klass.id)
      .eq("name", name)
      .maybeSingle();

    if (!subj) {
      const { data: newSubj, error: errSubj } = await supabase
        .from("subjects")
        .insert({
          name: name,
          code: name.substring(0, 3).toUpperCase(),
          class_id: klass.id,
        })
        .select("id")
        .single();
      if (errSubj) { console.error(`Error creating subject ${name}:`, errSubj); continue; }
      subj = newSubj;
    }
    if (subj) subjectsMap[name] = subj.id;
  }
  console.log("Subjects map:", subjectsMap);

  // 5. Students in LAVENDER
  const studentData = [
    { full_name: "Adebayo Ayominde Godwin", admission_no: "N|020|0629" },
    { full_name: "Adegbite Hesidel", admission_no: "N|020|0424" },
    { full_name: "Adeyemi Adedeji", admission_no: "N|020|0403" },
    { full_name: "Arabina Grace", admission_no: "P|020|0375" },
    { full_name: "Bello Chidubem", admission_no: "P|020|0511" },
  ];
  const studentsList = [];

  for (const st of studentData) {
    let { data: student } = await supabase
      .from("students")
      .select("id,full_name")
      .eq("class_id", klass.id)
      .eq("admission_no", st.admission_no)
      .maybeSingle();

    if (!student) {
      const { data: newSt, error: errSt } = await supabase
        .from("students")
        .insert({
          full_name: st.full_name,
          admission_no: st.admission_no,
          class_id: klass.id,
          status: "active",
        })
        .select("id,full_name")
        .single();
      if (errSt) { console.error(`Error creating student ${st.full_name}:`, errSt); continue; }
      student = newSt;
    }
    if (student) studentsList.push(student);
  }
  console.log(`Created/found ${studentsList.length} active students in LAVENDER.`);

  // 6. Create Broadsheet Header & Broadsheet Rows
  let { data: header } = await supabase
    .from("broadsheet_headers")
    .select("id")
    .eq("session_id", session.id)
    .eq("term_id", term.id)
    .eq("class_id", klass.id)
    .maybeSingle();

  if (!header) {
    const { data: newHead, error: errHead } = await supabase
      .from("broadsheet_headers")
      .insert({
        session_id: session.id,
        term_id: term.id,
        class_id: klass.id,
        status: "draft",
      })
      .select("id")
      .single();
    if (errHead) { console.error("Error creating broadsheet header:", errHead); }
    else { header = newHead; }
  }

  if (header) {
    console.log("Broadsheet Header ID:", header.id);
    const rows = [];
    for (const st of studentsList) {
      for (const subjId of Object.values(subjectsMap)) {
        const ca1 = Math.floor(Math.random() * 10) + 30; // 30-39
        const exam = Math.floor(Math.random() * 15) + 45; // 45-59
        rows.push({
          header_id: header.id,
          session_id: session.id,
          term_id: term.id,
          class_id: klass.id,
          student_id: st.id,
          subject_id: subjId,
          ca1: ca1,
          ca2: null,
          ca3: null,
          exam_score: exam,
        });
      }
    }

    if (rows.length > 0) {
      const { error: errRows } = await supabase
        .from("broadsheets")
        .upsert(rows, { onConflict: "session_id,term_id,class_id,student_id,subject_id" });

      if (errRows) console.error("Error upserting broadsheet rows:", errRows);
      else console.log(`Upserted ${rows.length} sample broadsheet score records.`);
    }
  }

  console.log("\nDummy test data successfully created!");
}

seed().catch(console.error);
