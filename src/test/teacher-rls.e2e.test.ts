// @vitest-environment node
/**
 * End-to-end RLS test: a class teacher must only be able to manage exam
 * questions for their own class and update only their own roster.
 *
 * Run with:
 *   SUPABASE_SERVICE_ROLE_KEY=... bunx vitest run src/test/teacher-rls.e2e.test.ts
 *
 * Skips automatically if the service role key is not provided.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RUN = !!(URL && ANON && SERVICE);
const d = RUN ? describe : describe.skip;

const tag = `rls-${Date.now().toString(36)}`;
const teacherAEmail = `teacher-a-${tag}@test.local`;
const teacherBEmail = `teacher-b-${tag}@test.local`;
const password = "Test-Password-123!";

interface Ctx {
  admin: SupabaseClient;
  teacherA: SupabaseClient;
  teacherB: SupabaseClient;
  teacherAUserId: string;
  teacherBUserId: string;
  staffAId: string;
  staffBId: string;
  classAId: string;
  classBId: string;
  examAId: string;
  examBId: string;
  termId: string;
  subjectId: string;
  studentUnassignedId: string;
  studentInAId: string;
  studentInBId: string;
}

const ctx = {} as Ctx;

d("class-teacher RLS", () => {
  beforeAll(async () => {
    ctx.admin = createClient(URL!, SERVICE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create two teacher users (auto-confirmed)
    const a = await ctx.admin.auth.admin.createUser({
      email: teacherAEmail, password, email_confirm: true,
    });
    if (a.error) throw a.error;
    ctx.teacherAUserId = a.data.user!.id;

    const b = await ctx.admin.auth.admin.createUser({
      email: teacherBEmail, password, email_confirm: true,
    });
    if (b.error) throw b.error;
    ctx.teacherBUserId = b.data.user!.id;

    // Roles
    await ctx.admin.from("user_roles").insert([
      { user_id: ctx.teacherAUserId, role: "teacher" },
      { user_id: ctx.teacherBUserId, role: "teacher" },
    ]).throwOnError();

    // Staff
    const staffIns = await ctx.admin.from("staff").insert([
      { full_name: `Teacher A ${tag}`, staff_no: `T-A-${tag}`, position: "Teacher", user_id: ctx.teacherAUserId },
      { full_name: `Teacher B ${tag}`, staff_no: `T-B-${tag}`, position: "Teacher", user_id: ctx.teacherBUserId },
    ]).select("id, user_id").throwOnError();
    ctx.staffAId = staffIns.data!.find((s) => s.user_id === ctx.teacherAUserId)!.id;
    ctx.staffBId = staffIns.data!.find((s) => s.user_id === ctx.teacherBUserId)!.id;

    // Classes
    const classIns = await ctx.admin.from("classes").insert([
      { name: `RLS Class A ${tag}`, level: "jss", class_teacher_id: ctx.staffAId },
      { name: `RLS Class B ${tag}`, level: "jss", class_teacher_id: ctx.staffBId },
    ]).select("id, class_teacher_id").throwOnError();
    ctx.classAId = classIns.data!.find((c) => c.class_teacher_id === ctx.staffAId)!.id;
    ctx.classBId = classIns.data!.find((c) => c.class_teacher_id === ctx.staffBId)!.id;

    // Pick any term
    const term = await ctx.admin.from("terms").select("id").limit(1).single().throwOnError();
    ctx.termId = term.data!.id;

    // Subject
    const subj = await ctx.admin.from("subjects")
      .insert({ name: `RLS Subject ${tag}`, code: `RLS-${tag}` })
      .select("id").single().throwOnError();
    ctx.subjectId = subj.data!.id;

    // Exams
    const examIns = await ctx.admin.from("exams").insert([
      { title: `Exam A ${tag}`, type: "cbt", class_id: ctx.classAId, subject_id: ctx.subjectId, term_id: ctx.termId, max_score: 100 },
      { title: `Exam B ${tag}`, type: "cbt", class_id: ctx.classBId, subject_id: ctx.subjectId, term_id: ctx.termId, max_score: 100 },
    ]).select("id, class_id").throwOnError();
    ctx.examAId = examIns.data!.find((e) => e.class_id === ctx.classAId)!.id;
    ctx.examBId = examIns.data!.find((e) => e.class_id === ctx.classBId)!.id;

    // Students
    const studIns = await ctx.admin.from("students").insert([
      { full_name: `RLS Unassigned ${tag}`, admission_no: `RLS-U-${tag}`, class_id: null },
      { full_name: `RLS In A ${tag}`, admission_no: `RLS-A-${tag}`, class_id: ctx.classAId },
      { full_name: `RLS In B ${tag}`, admission_no: `RLS-B-${tag}`, class_id: ctx.classBId },
    ]).select("id, admission_no").throwOnError();
    ctx.studentUnassignedId = studIns.data!.find((s) => s.admission_no === `RLS-U-${tag}`)!.id;
    ctx.studentInAId = studIns.data!.find((s) => s.admission_no === `RLS-A-${tag}`)!.id;
    ctx.studentInBId = studIns.data!.find((s) => s.admission_no === `RLS-B-${tag}`)!.id;

    // Sign-in clients
    ctx.teacherA = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
    ctx.teacherB = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
    const sa = await ctx.teacherA.auth.signInWithPassword({ email: teacherAEmail, password });
    if (sa.error) throw sa.error;
    const sb = await ctx.teacherB.auth.signInWithPassword({ email: teacherBEmail, password });
    if (sb.error) throw sb.error;
  }, 60_000);

  afterAll(async () => {
    if (!ctx.admin) return;
    // Cascade-delete: questions/results/exams via class -> exam fk; students individually.
    await ctx.admin.from("students").delete().in("id", [ctx.studentUnassignedId, ctx.studentInAId, ctx.studentInBId].filter(Boolean));
    await ctx.admin.from("exams").delete().in("id", [ctx.examAId, ctx.examBId].filter(Boolean));
    await ctx.admin.from("classes").delete().in("id", [ctx.classAId, ctx.classBId].filter(Boolean));
    await ctx.admin.from("subjects").delete().eq("id", ctx.subjectId);
    await ctx.admin.from("staff").delete().in("id", [ctx.staffAId, ctx.staffBId].filter(Boolean));
    await ctx.admin.from("user_roles").delete().in("user_id", [ctx.teacherAUserId, ctx.teacherBUserId].filter(Boolean));
    if (ctx.teacherAUserId) await ctx.admin.auth.admin.deleteUser(ctx.teacherAUserId);
    if (ctx.teacherBUserId) await ctx.admin.auth.admin.deleteUser(ctx.teacherBUserId);
  }, 60_000);

  it("teacher A can insert a question into their own exam", async () => {
    const { data, error } = await ctx.teacherA.from("questions")
      .insert({ exam_id: ctx.examAId, question_text: "own-q", correct_answer: "A", marks: 1 })
      .select("id").single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("teacher A CANNOT insert a question into teacher B's exam", async () => {
    const { data, error } = await ctx.teacherA.from("questions")
      .insert({ exam_id: ctx.examBId, question_text: "cross-q", correct_answer: "A", marks: 1 })
      .select("id").maybeSingle();
    // RLS rejection: either an error or zero rows returned
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("teacher A CANNOT update a question in teacher B's exam", async () => {
    // Seed via service role so the row exists
    const seed = await ctx.admin.from("questions")
      .insert({ exam_id: ctx.examBId, question_text: "b-q", correct_answer: "A", marks: 1 })
      .select("id").single();
    const qId = seed.data!.id;

    const upd = await ctx.teacherA.from("questions")
      .update({ question_text: "hacked" }).eq("id", qId).select("id");
    // No error but zero rows affected = silently filtered by RLS
    expect((upd.data ?? []).length).toBe(0);

    // Confirm the row was not modified
    const verify = await ctx.admin.from("questions").select("question_text").eq("id", qId).single();
    expect(verify.data?.question_text).toBe("b-q");
  });

  it("teacher A can add an unassigned student to their own class", async () => {
    const { data, error } = await ctx.teacherA.from("students")
      .update({ class_id: ctx.classAId }).eq("id", ctx.studentUnassignedId).select("id, class_id");
    expect(error).toBeNull();
    expect(data?.[0]?.class_id).toBe(ctx.classAId);
  });

  it("teacher A can remove a student from their own class", async () => {
    const { data, error } = await ctx.teacherA.from("students")
      .update({ class_id: null }).eq("id", ctx.studentInAId).select("id, class_id");
    expect(error).toBeNull();
    expect(data?.[0]?.class_id).toBeNull();
  });

  it("teacher A CANNOT move a student INTO teacher B's class", async () => {
    const { data, error } = await ctx.teacherA.from("students")
      .update({ class_id: ctx.classBId }).eq("id", ctx.studentUnassignedId).select("id");
    // WITH CHECK should reject with an RLS error
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    // Confirm the row's class_id was not changed to B
    const v = await ctx.admin.from("students").select("class_id").eq("id", ctx.studentUnassignedId).single();
    expect(v.data?.class_id).not.toBe(ctx.classBId);
  });

  it("teacher A CANNOT update a student already in teacher B's class", async () => {
    const upd = await ctx.teacherA.from("students")
      .update({ full_name: "hacked" }).eq("id", ctx.studentInBId).select("id");
    expect((upd.data ?? []).length).toBe(0);
    const v = await ctx.admin.from("students").select("full_name").eq("id", ctx.studentInBId).single();
    expect(v.data?.full_name).not.toBe("hacked");
  });
});
