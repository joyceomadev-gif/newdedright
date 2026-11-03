
CREATE OR REPLACE FUNCTION public.auto_grade_exam_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
  pct numeric;
  final_score numeric;
  letter text;
  ca_max numeric := 10;
  ca_score numeric;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = NEW.exam_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  pct := COALESCE(NEW.percentage, CASE WHEN NEW.total_marks > 0 THEN (NEW.raw_score::numeric / NEW.total_marks) * 100 ELSE 0 END);
  letter := CASE
    WHEN pct >= 70 THEN 'A'
    WHEN pct >= 60 THEN 'B'
    WHEN pct >= 50 THEN 'C'
    WHEN pct >= 45 THEN 'D'
    WHEN pct >= 40 THEN 'E'
    ELSE 'F'
  END;

  IF COALESCE(e.purpose, 'exam') = 'exam' THEN
    final_score := round((pct / 100) * e.max_score::numeric, 2);
    INSERT INTO public.results (student_id, exam_id, score, grade, remark)
    VALUES (NEW.student_id, NEW.exam_id, final_score, letter,
            'CBT auto-graded (' || round(pct, 1) || '%)')
    ON CONFLICT (student_id, exam_id) DO UPDATE
      SET score = EXCLUDED.score,
          grade = EXCLUDED.grade,
          remark = EXCLUDED.remark;
  ELSE
    ca_score := round((pct / 100) * ca_max, 2);
    INSERT INTO public.continuous_assessments
      (student_id, subject_id, class_id, term_id, ca_type, score, max_score, title)
    VALUES (NEW.student_id, e.subject_id, e.class_id, e.term_id,
            e.purpose, ca_score, ca_max, e.title);
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure results upsert target exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.results'::regclass
      AND conname = 'results_student_exam_unique'
  ) THEN
    ALTER TABLE public.results
      ADD CONSTRAINT results_student_exam_unique UNIQUE (student_id, exam_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_auto_grade_exam_attempt ON public.exam_attempts;
CREATE TRIGGER trg_auto_grade_exam_attempt
  AFTER INSERT ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.auto_grade_exam_attempt();

-- Backfill any past attempts that never produced a result/CA row
INSERT INTO public.results (student_id, exam_id, score, grade, remark)
SELECT a.student_id, a.exam_id,
       round((COALESCE(a.percentage, CASE WHEN a.total_marks>0 THEN (a.raw_score::numeric/a.total_marks)*100 ELSE 0 END) / 100) * e.max_score::numeric, 2),
       CASE
         WHEN COALESCE(a.percentage,0) >= 70 THEN 'A'
         WHEN COALESCE(a.percentage,0) >= 60 THEN 'B'
         WHEN COALESCE(a.percentage,0) >= 50 THEN 'C'
         WHEN COALESCE(a.percentage,0) >= 45 THEN 'D'
         WHEN COALESCE(a.percentage,0) >= 40 THEN 'E'
         ELSE 'F'
       END,
       'CBT auto-graded (backfill)'
FROM public.exam_attempts a
JOIN public.exams e ON e.id = a.exam_id
WHERE COALESCE(e.purpose,'exam') = 'exam'
ON CONFLICT (student_id, exam_id) DO NOTHING;
