
-- Extend students with detailed bio-data
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS state_of_origin text,
  ADD COLUMN IF NOT EXISTS lga text,
  ADD COLUMN IF NOT EXISTS place_of_birth text,
  ADD COLUMN IF NOT EXISTS religion text,
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS genotype text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS disabilities text,
  ADD COLUMN IF NOT EXISTS previous_school text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation text,
  ADD COLUMN IF NOT EXISTS home_phone text,
  ADD COLUMN IF NOT EXISTS email text;

-- Public storage bucket for student photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Public read student photos" ON storage.objects;
CREATE POLICY "Public read student photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'student-photos');

DROP POLICY IF EXISTS "Staff upload student photos" ON storage.objects;
CREATE POLICY "Staff upload student photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update student photos" ON storage.objects;
CREATE POLICY "Staff update student photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff delete student photos" ON storage.objects;
CREATE POLICY "Staff delete student photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));
