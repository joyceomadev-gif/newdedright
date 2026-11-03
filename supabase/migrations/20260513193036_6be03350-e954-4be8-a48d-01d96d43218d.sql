
ALTER TABLE public.parent_teacher_meetings
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at      timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_meeting_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    IF NEW.status = 'confirmed' THEN NEW.confirmed_at := now(); END IF;
    IF NEW.status = 'completed' THEN NEW.completed_at := now(); END IF;
    IF NEW.status = 'cancelled' THEN NEW.cancelled_at := now(); END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_stamp_meeting_status ON public.parent_teacher_meetings;
CREATE TRIGGER trg_stamp_meeting_status
BEFORE UPDATE ON public.parent_teacher_meetings
FOR EACH ROW EXECUTE FUNCTION public.stamp_meeting_status();
