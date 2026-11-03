
-- 1. Fix class_matches_user_scope null bypass: fail closed when scope is null (except super admin)
CREATE OR REPLACE FUNCTION public.class_matches_user_scope(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR (
      public.get_user_level_scope(_user_id) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = _class_id
          AND public.class_level_bucket(c.level::text) = public.get_user_level_scope(_user_id)
      )
    )
$$;

-- 2. Explicit DELETE policy on exams (admins only) & split staff manage into insert/update
DROP POLICY IF EXISTS "Staff manage exams" ON public.exams;
CREATE POLICY "Staff insert exams" ON public.exams
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff(auth.uid()) AND class_matches_user_scope(class_id, auth.uid())
    AND (is_admin(auth.uid()) OR teaches_class(auth.uid(), class_id)
         OR (subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), class_id, subject_id)))
  );
CREATE POLICY "Staff update exams" ON public.exams
  FOR UPDATE TO authenticated
  USING (
    is_staff(auth.uid()) AND class_matches_user_scope(class_id, auth.uid())
    AND (is_admin(auth.uid()) OR teaches_class(auth.uid(), class_id)
         OR (subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), class_id, subject_id)))
  )
  WITH CHECK (
    is_staff(auth.uid()) AND class_matches_user_scope(class_id, auth.uid())
    AND (is_admin(auth.uid()) OR teaches_class(auth.uid(), class_id)
         OR (subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), class_id, subject_id)))
  );
CREATE POLICY "Admins delete exams" ON public.exams
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()) AND class_matches_user_scope(class_id, auth.uid()));

-- 3. Tighten health tables: only admins, medical staff, or class teacher of that student
DROP POLICY IF EXISTS "Staff manage health_observations" ON public.health_observations;
DROP POLICY IF EXISTS "View own health_observations" ON public.health_observations;
CREATE POLICY "Health obs manage" ON public.health_observations
  FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
  );
CREATE POLICY "Health obs view own" ON public.health_observations
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
    OR student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    OR student_id IN (SELECT s.id FROM students s JOIN parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage health_medications" ON public.health_medications;
DROP POLICY IF EXISTS "View own health_medications" ON public.health_medications;
CREATE POLICY "Health meds manage" ON public.health_medications
  FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
  );
CREATE POLICY "Health meds view own" ON public.health_medications
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
    OR student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    OR student_id IN (SELECT s.id FROM students s JOIN parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff manage health_referrals" ON public.health_referrals;
DROP POLICY IF EXISTS "View own health_referrals" ON public.health_referrals;
CREATE POLICY "Health refs manage" ON public.health_referrals
  FOR ALL TO authenticated
  USING (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
  )
  WITH CHECK (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
  );
CREATE POLICY "Health refs view own" ON public.health_referrals
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR is_class_teacher_of_student(auth.uid(), student_id)
    OR student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    OR student_id IN (SELECT s.id FROM students s JOIN parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
  );

-- 4. Explicit staff SELECT policy on expenses (admins + heads of section can view)
DROP POLICY IF EXISTS "Heads view expenses" ON public.expenses;
CREATE POLICY "Heads view expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'head_of_section'::app_role));

-- 5. Move pg_trgm out of public schema to satisfy search_path mutable finding
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 6. Revoke EXECUTE from anon on all custom SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher_of(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher_of_student(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teaches_class(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teaches_class_subject(uuid, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teaches_exam_subject(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_teaching_class_ids() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_teaching_assignments() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_level_scope(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.class_matches_user_scope(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_plan_code() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_super_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_current_term() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_session_with_terms(text, date, date, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollover_session(uuid, uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollover_session_dry_run(uuid, uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_payment_transaction(uuid, text, numeric, text, timestamptz, jsonb) FROM anon, PUBLIC;
