DROP POLICY IF EXISTS "View exams" ON public.exams;

CREATE POLICY "View exams"
ON public.exams
FOR SELECT
TO authenticated
USING (
  public.is_staff(auth.uid())
  OR class_id IN (
    SELECT class_id
    FROM public.students
    WHERE user_id = auth.uid()
  )
  OR (
    published = true
    AND EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid()
        AND s.class_id = exams.class_id
    )
  )
);