
-- ============================================================================
-- 1. Junction tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.class_teachers (
  class_id    uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff(id)   ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, staff_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subject_teachers (
  subject_id  uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff(id)    ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_id, staff_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_teachers TO authenticated;
GRANT ALL ON public.subject_teachers TO service_role;
ALTER TABLE public.subject_teachers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_class_teachers_staff   ON public.class_teachers(staff_id);
CREATE INDEX IF NOT EXISTS idx_subject_teachers_staff ON public.subject_teachers(staff_id);

-- Backfill from existing single-teacher pointers
INSERT INTO public.class_teachers (class_id, staff_id, is_primary)
SELECT id, class_teacher_id, true FROM public.classes
WHERE class_teacher_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.subject_teachers (subject_id, staff_id, is_primary)
SELECT id, teacher_id, true FROM public.subjects
WHERE teacher_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Policies on the new junction tables
-- ============================================================================
DROP POLICY IF EXISTS "Staff view class_teachers"  ON public.class_teachers;
CREATE POLICY "Staff view class_teachers" ON public.class_teachers FOR SELECT
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage class_teachers" ON public.class_teachers;
CREATE POLICY "Admins manage class_teachers" ON public.class_teachers
  USING (public.is_admin(auth.uid()) AND public.class_matches_user_scope(class_id, auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) AND public.class_matches_user_scope(class_id, auth.uid()));

DROP POLICY IF EXISTS "Staff view subject_teachers" ON public.subject_teachers;
CREATE POLICY "Staff view subject_teachers" ON public.subject_teachers FOR SELECT
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage subject_teachers" ON public.subject_teachers;
CREATE POLICY "Admins manage subject_teachers" ON public.subject_teachers
  USING (
    public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = subject_teachers.subject_id
        AND (s.class_id IS NULL OR public.class_matches_user_scope(s.class_id, auth.uid()))
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = subject_teachers.subject_id
        AND (s.class_id IS NULL OR public.class_matches_user_scope(s.class_id, auth.uid()))
    )
  );

-- ============================================================================
-- 3. Updated helper functions to consult junction tables
-- ============================================================================
CREATE OR REPLACE FUNCTION public.teaches_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = _user_id
  )
  SELECT
    EXISTS (SELECT 1 FROM public.classes c
            JOIN current_staff st ON st.id = c.class_teacher_id
            WHERE c.id = _class_id)
    OR EXISTS (SELECT 1 FROM public.class_teachers ct
               JOIN current_staff st ON st.id = ct.staff_id
               WHERE ct.class_id = _class_id)
    OR EXISTS (SELECT 1 FROM public.subjects sub
               JOIN current_staff st ON st.id = sub.teacher_id
               WHERE sub.class_id = _class_id)
    OR EXISTS (SELECT 1 FROM public.subject_teachers stt
               JOIN public.subjects sub ON sub.id = stt.subject_id
               JOIN current_staff st ON st.id = stt.staff_id
               WHERE sub.class_id = _class_id)
    OR EXISTS (SELECT 1 FROM public.timetable tt
               JOIN current_staff st ON st.id = tt.teacher_id
               WHERE tt.class_id = _class_id);
$$;

