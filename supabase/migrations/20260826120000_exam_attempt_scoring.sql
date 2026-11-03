-- Server-side scoring for exam attempts.
-- Client submits only student responses; server calculates scores atomically.

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
  q_rec record;
  ans_rec jsonb;
  raw numeric := 0;
  total numeric := 0;
  a_text text;
  c_text text;
  is_theory boolean;
  attempt_id uuid;
  answer_row jsonb := '[]'::jsonb;
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

  -- Grade each answer against authoritative question data
  FOR q_rec IN
    SELECT id, question_text, options, marks, correct_answer, question_type
    FROM public.questions WHERE exam_id = _exam_id
  LOOP
    total := total + COALESCE(q_rec.marks, 1);

    -- Find student's answer for this question
    a_text := NULL;
    FOR ans_rec IN SELECT * FROM jsonb_array_elements(_answers)
    LOOP
      IF ans_rec->>'question_id' = q_rec.id::text THEN
        a_text := ans_rec->>'student_answer';
        EXIT;
      END IF;
    END LOOP;

    is_theory := q_rec.question_type = 'theory';

    IF is_theory THEN
      -- Theory questions need manual grading
      answer_row := answer_row || jsonb_build_object(
        'question_id', q_rec.id,
        'question_text', q_rec.question_text,
        'question_type', q_rec.question_type,
        'options', q_rec.options,
        'student_answer', a_text,
        'correct_answer', NULL,
        'marks', q_rec.marks,
        'is_correct', NULL,
        'needs_grading', true
      );
    ELSE
      -- Auto-grade MCQ/short answer
      c_text := trim(lower(COALESCE(q_rec.correct_answer, '')));
      IF a_text IS NOT NULL AND trim(lower(a_text)) = c_text THEN
        raw := raw + COALESCE(q_rec.marks, 1);
        answer_row := answer_row || jsonb_build_object(
          'question_id', q_rec.id,
          'question_text', q_rec.question_text,
          'question_type', q_rec.question_type,
          'options', q_rec.options,
          'student_answer', a_text,
          'correct_answer', q_rec.correct_answer,
          'marks', q_rec.marks,
          'is_correct', true,
          'needs_grading', false
        );
      ELSE
        answer_row := answer_row || jsonb_build_object(
          'question_id', q_rec.id,
          'question_text', q_rec.question_text,
          'question_type', q_rec.question_type,
          'options', q_rec.options,
          'student_answer', a_text,
          'correct_answer', q_rec.correct_answer,
          'marks', q_rec.marks,
          'is_correct', false,
          'needs_grading', false
        );
      END IF;
    END IF;
  END LOOP;

  -- Insert attempt with server-calculated scores
  INSERT INTO public.exam_attempts (
    exam_id, student_id, started_at, submitted_at,
    duration_seconds, raw_score, total_marks, percentage, answers
  ) VALUES (
    _exam_id, _student_id, _started_at, _submitted_at,
    _duration_seconds, raw, total,
    CASE WHEN total > 0 THEN round((raw / total) * 100, 2) ELSE 0 END,
    answer_row
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
