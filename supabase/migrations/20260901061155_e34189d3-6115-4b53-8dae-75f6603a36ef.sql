ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS contact_email_1 text,
  ADD COLUMN IF NOT EXISTS contact_email_2 text,
  ADD COLUMN IF NOT EXISTS contact_phone_1 text,
  ADD COLUMN IF NOT EXISTS contact_phone_2 text;