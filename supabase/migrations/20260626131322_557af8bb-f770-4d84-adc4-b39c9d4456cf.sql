
-- (class_id, subject_id) pairs the current user teaches
CREATE OR REPLACE FUNCTION public.my_teaching_assignments()
RETURNS TABLE(class_id uuid, subject_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH current_staff AS (
    SELECT st.id
    FROM public.staff st
    WHERE st.user_id = auth.uid()
       OR lower(st.email) = lower((SELECT au.email FROM auth.users au WHERE au.id = auth.uid()))
  )
  SELECT DISTINCT sub.class_id, sub.id AS subject_id
  FROM public.subjects sub
  JOIN current_staff st ON st.id = sub.teacher_id
  WHERE sub.class_id IS NOT NULL

  UNION

  SELECT DISTINCT tt.class_id, tt.subject_id
  FROM public.timetable tt
  JOIN current_staff st ON st.id = tt.teacher_id
  WHERE tt.class_id IS NOT NULL AND tt.subject_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.my_teaching_assignments() TO authenticated;

CREATE OR REPLACE FUNCTION public.teaches_class_subject(_user_id uuid, _class_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH current_staff AS (
    SELECT st.id
    FROM public.staff st
    WHERE st.user_id = _user_id
       OR lower(st.email) = lower((SELECT au.email FROM auth.users au WHERE au.id = _user_id))
  )
  SELECT
    EXISTS (
      SELECT 1 FROM public.subjects sub
      JOIN current_staff st ON st.id = sub.teacher_id
      WHERE sub.class_id = _class_id AND sub.id = _subject_id
    )
    OR EXISTS (
      SELECT 1 FROM public.timetable tt
      JOIN current_staff st ON st.id = tt.teacher_id
      WHERE tt.class_id = _class_id AND tt.subject_id = _subject_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.teaches_class_subject(uuid, uuid, uuid) TO authenticated;

-- Tighten questions policies: must teach the exam's class AND subject
DROP POLICY IF EXISTS "View questions" ON public.questions;
DROP POLICY IF EXISTS "Teacher manage own class questions" ON public.questions;
DROP POLICY IF EXISTS "Staff manage questions" ON public.questions;

CREATE POLICY "View questions" ON public.questions
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.students s ON s.class_id = e.class_id
    WHERE e.id = questions.exam_id
      AND s.user_id = auth.uid()
      AND e.published = true
  )
);

CREATE POLICY "Teacher manage own class questions" ON public.questions
FOR ALL TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id)
  )
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id)
  )
);

-- Tighten question_bank to (class, subject) pairs
DROP POLICY IF EXISTS "Teacher view own question bank" ON public.question_bank;
DROP POLICY IF EXISTS "Teacher manage own question bank" ON public.question_bank;

CREATE POLICY "Teacher view own question bank" ON public.question_bank
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.teaches_class_subject(auth.uid(), class_id, subject_id)
  )
);

CREATE POLICY "Teacher manage own question bank" ON public.question_bank
FOR ALL TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.teaches_class_subject(auth.uid(), class_id, subject_id)
  )
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    created_by = auth.uid()
    AND public.teaches_class_subject(auth.uid(), class_id, subject_id)
  )
);
