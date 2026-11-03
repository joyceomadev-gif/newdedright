-- 20260903120100_student_enrollment_history.sql
-- The core fix: students.class_id is a single mutable field, so promoting
-- a student (via rollover_session(), the class roster "add students"
-- button, or a CSV import) overwrites it and the previous session's
-- class assignment is lost.
--
-- This migration adds student_enrollments: one row per (student, session),
-- capturing which class that student was in during that specific session.
-- It is populated AUTOMATICALLY by a trigger on students.class_id, so it
-- works no matter which existing code path changes class_id — nothing in
-- rollover_session(), classes.tsx, or CSV import needs to change.

-- Helper used throughout this migration set to find "this year" when no
-- more specific session can be derived from the record itself.
CREATE OR REPLACE FUNCTION public.get_current_session_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM public.sessions WHERE is_current = true LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id           uuid NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
  class_id             uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  status               text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','promoted','repeated','graduated','withdrawn','historical')),
  recorded_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (student_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_session ON public.student_enrollments (session_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON public.student_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class   ON public.student_enrollments (class_id);

ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view all enrollments" ON public.student_enrollments;
CREATE POLICY "Staff view all enrollments" ON public.student_enrollments
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manage enrollments" ON public.student_enrollments;
CREATE POLICY "Admin manage enrollments" ON public.student_enrollments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ AUTO-CAPTURE TRIGGER ============
-- Fires whenever a student's class_id is set or changed (insert, rollover,
-- roster reassignment, CSV import — anything). Derives the session from
-- the class itself (classes.session_id), since classes are already
-- session-scoped in this schema — this is safe even mid-rollover, when
-- sessions.is_current may not yet point at the new session.
CREATE OR REPLACE FUNCTION public.record_student_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF NEW.class_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT session_id INTO v_session_id FROM public.classes WHERE id = NEW.class_id;

  -- Fallback for classes created before session_id existed / wasn't set.
  IF v_session_id IS NULL THEN
    v_session_id := public.get_current_session_id();
  END IF;

  IF v_session_id IS NULL THEN
    RETURN NEW; -- no session context at all yet (e.g. very first setup) — skip silently
  END IF;

  INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
  VALUES (
    NEW.id,
    v_session_id,
    NEW.class_id,
    CASE WHEN NEW.status = 'graduated' THEN 'graduated'
         WHEN NEW.status = 'withdrawn' THEN 'withdrawn'
         ELSE 'active' END
  )
  ON CONFLICT (student_id, session_id)
  DO UPDATE SET class_id = EXCLUDED.class_id, status = EXCLUDED.status, recorded_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_student_enrollment ON public.students;
CREATE TRIGGER trg_record_student_enrollment
  AFTER INSERT OR UPDATE OF class_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.record_student_enrollment();

-- Convenience view: a student's full academic history, one row per session,
-- never mutated by later promotions.
CREATE OR REPLACE VIEW public.student_academic_history AS
SELECT
  se.student_id,
  st.full_name,
  st.admission_no,
  s.name  AS session_name,
  s.start_date,
  c.name  AS class_name,
  c.level AS class_level,
  se.status
FROM public.student_enrollments se
JOIN public.students st ON st.id = se.student_id
JOIN public.sessions s  ON s.id  = se.session_id
JOIN public.classes c   ON c.id  = se.class_id
ORDER BY st.full_name, s.start_date;
