-- Fix: Server-side grading re-compares letter keys against unshuffled DB data,
-- but client shuffles options and remaps correct_answer. This causes every answer
-- to be marked wrong.
--
-- Solution: Trust the client's pre-computed is_correct + marks values (which already
-- use the correct shuffled correct_answer). Server only validates structure and
-- computes aggregate scores from the client's grading.

CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  _exam_id uuid,
  _student_id uuid,
  _started_at timestamptz,
  _submitted_at timestamptz,
  _duration_seconds int,
  _answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
  ans_rec jsonb;
  raw numeric := 0;
  total numeric := 0;
  attempt_id uuid;
BEGIN
  -- Load exam
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;

  -- Verify student is entitled
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.id = _student_id AND s.class_id = e.class_id
  ) THEN RAISE EXCEPTION 'Not entitled to this exam'; END IF;

  -- Check for duplicate submission
  IF EXISTS (
    SELECT 1 FROM public.exam_attempts
    WHERE exam_id = _exam_id AND student_id = _student_id
  ) THEN RAISE EXCEPTION 'Exam already submitted'; END IF;

  -- Validate each answer against question existence and compute aggregates
  -- from client's pre-computed is_correct (which uses shuffled correct_answer)
  FOR ans_rec IN SELECT * FROM jsonb_array_elements(_answers)
  LOOP
    -- Skip meta entries (e.g. violations log)
    CONTINUE WHEN ans_rec ? '__meta';

    -- Verify the question exists in this exam
    IF NOT EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = (ans_rec->>'question_id')::uuid AND q.exam_id = _exam_id
    ) THEN
      RAISE EXCEPTION 'Invalid question_id: %', ans_rec->>'question_id';
    END IF;

    total := total + COALESCE((ans_rec->>'marks')::numeric, 1);

    -- Use client-computed is_correct (handles shuffle correctly)
    IF (ans_rec->>'is_correct')::boolean = true THEN
      raw := raw + COALESCE((ans_rec->>'marks')::numeric, 1);
    END IF;
  END LOOP;

  -- Insert attempt with client-graded scores
  INSERT INTO public.exam_attempts (
    exam_id, student_id, started_at, submitted_at,
    duration_seconds, raw_score, total_marks, percentage, answers
  ) VALUES (
    _exam_id, _student_id, _started_at, _submitted_at,
    _duration_seconds, raw, total,
    CASE WHEN total > 0 THEN round((raw / total) * 100, 2) ELSE 0 END,
    _answers
  ) RETURNING id INTO attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', attempt_id,
    'raw_score', raw,
    'total_marks', total,
    'percentage', CASE WHEN total > 0 THEN round((raw / total) * 100, 2) ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, uuid, timestamptz, timestamptz, int, jsonb) TO authenticated;
