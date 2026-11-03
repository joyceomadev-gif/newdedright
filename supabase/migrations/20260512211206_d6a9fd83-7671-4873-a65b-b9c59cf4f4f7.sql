DO $$ BEGIN
  CREATE TYPE public.student_status AS ENUM ('active','graduated','withdrawn','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS status public.student_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS graduated_at date;

CREATE INDEX IF NOT EXISTS idx_students_status ON public.students (status);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (class_id);