CREATE OR REPLACE FUNCTION public.student_get_exam_questions(_exam_id uuid)
RETURNS TABLE (
  id uuid,
  question_text text,
  options jsonb,
  correct_answer text,
  marks numeric,
  "position" integer,
  media jsonb,
  question_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
  entitled boolean;
  src text;
BEGIN
  SELECT * INTO e FROM public.exams WHERE public.exams.id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  IF e.published IS NOT TRUE THEN RAISE EXCEPTION 'Exam is not published'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.class_id = e.class_id
  ) INTO entitled;
  IF NOT entitled THEN RAISE EXCEPTION 'Not entitled to this exam'; END IF;

  src := COALESCE(e.question_source, 'manual');

  IF src = 'random' THEN
    RETURN QUERY
    WITH pool AS (
      SELECT qb.id, qb.question_text, qb.options, qb.correct_answer,
             qb.marks, NULL::integer AS "position", qb.media, qb.question_type
      FROM public.question_bank qb
      WHERE qb.class_id = e.class_id
        AND qb.subject_id = e.subject_id
        AND qb.purpose = COALESCE(e.purpose, 'exam')
      UNION ALL
      SELECT q.id, q.question_text, q.options, q.correct_answer,
             q.marks, q."position", q.media, q.question_type
      FROM public.questions q
      JOIN public.exams e2 ON e2.id = q.exam_id
      WHERE e2.class_id = e.class_id
        AND e2.subject_id = e.subject_id
        AND COALESCE(e2.purpose, 'exam') = COALESCE(e.purpose, 'exam')
        AND e2.id <> e.id
    ),
    dedup AS (
      SELECT DISTINCT ON (lower(regexp_replace(question_text, '\s+', ' ', 'g'))) *
      FROM pool
      WHERE question_text IS NOT NULL AND length(trim(question_text)) > 0
    )
    SELECT d.id, d.question_text, d.options, d.correct_answer,
           d.marks, d."position", d.media, d.question_type
    FROM dedup d
    ORDER BY random()
    LIMIT COALESCE(NULLIF(e.num_questions, 0), 1000);
  ELSE
    RETURN QUERY
    SELECT q.id, q.question_text, q.options, q.correct_answer,
           q.marks, q."position", q.media, q.question_type
    FROM public.questions q
    WHERE q.exam_id = e.id
    ORDER BY q."position" NULLS LAST, q.question_number NULLS LAST;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.student_get_exam_questions(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) TO authenticated;