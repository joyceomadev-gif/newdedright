
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_question_type_check') THEN
    ALTER TABLE public.questions DROP CONSTRAINT questions_question_type_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_bank_question_type_check') THEN
    ALTER TABLE public.question_bank DROP CONSTRAINT question_bank_question_type_check;
  END IF;
END $$;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_question_type_check
  CHECK (question_type IN ('mcq','fill_gap','theory','short_answer','drawing','coloring','chart'));

ALTER TABLE public.question_bank
  ADD CONSTRAINT question_bank_question_type_check
  CHECK (question_type IN ('mcq','fill_gap','theory','short_answer','drawing','coloring','chart'));
