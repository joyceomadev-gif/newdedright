import * as XLSX from "xlsx";

export const EXPORT_SHEETS = [
  { name: "Students", table: "students", fields: "id,admission_no,first_name,middle_name,last_name,full_name,email,contact_email_1,contact_email_2,contact_phone_1,contact_phone_2,home_phone,gender,date_of_birth,enrollment_date,admission_session_id,class_id,parent_id,branch_id,status,is_active,address,nationality,state_of_origin,lga,place_of_birth,religion,previous_school,photo_url,blood_group,genotype,allergies,disabilities,medical_info,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,graduated_at,created_at" },
  { name: "Teachers", table: "staff", fields: "id,staff_no,full_name,position,department,email,phone,gender,date_of_birth,date_employed,date_terminated,employment_type,employment_session_id,academic_session_id,qualification,status,is_active,branch_id,level_scope,address,state_of_origin,lga,nin,salary,bank_name,bank_code,bank_account,bank_account_name,bank_account_number,photo_url,notes,created_at" },
  { name: "Parents", table: "parents", fields: "id,full_name,email,phone,address,occupation,state_of_origin,lga,enrolled_session_id,academic_session_id,created_at" },
  { name: "Exams", table: "exams", fields: "id,title,type,purpose,class_id,subject_id,session_id,academic_session_id,term_id,arm,exam_date,opens_at,closes_at,time_zone,duration_minutes,max_score,pass_mark,num_questions,instructions,question_source,status,published,published_at,submitted_for_review_at,is_mandatory,allow_late_entry,allow_resume,randomize_options,randomize_questions,release_offset_minutes,created_at" },
  { name: "Question Bank", table: "question_bank", fields: "id,question_text,question_type,question_number,subject_id,class_id,session_id,term_id,topic,sub_topic,purpose,difficulty,marks,options,correct_answer,correct_answers,explanation,media,tags,section_label,section_instruction,section_order,time_suggestion_seconds,status,approved_at,created_at,updated_at" },
] as const;

type ExportRow = Record<string, unknown>;
type PageResult = { data: ExportRow[] | null; error: { message: string } | null };
export type ExportPageFetcher = (table: typeof EXPORT_SHEETS[number]["table"], fields: string, from: number, to: number) => PromiseLike<PageResult>;

const labels: Record<string, string> = {
  id: "Record ID", full_name: "Full Name", admission_no: "Admission Number", staff_no: "Staff Number",
  email: "Login Email", contact_email_1: "Contact Email 1", contact_email_2: "Contact Email 2",
  contact_phone_1: "Contact Phone Number 1", contact_phone_2: "Contact Phone Number 2",
  nin: "National Identification Number", lga: "Local Government Area", num_questions: "Number of Questions",
  session_id: "Session ID", academic_session_id: "Academic Session ID", class_id: "Class ID",
  subject_id: "Subject ID", parent_id: "Parent ID", branch_id: "Branch ID", term_id: "Term ID",
};

function friendlyHeader(field: string) {
  return labels[field] ?? field.split("_").map((word) => word === "id" ? "ID" : word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function cellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  return JSON.stringify(value);
}

// Fresh, stable-order pages with no row cap; errors abort the whole export.
export async function buildSchoolWorkbook(fetchPage: ExportPageFetcher) {
  const sheets = await Promise.all(EXPORT_SHEETS.map(async (sheet) => {
    const fields = sheet.fields.split(",");
    const rows: ExportRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const result = await fetchPage(sheet.table, sheet.fields, from, from + pageSize - 1);
      if (result.error) throw new Error(`${sheet.name}: ${result.error.message}`);
      const page = result.data ?? [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    const worksheet = XLSX.utils.aoa_to_sheet([
      fields.map(friendlyHeader),
      ...rows.map((row) => fields.map((field) => cellValue(row[field]))),
    ]);
    worksheet["!cols"] = fields.map((field) => ({ wch: Math.min(40, Math.max(18, friendlyHeader(field).length + 2)) }));
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: fields.length - 1 } }) };
    return { name: sheet.name, worksheet };
  }));
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(workbook, sheet.worksheet, sheet.name);
  return workbook;
}