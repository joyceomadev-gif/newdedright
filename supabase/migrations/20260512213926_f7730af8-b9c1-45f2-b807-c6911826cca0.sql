
-- Evaluation review status
DO $$ BEGIN
  CREATE TYPE public.evaluation_review_status AS ENUM ('pending','approved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.staff_evaluations
  ADD COLUMN IF NOT EXISTS review_status public.evaluation_review_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Allow staff to submit/edit own draft evaluations; admins manage everything
DROP POLICY IF EXISTS "Staff submit own evaluations" ON public.staff_evaluations;
CREATE POLICY "Staff submit own evaluations" ON public.staff_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND evaluator_id = auth.uid()
    AND review_status = 'pending'
  );

DROP POLICY IF EXISTS "Evaluator edits own pending" ON public.staff_evaluations;
CREATE POLICY "Evaluator edits own pending" ON public.staff_evaluations
  FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid() AND review_status = 'pending')
  WITH CHECK (evaluator_id = auth.uid() AND review_status = 'pending');

-- Payroll transition validation trigger
CREATE OR REPLACE FUNCTION public.validate_payroll_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'New payroll rows must start in status draft';
    END IF;
    IF NEW.paid_date IS NOT NULL THEN
      RAISE EXCEPTION 'paid_date cannot be set on a draft payroll row';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'draft'    AND NEW.status = 'approved') OR
      (OLD.status = 'approved' AND NEW.status = 'paid')     OR
      (OLD.status = 'approved' AND NEW.status = 'draft')
    ) THEN
      RAISE EXCEPTION 'Invalid payroll status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- paid_date rules
  IF NEW.status = 'paid' THEN
    IF NEW.paid_date IS NULL THEN
      NEW.paid_date := CURRENT_DATE;
    END IF;
  ELSE
    IF NEW.paid_date IS NOT NULL THEN
      RAISE EXCEPTION 'paid_date can only be set when status is paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payroll_transition ON public.payroll;
CREATE TRIGGER trg_validate_payroll_transition
  BEFORE INSERT OR UPDATE ON public.payroll
  FOR EACH ROW EXECUTE FUNCTION public.validate_payroll_transition();
