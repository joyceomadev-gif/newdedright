DO $repair$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.submit_exam_attempt(uuid,uuid,timestamptz,timestamptz,integer,jsonb)'::regprocedure) INTO definition;
 definition:=replace(definition,'IF NOT public.student_can_view_exam(_exam_id,auth.uid()) THEN RAISE EXCEPTION ''Exam not available''; END IF;','IF NOT EXISTS (SELECT 1 FROM public.exams e JOIN public.students s ON s.class_id=e.class_id WHERE e.id=_exam_id AND s.id=_student_id AND s.user_id=auth.uid() AND e.deleted_at IS NULL AND (e.published OR e.status::text=''closed'')) THEN RAISE EXCEPTION ''Exam not available''; END IF;');
 EXECUTE definition;
END $repair$;