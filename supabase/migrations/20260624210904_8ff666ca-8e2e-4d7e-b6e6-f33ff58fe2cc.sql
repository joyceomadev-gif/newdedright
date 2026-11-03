DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions" ON public.questions
FOR SELECT TO authenticated
USING (
  is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.students s ON s.class_id = e.class_id
    WHERE e.id = questions.exam_id
      AND s.user_id = auth.uid()
      AND e.published = true
  )
);