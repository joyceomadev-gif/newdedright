-- Restore role helper that existed in the database but was never
-- captured in the repository migration history.

CREATE OR REPLACE FUNCTION public.is_teacher_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'teacher'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_parent_of_student(_user_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.parents p ON s.parent_id = p.id
    WHERE s.id = _student_id AND p.user_id = _user_id
  );
$$;

