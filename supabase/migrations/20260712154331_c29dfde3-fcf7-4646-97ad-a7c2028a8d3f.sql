
-- 1. Fix mutable search_path on class_level_bucket
CREATE OR REPLACE FUNCTION public.class_level_bucket(_level text)
 RETURNS level_scope
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
  SELECT CASE
    WHEN _level = 'nursery' THEN 'creche_nursery'::public.level_scope
    WHEN _level = 'primary' THEN 'primary'::public.level_scope
    WHEN _level IN ('jss','sss') THEN 'secondary'::public.level_scope
    ELSE NULL
  END
$function$;

-- 2. Tighten SELECT policies to add scope checks
DROP POLICY IF EXISTS "Staff view class_teachers" ON public.class_teachers;
CREATE POLICY "Staff view class_teachers" ON public.class_teachers
  FOR SELECT
  USING (public.is_staff(auth.uid()) AND public.class_matches_user_scope(class_id, auth.uid()));

DROP POLICY IF EXISTS "Staff view subject_teachers" ON public.subject_teachers;
CREATE POLICY "Staff view subject_teachers" ON public.subject_teachers
  FOR SELECT
  USING (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = subject_teachers.subject_id
        AND (s.class_id IS NULL OR public.class_matches_user_scope(s.class_id, auth.uid()))
    )
  );

-- 3. Restrict equipment viewing to staff (was any authenticated)
DROP POLICY IF EXISTS "All view equipment" ON public.equipment;
CREATE POLICY "Staff view equipment" ON public.equipment
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 4. Restrict lab_incidents viewing to staff within scope
DROP POLICY IF EXISTS "Staff view lab_incidents" ON public.lab_incidents;
CREATE POLICY "Staff view lab_incidents" ON public.lab_incidents
  FOR SELECT
  TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.lab_sessions ls
        WHERE ls.id = lab_incidents.session_id
          AND (ls.class_id IS NULL OR public.class_matches_user_scope(ls.class_id, auth.uid()))
      )
    )
  );

-- 5. Lock down SECURITY DEFINER function EXECUTE grants.
-- Trigger-only functions: no client role needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.auto_grade_exam_attempt() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_exam_publish_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_exam_publish_rules() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_questions_locked() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_recommendation_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_parents_on_promotion() FROM PUBLIC;

-- Admin/user-invoked RPCs: revoke PUBLIC, grant only to authenticated.
REVOKE EXECUTE ON FUNCTION public.advance_current_term() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_current_term() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.claim_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_session_with_terms(text, date, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_session_with_terms(text, date, date, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rollover_session(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollover_session(uuid, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rollover_session_dry_run(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollover_session_dry_run(uuid, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) TO authenticated;

-- Server-only (webhook via service_role): no client roles.
REVOKE EXECUTE ON FUNCTION public.record_payment_transaction(uuid, text, numeric, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction(uuid, text, numeric, text, timestamptz, jsonb) TO service_role;

-- RLS helper functions: revoke PUBLIC, grant to authenticated (RLS evaluates as caller).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_class_teacher_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_class_teacher_of(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_class_teacher_of_student(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_class_teacher_of_student(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.class_matches_user_scope(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.class_matches_user_scope(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_plan_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_plan_code() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.exam_has_attempts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_has_attempts(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_level_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_level_scope(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.teaches_class(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teaches_class(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.teaches_class_subject(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teaches_class_subject(uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.teaches_exam_subject(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teaches_exam_subject(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_teaching_assignments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_teaching_assignments() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_teaching_class_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_teaching_class_ids() TO authenticated;
