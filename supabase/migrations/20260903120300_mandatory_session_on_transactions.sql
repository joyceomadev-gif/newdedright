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
