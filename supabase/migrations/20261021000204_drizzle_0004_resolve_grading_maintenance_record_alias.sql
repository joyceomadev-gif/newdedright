DO $repair$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.exam_grading_maintenance(boolean)'::regprocedure) INTO definition;
 definition:=replace(definition,'SELECT 1 FROM public.questions q JOIN jsonb_array_elements(a.answers) x ON x->>''question_id''=q.id::text WHERE q.exam_id=a.exam_id AND q.content_json IS NULL','SELECT 1 FROM public.questions source_q JOIN jsonb_array_elements(a.answers) x ON x->>''question_id''=source_q.id::text WHERE source_q.exam_id=a.exam_id AND source_q.content_json IS NULL');
 EXECUTE definition;
END $repair$;