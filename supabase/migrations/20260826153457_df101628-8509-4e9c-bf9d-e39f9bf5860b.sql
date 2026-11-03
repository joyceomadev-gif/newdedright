-- 1. Restrict write access on assessment/grading tables to staff/admin
DROP POLICY IF EXISTS "Staff manage assessment_components" ON public.assessment_components;
CREATE POLICY "Staff manage assessment_components" ON public.assessment_components
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff manage assessment_structures" ON public.assessment_structures;
CREATE POLICY "Staff manage assessment_structures" ON public.assessment_structures
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff manage grading_scales" ON public.grading_scales;
CREATE POLICY "Staff manage grading_scales" ON public.grading_scales
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff manage result_component_scores" ON public.result_component_scores;
CREATE POLICY "Staff manage result_component_scores" ON public.result_component_scores
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()));

-- 2. Scope class/subject teacher policies to authenticated role only
DROP POLICY IF EXISTS "Admins manage class_teachers" ON public.class_teachers;
CREATE POLICY "Admins manage class_teachers" ON public.class_teachers
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND class_matches_user_scope(class_id, auth.uid()))
  WITH CHECK (is_admin(auth.uid()) AND class_matches_user_scope(class_id, auth.uid()));

DROP POLICY IF EXISTS "Staff view class_teachers" ON public.class_teachers;
CREATE POLICY "Staff view class_teachers" ON public.class_teachers
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND class_matches_user_scope(class_id, auth.uid()));

DROP POLICY IF EXISTS "Admins manage subject_teachers" ON public.subject_teachers;
CREATE POLICY "Admins manage subject_teachers" ON public.subject_teachers
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.id = subject_teachers.subject_id
      AND (s.class_id IS NULL OR class_matches_user_scope(s.class_id, auth.uid()))))
  WITH CHECK (is_admin(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.id = subject_teachers.subject_id
      AND (s.class_id IS NULL OR class_matches_user_scope(s.class_id, auth.uid()))));

DROP POLICY IF EXISTS "Staff view subject_teachers" ON public.subject_teachers;
CREATE POLICY "Staff view subject_teachers" ON public.subject_teachers
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.subjects s
    WHERE s.id = subject_teachers.subject_id
      AND (s.class_id IS NULL OR class_matches_user_scope(s.class_id, auth.uid()))));

-- 3. Scope questions SELECT policy to authenticated role only
DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions" ON public.questions
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND class_matches_user_scope(e.class_id, auth.uid())
      AND (teaches_class(auth.uid(), e.class_id)
        OR (e.subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), e.class_id, e.subject_id)))));

-- 4. Revoke anon EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.approve_results(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_approve_results(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_end_at(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_live_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_release_at(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_result_published(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_results(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_assessment_structure(uuid, uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_grading_scale(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_report_template(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_can_start_exam(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_can_view_exam(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_visible_exams() FROM anon;
REVOKE EXECUTE ON FUNCTION public.unpublish_results(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_students_on_publish() FROM anon;

-- 5. Fix mutable search_path
ALTER FUNCTION public.validate_assessment_component_score() SET search_path = public;
