CREATE OR REPLACE FUNCTION public.scrub_answer_keys(_j jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _out jsonb;
  _k text;
  _v jsonb;
  _elem jsonb;
BEGIN
  IF _j IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(_j) = 'object' THEN
    _out := '{}'::jsonb;
    FOR _k, _v IN SELECT key, value FROM jsonb_each(_j) LOOP
      IF lower(_k) IN ('correctanswer','correct_answer','correctanswers','correct_answers','answer','answerkey','answer_key','markscheme','mark_scheme','markingguide','marking_guide','solution','iscorrect','is_correct','explanation','rationale') THEN
        CONTINUE;
      END IF;
      _out := _out || jsonb_build_object(_k, public.scrub_answer_keys(_v));
    END LOOP;
    RETURN _out;
  ELSIF jsonb_typeof(_j) = 'array' THEN
    _out := '[]'::jsonb;
    FOR _elem IN SELECT value FROM jsonb_array_elements(_j) LOOP
      _out := _out || jsonb_build_array(public.scrub_answer_keys(_elem));
    END LOOP;
    RETURN _out;
  END IF;
  RETURN _j;
END $function$;

REVOKE EXECUTE ON FUNCTION public.scrub_answer_keys(jsonb) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.student_get_exam_questions(_exam_id uuid)
 RETURNS TABLE(id uuid, question_text text, options jsonb, correct_answer text, marks numeric, "position" integer, media jsonb, question_type text, content_json jsonb, section_id uuid, section_title text, section_instruction text, section_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.exams%ROWTYPE;
  entitled boolean;
  src text;
  is_student boolean;
  release_ts timestamptz;
  end_ts timestamptz;
BEGIN
  SELECT * INTO e FROM public.exams WHERE public.exams.id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  IF e.published IS NOT TRUE THEN RAISE EXCEPTION 'Exam is not published'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.class_id = e.class_id
  ) INTO entitled;
  IF NOT entitled THEN RAISE EXCEPTION 'Not entitled to this exam'; END IF;
  is_student := true;

  -- Release-time enforcement: questions are only served inside the access window
  IF e.opens_at IS NULL THEN RAISE EXCEPTION 'Exam has no scheduled start time'; END IF;
  release_ts := e.opens_at - make_interval(mins => COALESCE(e.release_offset_minutes, 0));
  end_ts := COALESCE(e.closes_at, e.opens_at + make_interval(mins => COALESCE(e.duration_minutes, 60)));
  IF now() < release_ts THEN RAISE EXCEPTION 'Exam has not been released yet'; END IF;
  IF now() > end_ts THEN RAISE EXCEPTION 'Exam access window has closed'; END IF;

  src := COALESCE(e.question_source, 'manual');

  IF src = 'random' THEN
    RETURN QUERY
    WITH pool AS (
      SELECT qb.id, qb.question_text, qb.options, qb.correct_answer,
             qb.marks, NULL::integer AS "position", qb.media, qb.question_type,
             NULL::jsonb AS content_json,
             NULL::uuid AS section_id,
             qb.section_label AS section_title,
             qb.section_instruction,
             COALESCE(qb.section_order, 1) AS section_order
      FROM public.question_bank qb
      WHERE qb.class_id = e.class_id
        AND qb.subject_id = e.subject_id
        AND qb.purpose = COALESCE(e.purpose, 'exam')
      UNION ALL
      SELECT q.id, q.question_text, q.options, q.correct_answer,
             q.marks, q."position", q.media, q.question_type,
             q.content_json,
             q.section_id,
             COALESCE(es.title, q.section_label) AS section_title,
             COALESCE(es.instruction, q.section_instruction) AS section_instruction,
             COALESCE(es.section_order, q.section_order, 1) AS section_order
      FROM public.questions q
      JOIN public.exams e2 ON e2.id = q.exam_id
      LEFT JOIN public.exam_sections es ON es.id = q.section_id
      WHERE e2.class_id = e.class_id
        AND e2.subject_id = e.subject_id
        AND COALESCE(e2.purpose, 'exam') = COALESCE(e.purpose, 'exam')
        AND e2.id <> e.id
    ),
    dedup AS (
      SELECT DISTINCT ON (lower(regexp_replace(pool.question_text, '\s+', ' ', 'g'))) pool.*
      FROM pool
      WHERE pool.question_text IS NOT NULL AND length(trim(pool.question_text)) > 0
    )
    SELECT d.id, d.question_text, d.options,
           CASE WHEN is_student THEN NULL::text ELSE d.correct_answer END,
           d.marks, d."position", d.media, d.question_type,
           public.scrub_answer_keys(d.content_json),
           d.section_id, d.section_title, d.section_instruction, d.section_order
    FROM dedup d
    ORDER BY random()
    LIMIT COALESCE(NULLIF(e.num_questions, 0), 1000);
  ELSE
    RETURN QUERY
    SELECT q.id, q.question_text, q.options,
           NULL::text AS correct_answer,
           q.marks, q."position", q.media, q.question_type,
           public.scrub_answer_keys(q.content_json),
           q.section_id,
           COALESCE(es.title, q.section_label) AS section_title,
           COALESCE(es.instruction, q.section_instruction) AS section_instruction,
           COALESCE(es.section_order, q.section_order, 1) AS section_order
    FROM public.questions q
    LEFT JOIN public.exam_sections es ON es.id = q.section_id
    WHERE q.exam_id = e.id
    ORDER BY COALESCE(es.section_order, q.section_order, 1) ASC, q."position" NULLS LAST, q.question_number NULLS LAST;
  END IF;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) TO authenticated;