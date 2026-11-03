
ALTER TABLE public.book_loans
  ADD COLUMN IF NOT EXISTS fine_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fine_note text;

CREATE POLICY "Student borrow self"
  ON public.book_loans
  FOR INSERT
  TO authenticated
  WITH CHECK (borrower_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_equipment_over_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  avail integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'allocated' THEN
    SELECT available_quantity INTO avail FROM public.equipment WHERE id = NEW.equipment_id FOR UPDATE;
    IF avail IS NULL THEN
      RAISE EXCEPTION 'Equipment not found';
    END IF;
    IF NEW.quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity must be positive';
    END IF;
    IF NEW.quantity > avail THEN
      RAISE EXCEPTION 'Cannot allocate % units; only % available', NEW.quantity, avail;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_equipment_over_allocation ON public.equipment_allocations;
CREATE TRIGGER trg_prevent_equipment_over_allocation
BEFORE INSERT ON public.equipment_allocations
FOR EACH ROW EXECUTE FUNCTION public.prevent_equipment_over_allocation();
