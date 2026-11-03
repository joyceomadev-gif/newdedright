
CREATE POLICY "Students manage own exam uploads" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'exam-uploads' AND (
    (storage.foldername(name))[1] IN (
      SELECT a.id::text FROM public.exam_attempts a
      JOIN public.students s ON s.id = a.student_id
      WHERE s.user_id = auth.uid()
    )
    OR public.is_staff(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'exam-uploads' AND (
    (storage.foldername(name))[1] IN (
      SELECT a.id::text FROM public.exam_attempts a
      JOIN public.students s ON s.id = a.student_id
      WHERE s.user_id = auth.uid()
    )
  )
);
