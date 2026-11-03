import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const supabase = createClient(supabaseUrl, serviceKey);

async function publishExams() {
  const { data: klass } = await supabase.from("classes").select("id").eq("name", "LAVENDER").single();
  if (!klass) return;

  const { data: exams } = await supabase.from("exams").select("id,title,status,published").eq("class_id", klass.id);
  console.log("Exams found in LAVENDER:", exams);

  for (const ex of exams || []) {
    const { error } = await supabase
      .from("exams")
      .update({ status: "published", published: true, published_at: new Date().toISOString() })
      .eq("id", ex.id);
    if (error) {
      console.log(`Failed to update ${ex.title}:`, error.message);
    } else {
      console.log(`Successfully published ${ex.title}`);
    }
  }
}

publishExams().catch(console.error);
