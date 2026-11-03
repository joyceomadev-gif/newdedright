-- Tighten parents SELECT: only the parent themselves or admins. Remove broad is_staff read of parent PII.
DROP POLICY IF EXISTS "Parent view own" ON public.parents;
CREATE POLICY "Parent view own" ON public.parents
  FOR SELECT
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- Prevent teachers from reassigning subjects (teacher_id, class_id) via UPDATE.
DROP POLICY IF EXISTS "Teachers update own subjects" ON public.subjects;
CREATE POLICY "Teachers update own subjects" ON public.subjects
  FOR UPDATE
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());