CREATE OR REPLACE FUNCTION public.teaches_class_subject(_user_id uuid, _class_id uuid, _subject_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = _user_id
  )
  SELECT
    EXISTS (SELECT 1 FROM public.subjects sub
            JOIN current_staff st ON st.id = sub.teacher_id
            WHERE sub.class_id = _class_id AND sub.id = _subject_id)
    OR EXISTS (SELECT 1 FROM public.subject_teachers stt
               JOIN current_staff st ON st.id = stt.staff_id
               WHERE stt.subject_id = _subject_id)
    OR EXISTS (SELECT 1 FROM public.class_teachers ct
               JOIN current_staff st ON st.id = ct.staff_id
               WHERE ct.class_id = _class_id)
    OR EXISTS (SELECT 1 FROM public.timetable tt
               JOIN current_staff st ON st.id = tt.teacher_id
               WHERE tt.class_id = _class_id AND tt.subject_id = _subject_id);
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher_of(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.classes c
            JOIN public.staff s ON s.id = c.class_teacher_id
            WHERE c.id = _class_id AND s.user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.class_teachers ct
               JOIN public.staff s ON s.id = ct.staff_id
               WHERE ct.class_id = _class_id AND s.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.my_teaching_class_ids()
RETURNS TABLE(class_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = auth.uid()
  )
  SELECT DISTINCT c.id FROM public.classes c
  JOIN current_staff st ON st.id = c.class_teacher_id WHERE c.id IS NOT NULL
  UNION
  SELECT DISTINCT ct.class_id FROM public.class_teachers ct
  JOIN current_staff st ON st.id = ct.staff_id
  UNION
  SELECT DISTINCT sub.class_id FROM public.subjects sub
  JOIN current_staff st ON st.id = sub.teacher_id WHERE sub.class_id IS NOT NULL
  UNION
  SELECT DISTINCT sub.class_id FROM public.subject_teachers stt
  JOIN public.subjects sub ON sub.id = stt.subject_id
  JOIN current_staff st ON st.id = stt.staff_id
  WHERE sub.class_id IS NOT NULL
  UNION
  SELECT DISTINCT tt.class_id FROM public.timetable tt
  JOIN current_staff st ON st.id = tt.teacher_id WHERE tt.class_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.my_teaching_assignments()
RETURNS TABLE(class_id uuid, subject_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH current_staff AS (
    SELECT st.id FROM public.staff st WHERE st.user_id = auth.uid()
  )
  SELECT DISTINCT sub.class_id, sub.id FROM public.subjects sub
  JOIN current_staff st ON st.id = sub.teacher_id
  WHERE sub.class_id IS NOT NULL
  UNION
  SELECT DISTINCT sub.class_id, sub.id FROM public.subject_teachers stt
  JOIN public.subjects sub ON sub.id = stt.subject_id
  JOIN current_staff st ON st.id = stt.staff_id
  WHERE sub.class_id IS NOT NULL
  UNION
  SELECT DISTINCT tt.class_id, tt.subject_id FROM public.timetable tt
  JOIN current_staff st ON st.id = tt.teacher_id
  WHERE tt.class_id IS NOT NULL AND tt.subject_id IS NOT NULL;
$$;

-- ============================================================================
-- 4. Level-scope guard for teachers (parallels class_matches_user_scope)
--    class_matches_user_scope already returns true when scope IS NULL,
--    and true for super_admins. Extend it so it applies uniformly to any
--    staff member with a level_scope, not just admins.
--    (Existing definition already does this — it consults get_user_level_scope
--    which reads staff.level_scope for any staff user.)
-- ============================================================================

-- ============================================================================
-- 5. Teacher-facing policies: add level-scope check
-- ============================================================================

-- classes: teacher-visible only if within scope (admins already scoped)
DROP POLICY IF EXISTS "All view classes" ON public.classes;
CREATE POLICY "All view classes" ON public.classes FOR SELECT
  USING (
    (NOT public.is_staff(auth.uid()))
    OR public.class_matches_user_scope(id, auth.uid())
  );

-- subjects: teachers only see subjects for classes within their scope
DROP POLICY IF EXISTS "All view subjects" ON public.subjects;
CREATE POLICY "All view subjects" ON public.subjects FOR SELECT
  USING (
    (NOT public.is_staff(auth.uid()))
    OR class_id IS NULL
    OR public.class_matches_user_scope(class_id, auth.uid())
  );

-- students: staff view already respects scope; ensure teacher-managed roster
-- also respects scope
DROP POLICY IF EXISTS "Class teacher manage own roster" ON public.students;
CREATE POLICY "Class teacher manage own roster" ON public.students FOR UPDATE
  TO authenticated
  USING (
    class_id IS NOT NULL
    AND public.is_class_teacher_of(auth.uid(), class_id)
    AND public.class_matches_user_scope(class_id, auth.uid())
  )
  WITH CHECK (
    class_id IS NOT NULL
    AND public.is_class_teacher_of(auth.uid(), class_id)
    AND public.class_matches_user_scope(class_id, auth.uid())
  );

-- exams: staff manage exams only within their scope
DROP POLICY IF EXISTS "Staff manage exams" ON public.exams;
CREATE POLICY "Staff manage exams" ON public.exams
  TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND public.class_matches_user_scope(class_id, auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.teaches_class(auth.uid(), class_id)
      OR (subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), class_id, subject_id))
    )
  )
  WITH CHECK (
    public.is_staff(auth.uid())
    AND public.class_matches_user_scope(class_id, auth.uid())
    AND (
      public.is_admin(auth.uid())
      OR public.teaches_class(auth.uid(), class_id)
      OR (subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), class_id, subject_id))
    )
  );

DROP POLICY IF EXISTS "View exams" ON public.exams;
CREATE POLICY "View exams" ON public.exams FOR SELECT
  TO authenticated
  USING (
    (public.is_staff(auth.uid()) AND public.class_matches_user_scope(class_id, auth.uid()))
    OR (class_id IN (SELECT students.class_id FROM public.students WHERE students.user_id = auth.uid()))
    OR (published = true AND EXISTS (
      SELECT 1 FROM public.students s JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid() AND s.class_id = exams.class_id
    ))
  );

-- questions: allow any teacher assigned to the class or the subject
DROP POLICY IF EXISTS "Teacher manage own class questions" ON public.questions;
CREATE POLICY "Teacher manage own class questions" ON public.questions
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = questions.exam_id
        AND public.class_matches_user_scope(e.class_id, auth.uid())
        AND (
          public.teaches_class(auth.uid(), e.class_id)
          OR (e.subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id))
        )
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = questions.exam_id
        AND public.class_matches_user_scope(e.class_id, auth.uid())
        AND (
          public.teaches_class(auth.uid(), e.class_id)
          OR (e.subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id))
        )
    )
  );
