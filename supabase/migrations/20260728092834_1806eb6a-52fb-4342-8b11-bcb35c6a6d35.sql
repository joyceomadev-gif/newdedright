DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions" ON public.questions
FOR SELECT
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND class_matches_user_scope(e.class_id, auth.uid())
      AND (
        teaches_class(auth.uid(), e.class_id)
        OR (e.subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), e.class_id, e.subject_id))
      )
  )
);

DROP POLICY IF EXISTS "Teachers full access to students" ON public.students;

REVOKE EXECUTE ON FUNCTION public.approve_results(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_can_view_exam(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_visible_exams() FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_release_at(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_end_at(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_live_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.copy_exam_questions(uuid, uuid[], text, jsonb, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_exam_to_bank(uuid, uuid[], jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_approve_results(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_result_published(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_results(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unpublish_results(uuid, uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.student_can_start_exam(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_report_template(uuid, uuid) FROM anon;