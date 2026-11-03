-- Revoke direct execution on trigger-only SECURITY DEFINER functions.
-- These are invoked automatically by database triggers; they must not be
-- callable directly by anonymous or authenticated users.

REVOKE ALL ON FUNCTION public.record_student_enrollment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_student_enrollment() FROM anon;
REVOKE ALL ON FUNCTION public.record_student_enrollment() FROM authenticated;

REVOKE ALL ON FUNCTION public.sync_broadsheet_to_continuous_assessments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_broadsheet_to_continuous_assessments() FROM anon;
REVOKE ALL ON FUNCTION public.sync_broadsheet_to_continuous_assessments() FROM authenticated;

-- Also revoke execute on the helper view function if it was accidentally granted
-- (it is SECURITY INVOKER and safe, but keeping it non-executable directly is fine).
REVOKE ALL ON FUNCTION public.get_current_session_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_session_id() FROM anon;
REVOKE ALL ON FUNCTION public.get_current_session_id() FROM authenticated;