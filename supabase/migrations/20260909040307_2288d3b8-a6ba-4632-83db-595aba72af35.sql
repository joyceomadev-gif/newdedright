-- 1. exam_sections soft-delete policy: make it RESTRICTIVE and authenticated-only
DROP POLICY IF EXISTS "hide_soft_deleted" ON public.exam_sections;
CREATE POLICY "hide_soft_deleted" ON public.exam_sections
AS RESTRICTIVE FOR SELECT TO authenticated
USING (deleted_at IS NULL OR public.is_super_admin(auth.uid()));

-- 2. Revoke anon execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_exam(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_user_function_permission(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_effective_permissions(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_exam_back(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, uuid, timestamptz, timestamptz, integer, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_exam_for_review(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.approve_and_publish_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_function_permission(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_effective_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_exam_back(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, uuid, timestamptz, timestamptz, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_for_review(uuid) TO authenticated;

-- 3. Fixed search_path on functions missing it
ALTER FUNCTION public.get_current_session_id() SET search_path = public;
ALTER FUNCTION public.stamp_current_session_parents() SET search_path = public;
ALTER FUNCTION public.stamp_current_session_staff() SET search_path = public;
ALTER FUNCTION public.stamp_current_session_students() SET search_path = public;
ALTER FUNCTION public.stamp_session_assignment_submissions() SET search_path = public;
ALTER FUNCTION public.stamp_session_assignments() SET search_path = public;
ALTER FUNCTION public.stamp_session_attendance() SET search_path = public;
ALTER FUNCTION public.stamp_session_continuous_assessments() SET search_path = public;
ALTER FUNCTION public.stamp_session_exams() SET search_path = public;
ALTER FUNCTION public.stamp_session_fees() SET search_path = public;
ALTER FUNCTION public.stamp_session_payment_transactions() SET search_path = public;
ALTER FUNCTION public.stamp_session_report_cards() SET search_path = public;
ALTER FUNCTION public.stamp_session_results() SET search_path = public;
ALTER FUNCTION public.sync_student_name_fields() SET search_path = public;

-- Trigger-only functions should not be callable via the API
REVOKE EXECUTE ON FUNCTION public.stamp_current_session_parents() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_current_session_staff() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_current_session_students() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_assignment_submissions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_assignments() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_attendance() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_continuous_assessments() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_exams() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_fees() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_payment_transactions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_report_cards() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.stamp_session_results() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_student_name_fields() FROM anon, authenticated, public;

-- 4. Security definer view -> invoker
ALTER VIEW public.student_academic_history SET (security_invoker = true);