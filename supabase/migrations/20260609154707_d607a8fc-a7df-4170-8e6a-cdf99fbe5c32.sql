-- Restrict branch contact details (phone/address) to staff only
DROP POLICY IF EXISTS "All view branches" ON public.branches;
CREATE POLICY "Staff view branches"
  ON public.branches
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Scope teacher subject-update policy to authenticated role (not public/anon)
DROP POLICY IF EXISTS "Teachers update own subjects" ON public.subjects;
CREATE POLICY "Teachers update own subjects"
  ON public.subjects
  FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());