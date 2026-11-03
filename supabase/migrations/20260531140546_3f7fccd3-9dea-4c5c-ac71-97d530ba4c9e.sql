
-- CA3 support
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS ca3_weight numeric NOT NULL DEFAULT 0;

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS uses_ca3 boolean NOT NULL DEFAULT false;

-- CBT exam enhancements
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'exam',
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS question_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS num_questions integer;

DO $$ BEGIN
  ALTER TABLE public.exams
    ADD CONSTRAINT exams_purpose_chk CHECK (purpose IN ('exam','ca1','ca2','ca3'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.exams
    ADD CONSTRAINT exams_question_source_chk CHECK (question_source IN ('manual','random'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
