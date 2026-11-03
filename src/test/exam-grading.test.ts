// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const student = "00000000-0000-4000-8000-000000000002";
const exam = "00000000-0000-4000-8000-000000000003";
const question = "00000000-0000-4000-8000-000000000004";
const manual = "00000000-0000-4000-8000-000000000005";
const attempt = "00000000-0000-4000-8000-000000000006";

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce($1='${admin}'::uuid,false) $$;
    CREATE FUNCTION public.student_can_view_exam(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.students(id uuid primary key,user_id uuid,full_name text,class_id uuid default '00000000-0000-4000-8000-000000000099',deleted_at timestamptz);
    CREATE TABLE public.exams(id uuid primary key,title text,purpose text,max_score numeric,pass_mark numeric,randomize_options boolean,published boolean default true,status text default 'published',deleted_at timestamptz,subject_id uuid,class_id uuid,term_id uuid);
    CREATE TABLE public.questions(id uuid primary key,exam_id uuid,options jsonb,correct_answer text,content_json jsonb,marks numeric,question_type text,question_text text,position int,deleted_at timestamptz);
    CREATE TABLE public.question_bank(id uuid primary key,options jsonb,correct_answer text,question_type text);
    CREATE TABLE public.exam_attempts(id uuid primary key default gen_random_uuid(),exam_id uuid,student_id uuid,started_at timestamptz,submitted_at timestamptz,duration_seconds int,raw_score numeric,total_marks numeric,percentage numeric,answers jsonb,status text,deleted_at timestamptz);
    CREATE FUNCTION public.exam_has_attempts(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT exists(select 1 from public.exam_attempts where exam_id=$1) $$;
    CREATE TABLE public.results(id uuid default gen_random_uuid(),student_id uuid,exam_id uuid,score numeric,grade text,remark text,unique(student_id,exam_id));
    CREATE TABLE public.continuous_assessments(student_id uuid,subject_id uuid,class_id uuid,term_id uuid,ca_type text,title text,recorded_by uuid,score numeric,max_score numeric,deleted_at timestamptz);
    CREATE TABLE public.exam_audit_log(actor_user_id uuid,action text,entity_type text,entity_id uuid,meta jsonb);`);
  await db.exec(readFileSync("drizzle/migrations/0003_repair_exam_answer_identity_and_safe_regrading.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0004_resolve_grading_maintenance_record_alias.sql", "utf8"));
  await db.exec(readFileSync("drizzle/migrations/0005_preserve_offline_submission_eligibility.sql", "utf8"));
  await db.query("SELECT set_config('test.uid',$1,false)", [admin]);
  await db.query("INSERT INTO students(id,user_id,full_name) VALUES($1,$1,'Sample student')", [student]);
  await db.query("INSERT INTO exams(id,title,purpose,max_score,pass_mark,randomize_options) VALUES($1,'Science','exam',100,50,true)", [exam]);
  await db.query("INSERT INTO questions(id,exam_id,options,correct_answer,marks,question_type,question_text) VALUES($1,$2,$3,'C. 8',2,'mcq','Planets')", [question,exam,JSON.stringify(["5","9","8","11"])]);
  await db.query("INSERT INTO questions(id,exam_id,marks,question_type,question_text) VALUES($1,$2,3,'theory','Explain')", [manual,exam]);
});
afterAll(async () => { await db.close(); });

async function score(answers: unknown[], preserve = false) {
  const result = await db.query<{ score: { raw_score: number; total_marks: number; percentage: number; answers: Record<string,unknown>[] } }>("SELECT exam_score_answers($1,$2,$3) score", [exam,JSON.stringify(answers),preserve]);
  return result.rows[0].score;
}

describe("Authoritative exam scoring and safe historical repair", () => {
  it.each(["C"," c ","8","8.0","C. 8","c) 8"])("awards two marks for %s", async answer => {
    expect((await score([{question_id:question,student_answer:answer}])).raw_score).toBe(2);
  });
  it("awards zero for wrong or unanswered questions", async () => {
    expect((await score([{question_id:question,student_answer:"B"}])).raw_score).toBe(0);
    expect((await score([])).raw_score).toBe(0);
  });
  it("normalizes the saved key while keeping its options unchanged", async () => {
    const result = await db.query<{correct_answer:string;options:string[]}>("SELECT correct_answer,options FROM questions WHERE id=$1", [question]);
    expect(result.rows[0]).toEqual({correct_answer:"C",options:["5","9","8","11"]});
  });
  it("ignores client marks and correctness, preserves teacher scores, counts manual marks once", async () => {
    const result = await score([{question_id:question,student_answer:"8",marks:999,is_correct:false},{question_id:manual,student_answer:"Essay",teacher_score:2,needs_grading:true}],true);
    expect(result.raw_score).toBe(4);
    expect(result.total_marks).toBe(5);
    expect(result.percentage).toBe(80);
    expect(result.answers.find(a=>a.question_id===manual)?.teacher_score).toBe(2);
  });
  it("scores builder group and subquestion identifiers independently", async () => {
    const groupExam="00000000-0000-4000-8000-000000000007";
    const groupQuestion="00000000-0000-4000-8000-000000000008";
    await db.query("INSERT INTO questions(id,exam_id,question_type,content_json) VALUES($1,$2,'theory',$3)",[groupQuestion,groupExam,JSON.stringify({kind:"group",group:{questions:[{id:"a",qType:"mcq",options:["5","8"],correctAnswer:"B",marks:2,subQuestions:[]},{id:"b",qType:"theory",subQuestions:[{id:"s",marks:3,html:"Explain"}]}]}})]);
    const result=await db.query<{s:{raw_score:number;total_marks:number}}>("SELECT exam_score_answers($1,$2,true) s",[groupExam,JSON.stringify([{question_id:groupQuestion,sub_key:`${groupQuestion}::q:a`,student_answer:"8"},{question_id:groupQuestion,sub_key:`${groupQuestion}::q:b::s:s`,teacher_score:2}])]);
    expect(result.rows[0].s.raw_score).toBe(4); expect(result.rows[0].s.total_marks).toBe(5);
  });
  it("keeps short answers, true/false, and manual visual tasks distinct", async () => {
    const other="00000000-0000-4000-8000-000000000009";
    const ids=[10,11,12,13].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`);
    for (const [i,type] of ["short_answer","fill_gap","true_false","drawing"].entries()) await db.query("INSERT INTO questions(id,exam_id,question_type,correct_answer,marks) VALUES($1,$2,$3,$4,1)",[ids[i],other,type,i===2?"true":"8"]);
    const result=await db.query<{s:{raw_score:number;total_marks:number;answers:{needs_grading:boolean}[]}}>("SELECT exam_score_answers($1,$2,false) s",[other,JSON.stringify(ids.map((id,i)=>({question_id:id,student_answer:i===2?" TRUE ":"8.0"})))]);
    expect(result.rows[0].s.raw_score).toBe(3); expect(result.rows[0].s.total_marks).toBe(4);
    expect(result.rows[0].s.answers.filter(a=>a.needs_grading)).toHaveLength(1);
  });
  it("accepts selected option text after offline recovery without trusting client awards", async () => {
    const offlineExam="00000000-0000-4000-8000-000000000020";
    const offlineQ="00000000-0000-4000-8000-000000000021";
    await db.query("INSERT INTO exams(id,title,purpose,max_score,class_id,status,published) VALUES($1,'Offline','exam',20,'00000000-0000-4000-8000-000000000099','closed',false)",[offlineExam]);
    await db.query("INSERT INTO questions(id,exam_id,options,correct_answer,marks,question_type) VALUES($1,$2,$3,'C',2,'mcq')",[offlineQ,offlineExam,JSON.stringify(["5","9","8","11"])]);
    await db.query("SELECT set_config('test.uid',$1,false)",[student]);
    const result=await db.query<{s:{raw_score:number;percentage:number}}>("SELECT submit_exam_attempt($1,$2,now()-interval '1 day',now()-interval '1 day',60,$3) s",[offlineExam,student,JSON.stringify([{question_id:offlineQ,student_answer:"8",is_correct:false,marks:999}])]);
    expect(result.rows[0].s.raw_score).toBe(2); expect(result.rows[0].s.percentage).toBe(100);
    await db.query("SELECT set_config('test.uid',$1,false)",[admin]);
    await db.query("DELETE FROM exam_attempts WHERE exam_id=$1",[offlineExam]);
  });
  it("rejects a submission for someone else's student record", async () => {
    await expect(db.query("SELECT submit_exam_attempt($1,$2,now(),now(),60,'[]')", [exam,student])).rejects.toThrow("Student ownership required");
  });
  it("previews without writes, applies atomically with audit and is safe to rerun", async () => {
    await db.query("UPDATE exams SET randomize_options=false WHERE id=$1",[exam]);
    const answers=[{question_id:question,student_answer:"C",is_correct:false,marks:2},{question_id:manual,teacher_score:2,needs_grading:true}];
    await db.query("INSERT INTO exam_attempts(id,exam_id,student_id,submitted_at,raw_score,total_marks,percentage,answers,status) VALUES($1,$2,$3,now(),0,5,0,$4,'submitted')", [attempt,exam,student,JSON.stringify(answers)]);
    const dry=await db.query<{s:{attempts_changed:number}}>("SELECT exam_grading_maintenance(true) s");
    expect(dry.rows[0].s.attempts_changed).toBe(1);
    expect((await db.query<{raw_score:number}>("SELECT raw_score FROM exam_attempts WHERE id=$1",[attempt])).rows[0].raw_score).toBe("0");
    await db.query("SELECT exam_grading_maintenance(false)");
    expect((await db.query<{raw_score:string}>("SELECT raw_score FROM exam_attempts WHERE id=$1",[attempt])).rows[0].raw_score).toBe("4");
    expect((await db.query<{grade:string;score:string}>("SELECT grade,score FROM results WHERE exam_id=$1",[exam])).rows[0]).toEqual({grade:"A",score:"80.00"});
    expect((await db.query("SELECT * FROM exam_audit_log")).rows).toHaveLength(1);
    expect((await db.query<{s:{attempts_changed:number}}>("SELECT exam_grading_maintenance(true) s")).rows[0].s.attempts_changed).toBe(0);
  });
  it("blocks uncertain historic shuffled letters and rejects nonadmin maintenance", async () => {
    await db.query("UPDATE exams SET randomize_options=true WHERE id=$1",[exam]);
    const preview=await db.query<{s:{blocked_attempts:number}}>("SELECT exam_grading_maintenance(true) s");
    expect(preview.rows[0].s.blocked_attempts).toBe(1);
    await db.query("SELECT set_config('test.uid',$1,false)",[student]);
    await expect(db.query("SELECT exam_grading_maintenance(false)")).rejects.toThrow("Administrator required");
  });
});