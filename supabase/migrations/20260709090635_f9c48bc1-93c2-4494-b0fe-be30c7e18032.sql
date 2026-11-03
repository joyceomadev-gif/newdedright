
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS section_label text,
  ADD COLUMN IF NOT EXISTS section_instruction text,
  ADD COLUMN IF NOT EXISTS section_order integer,
  ADD COLUMN IF NOT EXISTS question_number integer;

CREATE INDEX IF NOT EXISTS idx_qb_section ON public.question_bank (class_id, subject_id, section_order, question_number);
