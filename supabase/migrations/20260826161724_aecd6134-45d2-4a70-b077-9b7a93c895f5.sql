REVOKE ALL ON FUNCTION public.notify_students_on_publish() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_students_on_publish() FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_students_on_publish() TO service_role;