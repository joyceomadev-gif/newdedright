
CREATE OR REPLACE FUNCTION public.teaches_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_class_teacher_of(_user_id, _class_id)
    OR EXISTS (
      SELECT 1 FROM public.subjects sub
      JOIN public.staff st ON st.id = sub.teacher_id
      WHERE sub.class_id = _class_id AND st.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.timetable tt
      JOIN public.staff st ON st.id = tt.teacher_id
      WHERE tt.class_id = _class_id AND st.user_id = _user_id
    )
$$;

CREATE OR REPLACE FUNCTION public.teaches_exam_subject(_user_id uuid, _exam_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    LEFT JOIN public.subjects sub ON sub.id = e.subject_id
    LEFT JOIN public.staff st_sub ON st_sub.id = sub.teacher_id
    WHERE e.id = _exam_id
      AND (
        public.teaches_class(_user_id, e.class_id)
        OR (st_sub.user_id = _user_id)
      )
  )
$$;

DROP POLICY IF EXISTS "Teacher manage own class questions" ON public.questions;
CREATE POLICY "Teacher manage own class questions" ON public.questions
FOR ALL TO authenticated
USING (public.teaches_exam_subject(auth.uid(), exam_id))
WITH CHECK (public.teaches_exam_subject(auth.uid(), exam_id));

DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions" ON public.questions
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_exam_subject(auth.uid(), exam_id)
  OR EXISTS (
    SELECT 1 FROM public.exams e
    JOIN public.students s ON s.class_id = e.class_id
    WHERE e.id = questions.exam_id
      AND s.user_id = auth.uid()
      AND e.published = true
  )
);
