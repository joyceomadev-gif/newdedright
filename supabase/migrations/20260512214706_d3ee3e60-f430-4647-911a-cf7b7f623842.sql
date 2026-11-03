-- ============================================================
-- Module 4: Academics
-- Curriculum, lesson plans, homework/assignments, continuous assessment
-- (Timetable already exists.)
-- ============================================================

-- Reuse existing class_level enum on classes.level for curriculum scoping.

-- CURRICULUM ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level class_level NOT NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  learning_outcomes text,
  resources text,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.curriculum ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view curriculum" ON public.curriculum
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage curriculum" ON public.curriculum
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TRIGGER trg_curriculum_updated_at
  BEFORE UPDATE ON public.curriculum
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_curriculum_level ON public.curriculum(level);
CREATE INDEX IF NOT EXISTS idx_curriculum_subject ON public.curriculum(subject_id);

-- LESSON PLANS -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  teacher_id uuid,
  week_number int CHECK (week_number IS NULL OR (week_number >= 1 AND week_number <= 20)),
  topic text NOT NULL,
  objectives text,
  materials text,
  activities text,
  evaluation text,
  lesson_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage lesson plans" ON public.lesson_plans
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Students view class lesson plans" ON public.lesson_plans
  FOR SELECT TO authenticated USING (
    is_staff(auth.uid()) OR class_id IN (
      SELECT class_id FROM public.students WHERE user_id = auth.uid()
    ) OR class_id IN (
      SELECT s.class_id FROM public.students s
      JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_lesson_plans_updated_at
  BEFORE UPDATE ON public.lesson_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_lesson_plans_class ON public.lesson_plans(class_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_term ON public.lesson_plans(term_id);

-- HOMEWORK / ASSIGNMENTS ---------------------------------------
DO $$ BEGIN
  CREATE TYPE assignment_status AS ENUM ('draft','published','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('submitted','late','graded','returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  teacher_id uuid,
  title text NOT NULL,
  instructions text,
  attachment_url text,
  max_score numeric NOT NULL DEFAULT 100,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status assignment_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage assignments" ON public.assignments
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "View assignments" ON public.assignments
  FOR SELECT TO authenticated USING (
    is_staff(auth.uid()) OR (status = 'published' AND (
      class_id IN (SELECT class_id FROM public.students WHERE user_id = auth.uid())
      OR class_id IN (
        SELECT s.class_id FROM public.students s
        JOIN public.parents p ON s.parent_id = p.id
        WHERE p.user_id = auth.uid()
      )
    ))
  );

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_assignments_class ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due ON public.assignments(due_date);

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  content text,
  attachment_url text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status submission_status NOT NULL DEFAULT 'submitted',
  score numeric,
  feedback text,
  graded_by uuid,
  graded_at timestamptz,
  UNIQUE (assignment_id, student_id)
);

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage submissions" ON public.assignment_submissions
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Student submit own" ON public.assignment_submissions
  FOR INSERT TO authenticated WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  );

CREATE POLICY "View own submissions" ON public.assignment_submissions
  FOR SELECT TO authenticated USING (
    is_staff(auth.uid())
    OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.assignment_submissions(student_id);

-- CONTINUOUS ASSESSMENT ----------------------------------------
DO $$ BEGIN
  CREATE TYPE ca_type AS ENUM ('ca1','ca2','ca3','test','project','classwork','homework','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.continuous_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  ca_type ca_type NOT NULL DEFAULT 'ca1',
  title text,
  score numeric NOT NULL,
  max_score numeric NOT NULL DEFAULT 10,
  assessment_date date NOT NULL DEFAULT CURRENT_DATE,
  remark text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.continuous_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage CA" ON public.continuous_assessments
  FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "View CA" ON public.continuous_assessments
  FOR SELECT TO authenticated USING (
    is_staff(auth.uid())
    OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_ca_updated_at
  BEFORE UPDATE ON public.continuous_assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ca_student ON public.continuous_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_ca_subject ON public.continuous_assessments(subject_id);
CREATE INDEX IF NOT EXISTS idx_ca_term ON public.continuous_assessments(term_id);

-- Score validation trigger
CREATE OR REPLACE FUNCTION public.validate_ca_score()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.score < 0 THEN RAISE EXCEPTION 'Score cannot be negative'; END IF;
  IF NEW.max_score <= 0 THEN RAISE EXCEPTION 'Max score must be positive'; END IF;
  IF NEW.score > NEW.max_score THEN RAISE EXCEPTION 'Score % exceeds max %', NEW.score, NEW.max_score; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_ca_score
  BEFORE INSERT OR UPDATE ON public.continuous_assessments
  FOR EACH ROW EXECUTE FUNCTION public.validate_ca_score();