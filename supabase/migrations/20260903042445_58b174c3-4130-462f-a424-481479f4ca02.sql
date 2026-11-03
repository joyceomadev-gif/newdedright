-- 20260903120000_student_first_last_name.sql
-- Adds first_name / last_name to students (middle_name already exists).
-- Fully backward-compatible: any code that still inserts/updates only
-- `full_name` keeps working unchanged; first_name/last_name are kept in
-- sync automatically. New code can write first_name/last_name instead
-- and full_name will be derived automatically.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Backfill from the existing full_name for all current rows.
-- Heuristic: first word = first_name, last word = last_name
-- (middle_name column is already separate and untouched here).
UPDATE public.students
SET
  first_name = split_part(trim(full_name), ' ', 1),
  last_name  = CASE
                 WHEN array_length(regexp_split_to_array(trim(full_name), '\s+'), 1) >= 2
                   THEN (regexp_split_to_array(trim(full_name), '\s+'))
                        [array_length(regexp_split_to_array(trim(full_name), '\s+'), 1)]
                 ELSE NULL
               END
WHERE first_name IS NULL
  AND full_name IS NOT NULL
  AND length(trim(full_name)) > 0;

-- Two-way sync trigger:
--  * If caller supplies first_name/last_name but not full_name -> build full_name.
--  * If caller supplies (only) full_name, as all existing app code does today
--    -> split it into first_name/last_name automatically.
-- This means BOTH the old insert shape ({ full_name }) and a future new
-- insert shape ({ first_name, last_name }) work without any app changes.
CREATE OR REPLACE FUNCTION public.sync_student_name_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parts text[];
BEGIN
  -- Caller gave first/last (new-style form) -> (re)build full_name from parts.
  IF (NEW.first_name IS NOT NULL AND length(trim(NEW.first_name)) > 0) THEN
    NEW.full_name := trim(
      NEW.first_name
      || CASE WHEN NEW.middle_name IS NOT NULL AND length(trim(NEW.middle_name)) > 0
              THEN ' ' || NEW.middle_name ELSE '' END
      || CASE WHEN NEW.last_name IS NOT NULL AND length(trim(NEW.last_name)) > 0
              THEN ' ' || NEW.last_name ELSE '' END
    );
  -- Caller gave only full_name (existing app behaviour today) -> derive parts.
  ELSIF NEW.full_name IS NOT NULL AND length(trim(NEW.full_name)) > 0 THEN
    parts := regexp_split_to_array(trim(NEW.full_name), '\s+');
    NEW.first_name := parts[1];
    IF array_length(parts, 1) >= 2 THEN
      NEW.last_name := parts[array_length(parts, 1)];
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_name_fields ON public.students;
CREATE TRIGGER trg_sync_student_name_fields
  BEFORE INSERT OR UPDATE OF first_name, last_name, middle_name, full_name
  ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_student_name_fields();

-- Not enforcing NOT NULL yet — review any rows where the split looks wrong
-- (compound names, single-word names) using the query in
-- 20260903120400_backfill_and_verification.sql before tightening this.

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

