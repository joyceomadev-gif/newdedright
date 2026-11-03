
-- 1) Fix policies to target authenticated role instead of public
DROP POLICY IF EXISTS "Parent view own" ON public.parents;
CREATE POLICY "Parent view own" ON public.parents
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage question bank" ON public.question_bank;
CREATE POLICY "Admin manage question bank" ON public.question_bank
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2) Remove email-based fallback from teaches_class and related helpers.
--    Only staff records linked via staff.user_id grant teacher access.
CREATE OR REPLACE FUNCTION public.teaches_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = _user_id
  )
  SELECT
    EXISTS (
      SELECT 1 FROM public.classes c
      JOIN current_staff st ON st.id = c.class_teacher_id
      WHERE c.id = _class_id
    )
    OR EXISTS (
      SELECT 1 FROM public.subjects sub
      JOIN current_staff st ON st.id = sub.teacher_id
      WHERE sub.class_id = _class_id
    )
    OR EXISTS (
      SELECT 1 FROM public.timetable tt
      JOIN current_staff st ON st.id = tt.teacher_id
      WHERE tt.class_id = _class_id
    );
$$;

CREATE OR REPLACE FUNCTION public.teaches_class_subject(_user_id uuid, _class_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = _user_id
  )
  SELECT
    EXISTS (
      SELECT 1 FROM public.subjects sub
      JOIN current_staff st ON st.id = sub.teacher_id
      WHERE sub.class_id = _class_id AND sub.id = _subject_id
    )
    OR EXISTS (
      SELECT 1 FROM public.timetable tt
      JOIN current_staff st ON st.id = tt.teacher_id
      WHERE tt.class_id = _class_id AND tt.subject_id = _subject_id
    );
$$;

CREATE OR REPLACE FUNCTION public.my_teaching_class_ids()
RETURNS TABLE(class_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = auth.uid()
  )
  SELECT DISTINCT c.id
  FROM public.classes c
  JOIN current_staff st ON st.id = c.class_teacher_id
  WHERE c.id IS NOT NULL
  UNION
  SELECT DISTINCT sub.class_id
  FROM public.subjects sub
  JOIN current_staff st ON st.id = sub.teacher_id
  WHERE sub.class_id IS NOT NULL
  UNION
  SELECT DISTINCT tt.class_id
  FROM public.timetable tt
  JOIN current_staff st ON st.id = tt.teacher_id
  WHERE tt.class_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.my_teaching_assignments()
RETURNS TABLE(class_id uuid, subject_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = auth.uid()
  )
  SELECT DISTINCT sub.class_id, sub.id
  FROM public.subjects sub
  JOIN current_staff st ON st.id = sub.teacher_id
  WHERE sub.class_id IS NOT NULL
  UNION
  SELECT DISTINCT tt.class_id, tt.subject_id
  FROM public.timetable tt
  JOIN current_staff st ON st.id = tt.teacher_id
  WHERE tt.class_id IS NOT NULL AND tt.subject_id IS NOT NULL;
$$;

-- 3) Lock down SECURITY DEFINER function execution.
--    Revoke from PUBLIC, then grant EXECUTE only to roles that need it.
REVOKE EXECUTE ON FUNCTION public.auto_grade_exam_attempt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_recommendation_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_parents_on_promotion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher_of(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher_of_student(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.teaches_class(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.teaches_class_subject(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.teaches_exam_subject(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_plan_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_payment_transaction(uuid, text, numeric, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- RPCs the client legitimately calls — grant EXECUTE to authenticated only.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_super_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_super_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_teaching_class_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_teaching_class_ids() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.my_teaching_assignments() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_teaching_assignments() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.advance_current_term() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.advance_current_term() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_session_with_terms(text, date, date, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_session_with_terms(text, date, date, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rollover_session(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rollover_session(uuid, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rollover_session_dry_run(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rollover_session_dry_run(uuid, uuid, jsonb) TO authenticated;
