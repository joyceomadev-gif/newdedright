
-- 1) Students: remove the (class_id IS NULL) bypass branch
DROP POLICY IF EXISTS "Class teacher manage own roster" ON public.students;
CREATE POLICY "Class teacher manage own roster"
ON public.students
FOR UPDATE
TO authenticated
USING (class_id IS NOT NULL AND public.is_class_teacher_of(auth.uid(), class_id))
WITH CHECK (class_id IS NOT NULL AND public.is_class_teacher_of(auth.uid(), class_id));

-- 2) Subjects: prevent teachers from reassigning teacher_id to someone else
DROP POLICY IF EXISTS "Teachers update own subjects" ON public.subjects;
CREATE POLICY "Teachers update own subjects"
ON public.subjects
FOR UPDATE
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());
