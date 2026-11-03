
-- Helper: is this user the class teacher of the given class?
CREATE OR REPLACE FUNCTION public.is_class_teacher_of(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes c
    JOIN public.staff s ON s.id = c.class_teacher_id
    WHERE c.id = _class_id
      AND s.user_id = _user_id
  )
$$;

-- ============= QUESTIONS =============
-- Replace blanket "Staff manage questions" with admin + class-teacher rules.
DROP POLICY IF EXISTS "Staff manage questions" ON public.questions;

CREATE POLICY "Admin manage questions"
ON public.questions
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Class teacher manage own class questions"
ON public.questions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.is_class_teacher_of(auth.uid(), e.class_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.is_class_teacher_of(auth.uid(), e.class_id)
  )
);

-- ============= STUDENTS (ROSTER) =============
-- Admin policy already exists. Add a class-teacher UPDATE policy so teachers
-- can manage the roster of their own class only.
-- USING: the student is currently unassigned OR already in this teacher's class.
-- WITH CHECK: the new class assignment is either NULL (remove from roster) or this teacher's class.
CREATE POLICY "Class teacher manage own roster"
ON public.students
FOR UPDATE
TO authenticated
USING (
  class_id IS NULL
  OR public.is_class_teacher_of(auth.uid(), class_id)
)
WITH CHECK (
  class_id IS NULL
  OR public.is_class_teacher_of(auth.uid(), class_id)
);
