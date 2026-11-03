
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enums
DO $$ BEGIN CREATE TYPE public.qb_question_type AS ENUM ('mcq','true_false','fill_blank','short_answer','essay','matching','multi_select');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.qb_difficulty AS ENUM ('easy','medium','hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.qb_status AS ENUM ('draft','approved','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.exam_status AS ENUM ('draft','published','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.terms(id),
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id),
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS sub_topic text,
  ADD COLUMN IF NOT EXISTS difficulty public.qb_difficulty NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status public.qb_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS time_suggestion_seconds integer,
  ADD COLUMN IF NOT EXISTS correct_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_qb_status ON public.question_bank(status);
CREATE INDEX IF NOT EXISTS idx_qb_difficulty ON public.question_bank(difficulty);
CREATE INDEX IF NOT EXISTS idx_qb_topic ON public.question_bank(topic);
CREATE INDEX IF NOT EXISTS idx_qb_subject_class ON public.question_bank(subject_id, class_id);
CREATE INDEX IF NOT EXISTS idx_qb_text_trgm ON public.question_bank USING gin (question_text gin_trgm_ops);

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS closes_at timestamptz,
  ADD COLUMN IF NOT EXISTS randomize_questions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS randomize_options boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status public.exam_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS pass_mark numeric,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.exam_attempts
  ADD COLUMN IF NOT EXISTS question_order uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS option_order jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS flagged_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS last_autosave_at timestamptz,
  ADD COLUMN IF NOT EXISTS ip inet,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress';

ALTER TABLE public.exam_attempts ALTER COLUMN submitted_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attempts_exam_student ON public.exam_attempts(exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON public.exam_attempts(status);

CREATE TABLE IF NOT EXISTS public.exam_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.exam_audit_log TO authenticated;
GRANT ALL ON public.exam_audit_log TO service_role;
ALTER TABLE public.exam_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read audit log" ON public.exam_audit_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Authenticated can insert own audit entries" ON public.exam_audit_log
  FOR INSERT TO authenticated WITH CHECK (actor_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.exam_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.exam_audit_log(actor_user_id);

CREATE TABLE IF NOT EXISTS public.question_bank_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  editor_user_id uuid REFERENCES auth.users(id),
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.question_bank_revisions TO authenticated;
GRANT ALL ON public.question_bank_revisions TO service_role;
ALTER TABLE public.question_bank_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read revisions" ON public.question_bank_revisions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff can insert revisions" ON public.question_bank_revisions
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND editor_user_id = auth.uid());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_qb_updated_at') THEN
    CREATE TRIGGER trg_qb_updated_at BEFORE UPDATE ON public.question_bank
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
