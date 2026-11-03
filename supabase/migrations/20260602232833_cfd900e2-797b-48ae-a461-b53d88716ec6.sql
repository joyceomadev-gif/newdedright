ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','fill_gap','theory','short_answer'));
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq','fill_gap','theory','short_answer'));
ALTER TABLE public.questions ALTER COLUMN correct_answer DROP NOT NULL;
ALTER TABLE public.question_bank ALTER COLUMN correct_answer DROP NOT NULL;