
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS section_label text,
  ADD COLUMN IF NOT EXISTS section_instruction text,
  ADD COLUMN IF NOT EXISTS section_order integer,
  ADD COLUMN IF NOT EXISTS question_number integer,
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_questions_exam_section
  ON public.questions (exam_id, section_order, question_number);
