
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "View results" ON public.results;

CREATE POLICY "View results"
ON public.results
FOR SELECT
TO authenticated
USING (
  is_staff(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM public.exams e WHERE e.id = results.exam_id AND e.published = true)
    AND (
      student_id IN (SELECT s.id FROM public.students s WHERE s.user_id = auth.uid())
      OR student_id IN (
        SELECT s.id FROM public.students s
        JOIN public.parents p ON s.parent_id = p.id
        WHERE p.user_id = auth.uid()
      )
    )
  )
);
