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
