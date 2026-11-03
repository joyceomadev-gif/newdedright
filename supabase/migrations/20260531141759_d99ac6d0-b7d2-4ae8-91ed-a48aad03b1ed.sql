CREATE TABLE public.question_bank (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'exam' CHECK (purpose IN ('exam','ca1','ca2','ca3')),
  question_text text NOT NULL,
  options jsonb,
  correct_answer text NOT NULL,
  marks numeric NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage question bank"
ON public.question_bank
FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Staff view question bank"
ON public.question_bank
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

CREATE INDEX idx_question_bank_lookup ON public.question_bank (class_id, subject_id, purpose);

CREATE TRIGGER question_bank_set_updated_at
BEFORE UPDATE ON public.question_bank
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();