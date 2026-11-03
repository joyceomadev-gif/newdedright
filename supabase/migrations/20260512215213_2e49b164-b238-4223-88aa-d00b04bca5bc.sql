CREATE OR REPLACE FUNCTION public.validate_timetable_conflict()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'Start time must be before end time';
  END IF;

  -- Class conflict
  IF EXISTS (
    SELECT 1 FROM public.timetable t
    WHERE t.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND t.class_id = NEW.class_id
      AND t.day_of_week = NEW.day_of_week
      AND t.start_time < NEW.end_time
      AND t.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Class already has a slot overlapping this time on this day';
  END IF;

  -- Teacher conflict
  IF NEW.teacher_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timetable t
    WHERE t.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND t.teacher_id = NEW.teacher_id
      AND t.day_of_week = NEW.day_of_week
      AND t.start_time < NEW.end_time
      AND t.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Teacher already booked for an overlapping slot on this day';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_timetable_conflict ON public.timetable;
CREATE TRIGGER trg_validate_timetable_conflict
  BEFORE INSERT OR UPDATE ON public.timetable
  FOR EACH ROW EXECUTE FUNCTION public.validate_timetable_conflict();