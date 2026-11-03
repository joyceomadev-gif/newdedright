
-- Exams / questions hot paths
CREATE INDEX IF NOT EXISTS idx_questions_exam_id
  ON public.questions (exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_student
  ON public.exam_attempts (exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_student
  ON public.exam_attempts (student_id);
CREATE INDEX IF NOT EXISTS idx_question_bank_class_subject_purpose
  ON public.question_bank (class_id, subject_id, purpose);
CREATE INDEX IF NOT EXISTS idx_exams_class_subject_term
  ON public.exams (class_id, subject_id, term_id);
CREATE INDEX IF NOT EXISTS idx_exams_status
  ON public.exams (status);

-- List / sort hot paths
CREATE INDEX IF NOT EXISTS idx_students_status_full_name
  ON public.students (status, full_name);
CREATE INDEX IF NOT EXISTS idx_students_class_id
  ON public.students (class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_name
  ON public.subjects (name);
CREATE INDEX IF NOT EXISTS idx_subjects_class_id
  ON public.subjects (class_id);
CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id
  ON public.subjects (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_name
  ON public.classes (name);
CREATE INDEX IF NOT EXISTS idx_staff_status_full_name
  ON public.staff (status, full_name);
CREATE INDEX IF NOT EXISTS idx_staff_user_id
  ON public.staff (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name
  ON public.profiles (full_name);

-- Auth / role hot paths
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role
  ON public.user_roles (role);
