CREATE OR REPLACE FUNCTION public.my_teaching_class_ids()
RETURNS TABLE(class_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_staff AS (
    SELECT st.id
    FROM public.staff st
    WHERE st.user_id = auth.uid()
       OR lower(st.email) = lower((SELECT au.email FROM auth.users au WHERE au.id = auth.uid()))
  )
  SELECT DISTINCT c.id AS class_id
  FROM public.classes c
  JOIN current_staff st ON st.id = c.class_teacher_id
  WHERE c.id IS NOT NULL

  UNION

  SELECT DISTINCT sub.class_id AS class_id
  FROM public.subjects sub
  JOIN current_staff st ON st.id = sub.teacher_id
  WHERE sub.class_id IS NOT NULL

  UNION

  SELECT DISTINCT tt.class_id AS class_id
  FROM public.timetable tt
  JOIN current_staff st ON st.id = tt.teacher_id
  WHERE tt.class_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.my_teaching_class_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.teaches_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_staff AS (
    SELECT st.id
    FROM public.staff st
    WHERE st.user_id = _user_id
       OR lower(st.email) = lower((SELECT au.email FROM auth.users au WHERE au.id = _user_id))
  )
  SELECT
    EXISTS (
      SELECT 1
      FROM public.classes c
      JOIN current_staff st ON st.id = c.class_teacher_id
      WHERE c.id = _class_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.subjects sub
      JOIN current_staff st ON st.id = sub.teacher_id
      WHERE sub.class_id = _class_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.timetable tt
      JOIN current_staff st ON st.id = tt.teacher_id
      WHERE tt.class_id = _class_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.teaches_class(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Teacher view own question bank" ON public.question_bank;
DROP POLICY IF EXISTS "Teacher manage own question bank" ON public.question_bank;

CREATE POLICY "Teacher view own question bank" ON public.question_bank
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.teaches_class(auth.uid(), class_id)
  )
);

CREATE POLICY "Teacher manage own question bank" ON public.question_bank
FOR ALL TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.teaches_class(auth.uid(), class_id)
  )
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.teaches_class(auth.uid(), class_id)
  )
);