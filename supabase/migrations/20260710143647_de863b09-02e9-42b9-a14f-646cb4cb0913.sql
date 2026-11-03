
-- Subjects: teachers see only subjects for classes/subjects they teach
DROP POLICY IF EXISTS "All view subjects" ON public.subjects;
CREATE POLICY "All view subjects" ON public.subjects FOR SELECT
  USING (
    (NOT public.is_staff(auth.uid()))
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'head_of_section')
    OR (
      class_id IS NOT NULL
      AND public.class_matches_user_scope(class_id, auth.uid())
      AND (
        public.teaches_class(auth.uid(), class_id)
        OR public.teaches_class_subject(auth.uid(), class_id, id)
      )
    )
  );

-- Exams: teachers see only exams for classes/subjects they teach
DROP POLICY IF EXISTS "View exams" ON public.exams;
CREATE POLICY "View exams" ON public.exams FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'head_of_section')
    OR (
      public.is_staff(auth.uid())
      AND public.class_matches_user_scope(class_id, auth.uid())
      AND (
        public.teaches_class(auth.uid(), class_id)
        OR (subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), class_id, subject_id))
      )
    )
    OR (class_id IN (SELECT students.class_id FROM public.students WHERE students.user_id = auth.uid()))
    OR (published = true AND EXISTS (
      SELECT 1 FROM public.students s JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid() AND s.class_id = exams.class_id
    ))
  );
