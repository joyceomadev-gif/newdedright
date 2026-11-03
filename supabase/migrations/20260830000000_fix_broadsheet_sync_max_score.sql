-- Fix: Broadsheet-to-CA sync now looks up the actual max_score for each
-- assessment component instead of hardcoding 100.
--
-- Previously, a teacher entering "12" in the broadsheet (meaning 12/15) was
-- synced to continuous_assessments as score=12, max_score=100 -- causing the
-- downstream normalizer pct(12, 100) to treat it as 12% instead of 80%.
--
-- The new function resolves the assessment structure for the broadsheet's
-- class, looks up each CA component's max_score from assessment_components,
-- normalises the raw score to a 0-100 percentage, and inserts with
-- max_score = 100 (which is now semantically correct).

CREATE OR REPLACE FUNCTION public.sync_broadsheet_to_continuous_assessments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_structure_id uuid;
  v_ca1_max numeric := 15;
  v_ca2_max numeric := 15;
  v_ca3_max numeric := 0;
BEGIN
  -- Only fire when status changes TO 'published'
  IF OLD.status = 'published' OR NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;

  -- Resolve the assessment structure for this class
  -- Priority: class-specific -> education-level default -> global default
  SELECT s.id INTO v_structure_id
  FROM public.assessment_structures s
  WHERE s.class_id = NEW.class_id
    AND s.deleted_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_structure_id IS NULL THEN
    SELECT s.id INTO v_structure_id
    FROM public.assessment_structures s
    WHERE s.education_level = (
      SELECT level FROM public.classes WHERE id = NEW.class_id
    )
      AND s.deleted_at IS NULL
    ORDER BY s.created_at DESC
    LIMIT 1;
  END IF;

  IF v_structure_id IS NULL THEN
    SELECT s.id INTO v_structure_id
    FROM public.assessment_structures s
    WHERE s.is_default = true
      AND s.deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Look up actual max_score for each CA component
  IF v_structure_id IS NOT NULL THEN
    SELECT COALESCE(c.max_score, 15) INTO v_ca1_max
    FROM public.assessment_components c
    WHERE c.structure_id = v_structure_id
      AND UPPER(c.code) = 'CA1'
    LIMIT 1;

    SELECT COALESCE(c.max_score, 15) INTO v_ca2_max
    FROM public.assessment_components c
    WHERE c.structure_id = v_structure_id
      AND UPPER(c.code) = 'CA2'
    LIMIT 1;

    SELECT COALESCE(c.max_score, 0) INTO v_ca3_max
    FROM public.assessment_components c
    WHERE c.structure_id = v_structure_id
      AND UPPER(c.code) = 'CA3'
    LIMIT 1;
  END IF;

  -- Delete any existing CA rows for this term/class that were previously
  -- synced from broadsheet (allows re-publishing after edits)
  DELETE FROM public.continuous_assessments
  WHERE term_id = NEW.term_id
    AND class_id = NEW.class_id
    AND title LIKE '[broadsheet]%';

  -- Insert CA1 rows -- normalise raw score to a 0-100 percentage
  IF v_ca1_max > 0 THEN
    INSERT INTO public.continuous_assessments
      (student_id, class_id, subject_id, term_id, ca_type,
       score, max_score, title, recorded_by)
    SELECT
      b.student_id, b.class_id, b.subject_id, b.term_id,
      'ca1'::ca_type,
      ROUND((b.ca1 / v_ca1_max) * 100, 2),
      100,
      '[broadsheet] CA1', NEW.published_by
    FROM public.broadsheets b
    WHERE b.header_id = NEW.id
      AND b.ca1 IS NOT NULL;
  END IF;

  -- Insert CA2 rows
  IF v_ca2_max > 0 THEN
    INSERT INTO public.continuous_assessments
      (student_id, class_id, subject_id, term_id, ca_type,
       score, max_score, title, recorded_by)
    SELECT
      b.student_id, b.class_id, b.subject_id, b.term_id,
      'ca2'::ca_type,
      ROUND((b.ca2 / v_ca2_max) * 100, 2),
      100,
      '[broadsheet] CA2', NEW.published_by
    FROM public.broadsheets b
    WHERE b.header_id = NEW.id
      AND b.ca2 IS NOT NULL;
  END IF;

  -- Insert CA3 rows
  IF v_ca3_max > 0 THEN
    INSERT INTO public.continuous_assessments
      (student_id, class_id, subject_id, term_id, ca_type,
       score, max_score, title, recorded_by)
    SELECT
      b.student_id, b.class_id, b.subject_id, b.term_id,
      'ca3'::ca_type,
      ROUND((b.ca3 / v_ca3_max) * 100, 2),
      100,
      '[broadsheet] CA3', NEW.published_by
    FROM public.broadsheets b
    WHERE b.header_id = NEW.id
      AND b.ca3 IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger (function signature unchanged, but ensure binding is fresh)
DROP TRIGGER IF EXISTS trg_sync_broadsheet_to_ca ON public.broadsheet_headers;
CREATE TRIGGER trg_sync_broadsheet_to_ca
  AFTER UPDATE ON public.broadsheet_headers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sync_broadsheet_to_continuous_assessments();
