
CREATE POLICY "Staff read question media"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-media' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff manage question media"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'question-media' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'question-media' AND public.is_staff(auth.uid()));