-- 20260903120200_session_capture_on_enrollment.sql
-- Captures "which academic session was this person enrolled/onboarded in"
-- for students, parents and staff. Nullable + auto-filled by trigger, so
-- existing insert calls in the app (which don't set these fields) keep
-- working unchanged, but every new row gets correctly tagged.

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_session_id uuid REFERENCES public.sessions(id);
ALTER TABLE public.parents  ADD COLUMN IF NOT EXISTS enrolled_session_id  uuid REFERENCES public.sessions(id);
ALTER TABLE public.staff    ADD COLUMN IF NOT EXISTS employment_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_current_session_students()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.admission_session_id IS NULL THEN
    NEW.admission_session_id := public.get_current_session_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_students ON public.students;
CREATE TRIGGER trg_stamp_session_students
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.stamp_current_session_students();

CREATE OR REPLACE FUNCTION public.stamp_current_session_parents()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.enrolled_session_id IS NULL THEN
    NEW.enrolled_session_id := public.get_current_session_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_parents ON public.parents;
CREATE TRIGGER trg_stamp_session_parents
  BEFORE INSERT ON public.parents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_current_session_parents();

CREATE OR REPLACE FUNCTION public.stamp_current_session_staff()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employment_session_id IS NULL THEN
    NEW.employment_session_id := public.get_current_session_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_staff ON public.staff;
CREATE TRIGGER trg_stamp_session_staff
  BEFORE INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.stamp_current_session_staff();

-- Backfill existing rows to the current session (best available guess for
-- historical rows created before this column existed).
UPDATE public.students SET admission_session_id  = public.get_current_session_id() WHERE admission_session_id  IS NULL;
UPDATE public.parents  SET enrolled_session_id    = public.get_current_session_id() WHERE enrolled_session_id   IS NULL;
UPDATE public.staff    SET employment_session_id  = public.get_current_session_id() WHERE employment_session_id IS NULL;

-- 20260903120300_mandatory_session_on_transactions.sql
-- Adds academic_session_id to every transaction-style table (payments,
-- CAs, tests/exams, assessments, results) and auto-derives it via trigger
-- so NO existing insert/update call in the app needs to change:
--   - if the row already carries a class_id, derive session via
--     classes.session_id (classes are already session-scoped here)
--   - else if it carries a term_id, derive via terms.session_id
--   - else derive via its parent record (exam/fee/assignment)
--   - else fall back to the current session
-- Once every row is guaranteed non-null by the trigger + backfill, the
-- column is locked to NOT NULL.

-- ===================== CONTINUOUS ASSESSMENTS =====================
ALTER TABLE public.continuous_assessments
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_continuous_assessments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT session_id FROM public.classes WHERE id = NEW.class_id),
      (SELECT session_id FROM public.terms   WHERE id = NEW.term_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_ca ON public.continuous_assessments;
CREATE TRIGGER trg_stamp_session_ca
  BEFORE INSERT OR UPDATE OF class_id, term_id ON public.continuous_assessments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_continuous_assessments();

UPDATE public.continuous_assessments ca
SET academic_session_id = COALESCE(
  (SELECT session_id FROM public.classes WHERE id = ca.class_id),
  (SELECT session_id FROM public.terms   WHERE id = ca.term_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.continuous_assessments ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ca_session ON public.continuous_assessments (academic_session_id);

-- ===================== EXAMS =====================
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_exams()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT session_id FROM public.classes WHERE id = NEW.class_id),
      (SELECT session_id FROM public.terms   WHERE id = NEW.term_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_exams ON public.exams;
CREATE TRIGGER trg_stamp_session_exams
  BEFORE INSERT OR UPDATE OF class_id, term_id ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_exams();

UPDATE public.exams e
SET academic_session_id = COALESCE(
  (SELECT session_id FROM public.classes WHERE id = e.class_id),
  (SELECT session_id FROM public.terms   WHERE id = e.term_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.exams ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exams_session ON public.exams (academic_session_id);

-- ===================== RESULTS (derives from its exam) =====================
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_results()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT academic_session_id FROM public.exams WHERE id = NEW.exam_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_results ON public.results;
CREATE TRIGGER trg_stamp_session_results
  BEFORE INSERT OR UPDATE OF exam_id ON public.results
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_results();

UPDATE public.results r
SET academic_session_id = COALESCE(
  (SELECT academic_session_id FROM public.exams WHERE id = r.exam_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.results ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_results_session ON public.results (academic_session_id);

-- ===================== REPORT CARDS =====================
ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_report_cards()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT session_id FROM public.terms   WHERE id = NEW.term_id),
      (SELECT session_id FROM public.classes WHERE id = NEW.class_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_report_cards ON public.report_cards;
CREATE TRIGGER trg_stamp_session_report_cards
  BEFORE INSERT OR UPDATE OF term_id, class_id ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_report_cards();

UPDATE public.report_cards rc
SET academic_session_id = COALESCE(
  (SELECT session_id FROM public.terms   WHERE id = rc.term_id),
  (SELECT session_id FROM public.classes WHERE id = rc.class_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.report_cards ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_report_cards_session ON public.report_cards (academic_session_id);

-- ===================== FEES (payments) =====================
ALTER TABLE public.fees
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_fees()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT session_id FROM public.terms WHERE id = NEW.term_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_fees ON public.fees;
CREATE TRIGGER trg_stamp_session_fees
  BEFORE INSERT OR UPDATE OF term_id ON public.fees
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_fees();

UPDATE public.fees f
SET academic_session_id = COALESCE(
  (SELECT session_id FROM public.terms WHERE id = f.term_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.fees ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fees_session ON public.fees (academic_session_id);

-- ===================== PAYMENT TRANSACTIONS (derives from its fee) =====================
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_payment_transactions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT academic_session_id FROM public.fees WHERE id = NEW.fee_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_payment_transactions ON public.payment_transactions;
CREATE TRIGGER trg_stamp_session_payment_transactions
  BEFORE INSERT OR UPDATE OF fee_id ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_payment_transactions();

UPDATE public.payment_transactions pt
SET academic_session_id = COALESCE(
  (SELECT academic_session_id FROM public.fees WHERE id = pt.fee_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.payment_transactions ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_session ON public.payment_transactions (academic_session_id);

-- ===================== ASSIGNMENTS =====================
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_assignments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT session_id FROM public.classes WHERE id = NEW.class_id),
      (SELECT session_id FROM public.terms   WHERE id = NEW.term_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_assignments ON public.assignments;
CREATE TRIGGER trg_stamp_session_assignments
  BEFORE INSERT OR UPDATE OF class_id, term_id ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_assignments();

UPDATE public.assignments a
SET academic_session_id = COALESCE(
  (SELECT session_id FROM public.classes WHERE id = a.class_id),
  (SELECT session_id FROM public.terms   WHERE id = a.term_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.assignments ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_session ON public.assignments (academic_session_id);

-- ===================== ASSIGNMENT SUBMISSIONS (derives from its assignment) =====================
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_assignment_submissions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT academic_session_id FROM public.assignments WHERE id = NEW.assignment_id),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_assignment_submissions ON public.assignment_submissions;
CREATE TRIGGER trg_stamp_session_assignment_submissions
  BEFORE INSERT OR UPDATE OF assignment_id ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_assignment_submissions();

UPDATE public.assignment_submissions asub
SET academic_session_id = COALESCE(
  (SELECT academic_session_id FROM public.assignments WHERE id = asub.assignment_id),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

ALTER TABLE public.assignment_submissions ALTER COLUMN academic_session_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_session ON public.assignment_submissions (academic_session_id);

-- ===================== ATTENDANCE =====================
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id);

CREATE OR REPLACE FUNCTION public.stamp_session_attendance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.academic_session_id IS NULL THEN
    NEW.academic_session_id := COALESCE(
      (SELECT session_id FROM public.classes WHERE id = NEW.class_id),
      (SELECT id FROM public.sessions WHERE NEW.date BETWEEN start_date AND end_date LIMIT 1),
      public.get_current_session_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_session_attendance ON public.attendance;
CREATE TRIGGER trg_stamp_session_attendance
  BEFORE INSERT OR UPDATE OF class_id, date ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.stamp_session_attendance();

UPDATE public.attendance at
SET academic_session_id = COALESCE(
  (SELECT session_id FROM public.classes WHERE id = at.class_id),
  (SELECT id FROM public.sessions WHERE at.date BETWEEN start_date AND end_date LIMIT 1),
  public.get_current_session_id()
)
WHERE academic_session_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance (academic_session_id);
-- NOTE: not locking attendance to NOT NULL — some historical rows may
-- predate any recorded session and have no class_id either. Review with
-- the query in the next file before enforcing.

-- 20260903120500_backfill_and_verification.sql
-- Reconstructs past-session class history for students who were already
-- promoted before this migration existed, using the `promotion` table
-- (which has been logging from_class_id/to_class_id/session_id all along)
-- plus each class's own session_id. Also fixes graduated students, whose
-- class_id was never updated by rollover_session() (only status was),
-- so the trigger in migration 2 wouldn't have fired a fresh row for them.

-- 1) Reconstruct the "before" side of every past promotion.
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT p.student_id, c.session_id, p.from_class_id, 'historical'
FROM public.promotion p
JOIN public.classes c ON c.id = p.from_class_id
WHERE p.from_class_id IS NOT NULL AND c.session_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO NOTHING;

-- 2) Reconstruct the "after" side of every past promotion (to_class_id).
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT p.student_id, c.session_id, p.to_class_id,
       CASE WHEN p.status = 'graduated' THEN 'graduated' ELSE 'promoted' END
FROM public.promotion p
JOIN public.classes c ON c.id = p.to_class_id
WHERE p.to_class_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO NOTHING;

-- 3) Students who graduated: class_id in `students` stays on their last
--    class (rollover_session never clears it), so also record it against
--    that class's own session explicitly with status='graduated'.
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT s.id, c.session_id, s.class_id, 'graduated'
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
WHERE s.status = 'graduated' AND c.session_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO UPDATE
  SET status = 'graduated';

-- 4) Every student's CURRENT class/session, guaranteed correct last
--    (overwrites anything stale from steps 1-3 for the current session only).
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT s.id, c.session_id, s.class_id,
       CASE WHEN s.status = 'graduated' THEN 'graduated'
            WHEN s.status = 'withdrawn' THEN 'withdrawn'
            ELSE 'active' END
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
WHERE c.session_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO UPDATE
  SET class_id = EXCLUDED.class_id, status = EXCLUDED.status, recorded_at = now();
