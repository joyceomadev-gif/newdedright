-- Enforce one CBT attempt per student per exam at the database level
CREATE UNIQUE INDEX IF NOT EXISTS exam_attempts_one_per_student
  ON public.exam_attempts (exam_id, student_id);