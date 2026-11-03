-- Sync broadsheet CA scores into continuous_assessments when broadsheet is published.
-- This ensures ProcessResultsPanel, ReportCards, and Student Portal all see broadsheet-entered data.

CREATE OR REPLACE FUNCTION public.sync_broadsheet_to_continuous_assessments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes TO 'published'
  IF OLD.status = 'published' OR NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  -- Delete any existing CA rows for this term/class that were previously synced from broadsheet
  -- (to allow re-publishing after edits)
  DELETE FROM public.continuous_assessments
  WHERE term_id = NEW.term_id
    AND class_id = NEW.class_id
    AND title LIKE '[broadsheet]%';

  -- Insert CA1 rows from broadsheet
  INSERT INTO public.continuous_assessments
    (student_id, class_id, subject_id, term_id, ca_type, score, max_score, title, recorded_by)
  SELECT
    b.student_id, b.class_id, b.subject_id, b.term_id,
    'ca1'::ca_type, b.ca1, 100,
    '[broadsheet] CA1', NEW.published_by
  FROM public.broadsheets b
  WHERE b.header_id = NEW.id
    AND b.ca1 IS NOT NULL;

  -- Insert CA2 rows from broadsheet
  INSERT INTO public.continuous_assessments
    (student_id, class_id, subject_id, term_id, ca_type, score, max_score, title, recorded_by)
  SELECT
    b.student_id, b.class_id, b.subject_id, b.term_id,
    'ca2'::ca_type, b.ca2, 100,
    '[broadsheet] CA2', NEW.published_by
  FROM public.broadsheets b
  WHERE b.header_id = NEW.id
    AND b.ca2 IS NOT NULL;

  -- Insert CA3 rows from broadsheet
  INSERT INTO public.continuous_assessments
    (student_id, class_id, subject_id, term_id, ca_type, score, max_score, title, recorded_by)
  SELECT
    b.student_id, b.class_id, b.subject_id, b.term_id,
    'ca3'::ca_type, b.ca3, 100,
    '[broadsheet] CA3', NEW.published_by
  FROM public.broadsheets b
  WHERE b.header_id = NEW.id
    AND b.ca3 IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Security: only service_role or admin should execute
REVOKE EXECUTE ON FUNCTION public.sync_broadsheet_to_continuous_assessments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_broadsheet_to_ca ON public.broadsheet_headers;
CREATE TRIGGER trg_sync_broadsheet_to_ca
  AFTER UPDATE ON public.broadsheet_headers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_broadsheet_to_continuous_assessments();
