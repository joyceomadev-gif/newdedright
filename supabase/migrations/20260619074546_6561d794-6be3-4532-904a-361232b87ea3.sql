DROP POLICY IF EXISTS "Public read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read staff photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read library-files" ON storage.objects;

CREATE POLICY "Authenticated read student photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'student-photos');

CREATE POLICY "Authenticated read staff photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'staff-photos');

CREATE POLICY "Authenticated read library-files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'library-files');