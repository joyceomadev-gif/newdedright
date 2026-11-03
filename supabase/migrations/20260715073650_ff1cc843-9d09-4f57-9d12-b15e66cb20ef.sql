CREATE POLICY "Teachers full access to students"
ON public.students
FOR ALL
TO authenticated
USING (public.is_teacher_role(auth.uid()) OR public.is_staff(auth.uid()))
WITH CHECK (public.is_teacher_role(auth.uid()) OR public.is_staff(auth.uid()));