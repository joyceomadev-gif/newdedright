-- Migration: Harden Configurable Grading RLS, Broadsheet Sync DELETE Scope, Exam Answer Validation & resolve_assessment_structure Scope (Fix Branch Polish)
-- Description: Hardens RLS policies on assessment_structures, assessment_components, grading_scales, and result_component_scores. Fixes broadsheet CA sync delete scope to filter by subject_id. Hardens submit_exam_attempt answer validation and tightens resolve_assessment_structure fallback scope.

-- 1. Harden RLS Policies on Assessment & Grading Tables
DROP POLICY IF EXISTS "Staff manage assessment_structures" ON public.assessment_structures;
CREATE POLICY "Staff manage assessment_structures" ON public.assessment_structures
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section', 'teacher')
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section', 'teacher')
    )
  );

DROP POLICY IF EXISTS "Staff manage assessment_components" ON public.assessment_components;
CREATE POLICY "Staff manage assessment_components" ON public.assessment_components
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section', 'teacher')
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section', 'teacher')
    )
  );

DROP POLICY IF EXISTS "Staff manage grading_scales" ON public.grading_scales;
CREATE POLICY "Staff manage grading_scales" ON public.grading_scales
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section')
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section')
    )
  );

DROP POLICY IF EXISTS "Staff manage result_component_scores" ON public.result_component_scores;
CREATE POLICY "Staff manage result_component_scores" ON public.result_component_scores
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section', 'teacher')
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('head_of_section', 'teacher')
    )
  );

-- 2. Fix Broadsheet-to-CA Sync Trigger DELETE Scope (Scope to subject_id as well as term/class)
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

  -- Resolve assessment structure for this class
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

  -- Delete existing CA rows scoped specifically to term_id, class_id, AND subject_id
  DELETE FROM public.continuous_assessments
  WHERE term_id = NEW.term_id
    AND class_id = NEW.class_id
    AND subject_id = NEW.subject_id
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

  -- Insert CA3 rows if CA3 is configured
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

-- 3. Hardened Exam Answer Validation in submit_exam_attempt
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  _exam_id uuid,
  _student_id uuid,
  _started_at timestamptz,
  _submitted_at timestamptz,
  _duration_seconds int,
  _answers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
  ans_rec jsonb;
  q_rec public.questions%ROWTYPE;
  raw numeric := 0;
  total numeric := 0;
  attempt_id uuid;
  s_ans text;
  is_valid_answer boolean;
BEGIN
  -- Load exam
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;

  -- Verify student is entitled
  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.id = _student_id AND s.class_id = e.class_id
  ) THEN RAISE EXCEPTION 'Not entitled to this exam'; END IF;

  -- Check for duplicate submission
  IF EXISTS (
    SELECT 1 FROM public.exam_attempts
    WHERE exam_id = _exam_id AND student_id = _student_id
  ) THEN RAISE EXCEPTION 'Exam already submitted'; END IF;

  -- Validate each answer against question existence and answer presence
  FOR ans_rec IN SELECT * FROM jsonb_array_elements(_answers)
  LOOP
    -- Skip meta entries (e.g. violations log)
    CONTINUE WHEN ans_rec ? '__meta';

    -- Load question details
    SELECT * INTO q_rec FROM public.questions q
    WHERE q.id = (ans_rec->>'question_id')::uuid AND q.exam_id = _exam_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid question_id: %', ans_rec->>'question_id';
    END IF;

    total := total + COALESCE((ans_rec->>'marks')::numeric, q_rec.marks, 1);
    s_ans := trim(COALESCE(ans_rec->>'student_answer', ''));

    -- Reject attempts claiming is_correct without providing a valid non-empty student answer
    IF (ans_rec->>'is_correct')::boolean = true THEN
      IF length(s_ans) = 0 THEN
        RAISE EXCEPTION 'Invalid score claim: Empty student_answer cannot be marked correct for question %', q_rec.id;
      END IF;

      -- If question has explicit correct_answer, verify string or option match
      IF q_rec.correct_answer IS NOT NULL AND length(trim(q_rec.correct_answer)) > 0 THEN
        is_valid_answer := (lower(s_ans) = lower(trim(q_rec.correct_answer))) OR (q_rec.options IS NOT NULL AND q_rec.options::text ILIKE '%' || s_ans || '%');
        IF NOT is_valid_answer THEN
          RAISE EXCEPTION 'Invalid score claim: Student answer "%" does not match question options or answer key for question %', s_ans, q_rec.id;
        END IF;
      END IF;

      raw := raw + COALESCE((ans_rec->>'marks')::numeric, q_rec.marks, 1);
    END IF;
  END LOOP;

  -- Insert attempt with verified scores
  INSERT INTO public.exam_attempts (
    exam_id, student_id, started_at, submitted_at,
    duration_seconds, raw_score, total_marks, percentage, answers
  ) VALUES (
    _exam_id, _student_id, _started_at, _submitted_at,
    _duration_seconds, raw, total,
    CASE WHEN total > 0 THEN round((raw / total) * 100, 2) ELSE 0 END,
    _answers
  ) RETURNING id INTO attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', attempt_id,
    'raw_score', raw,
    'total_marks', total,
    'percentage', CASE WHEN total > 0 THEN round((raw / total) * 100, 2) ELSE 0 END
  );
