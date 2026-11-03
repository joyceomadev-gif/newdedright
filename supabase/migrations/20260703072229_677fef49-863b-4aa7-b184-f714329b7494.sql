
DO $$ BEGIN
  CREATE TYPE public.level_scope AS ENUM ('creche_nursery','primary','secondary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS level_scope public.level_scope;

CREATE OR REPLACE FUNCTION public.class_level_bucket(_level text)
RETURNS public.level_scope
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _level = 'nursery' THEN 'creche_nursery'::public.level_scope
    WHEN _level = 'primary' THEN 'primary'::public.level_scope
    WHEN _level IN ('jss','sss') THEN 'secondary'::public.level_scope
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.get_user_level_scope(_user_id uuid)
RETURNS public.level_scope
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT level_scope FROM public.staff WHERE user_id = _user_id AND level_scope IS NOT NULL LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.class_matches_user_scope(_class_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.get_user_level_scope(_user_id) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = _class_id
        AND public.class_level_bucket(c.level::text) = public.get_user_level_scope(_user_id)
    )
$$;

DROP POLICY IF EXISTS "All view classes" ON public.classes;
CREATE POLICY "All view classes" ON public.classes
  FOR SELECT USING (
    NOT public.is_staff(auth.uid())
    OR public.class_matches_user_scope(id, auth.uid())
  );

DROP POLICY IF EXISTS "Admin manage classes" ON public.classes;
CREATE POLICY "Admin manage classes" ON public.classes
  FOR ALL
  USING (public.is_admin(auth.uid()) AND public.class_matches_user_scope(id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) AND public.class_matches_user_scope(id, auth.uid()));

DROP POLICY IF EXISTS "All view subjects" ON public.subjects;
CREATE POLICY "All view subjects" ON public.subjects
  FOR SELECT USING (
    NOT public.is_staff(auth.uid())
    OR class_id IS NULL
    OR public.class_matches_user_scope(class_id, auth.uid())
  );

DROP POLICY IF EXISTS "Admin manage subjects" ON public.subjects;
CREATE POLICY "Admin manage subjects" ON public.subjects
  FOR ALL
  USING (public.is_admin(auth.uid()) AND (class_id IS NULL OR public.class_matches_user_scope(class_id, auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) AND (class_id IS NULL OR public.class_matches_user_scope(class_id, auth.uid())));

DROP POLICY IF EXISTS "Student/parent/staff view students" ON public.students;
CREATE POLICY "Student/parent/staff view students" ON public.students
  FOR SELECT USING (
    user_id = auth.uid()
    OR parent_id IN (SELECT p.id FROM public.parents p WHERE p.user_id = auth.uid())
    OR (
      public.is_staff(auth.uid())
      AND (class_id IS NULL OR public.class_matches_user_scope(class_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Admin manage students" ON public.students;
CREATE POLICY "Admin manage students" ON public.students
  FOR ALL
  USING (public.is_admin(auth.uid()) AND (class_id IS NULL OR public.class_matches_user_scope(class_id, auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) AND (class_id IS NULL OR public.class_matches_user_scope(class_id, auth.uid())));