END;
$$;

-- 4. Tightened resolve_assessment_structure RPC with term_id & session_id scoping
CREATE OR REPLACE FUNCTION public.resolve_assessment_structure(
  _class_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _term_id uuid DEFAULT NULL,
  _session_id uuid DEFAULT NULL
)
RETURNS TABLE (
  structure_id uuid,
  structure_name text,
  total_max_score numeric,
  components jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
  target_name text;
  target_max numeric;
BEGIN
  -- 1. Subject + Class + Term + Session specific override
  SELECT id, name, total_max_score INTO target_id, target_name, target_max
  FROM public.assessment_structures
  WHERE deleted_at IS NULL
    AND class_id = _class_id AND subject_id = _subject_id
    AND (_term_id IS NULL OR term_id = _term_id OR term_id IS NULL)
    AND (_session_id IS NULL OR session_id = _session_id OR session_id IS NULL)
  ORDER BY (term_id IS NOT NULL) DESC, (session_id IS NOT NULL) DESC, created_at DESC LIMIT 1;

  -- 2. Class specific override
  IF target_id IS NULL AND _class_id IS NOT NULL THEN
    SELECT id, name, total_max_score INTO target_id, target_name, target_max
    FROM public.assessment_structures
    WHERE deleted_at IS NULL
      AND class_id = _class_id AND subject_id IS NULL
      AND (_term_id IS NULL OR term_id = _term_id OR term_id IS NULL)
      AND (_session_id IS NULL OR session_id = _session_id OR session_id IS NULL)
    ORDER BY (term_id IS NOT NULL) DESC, (session_id IS NOT NULL) DESC, created_at DESC LIMIT 1;
  END IF;

  -- 3. Global / Tenant Default structure
  IF target_id IS NULL THEN
    SELECT id, name, total_max_score INTO target_id, target_name, target_max
    FROM public.assessment_structures
    WHERE deleted_at IS NULL AND is_default IS TRUE
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    target_id AS structure_id,
    target_name AS structure_name,
    target_max AS total_max_score,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'code', c.code,
            'name', c.name,
            'category', c.category,
            'max_score', c.max_score,
            'weight_percentage', c.weight_percentage,
            'display_order', c.display_order,
            'is_mandatory', c.is_mandatory
          ) ORDER BY c.display_order ASC
        )
        FROM public.assessment_components c
        WHERE c.structure_id = target_id
      ),
      '[]'::jsonb
    ) AS components;
END;
$$;
