-- Migration: Configurable Assessment & Grading Structure
-- Description: Adds tables, RLS policies, resolvers, and score boundary triggers for dynamic assessment structures, early-years skills criteria, and grading scales.

-- 1. Assessment Structures Table
CREATE TABLE IF NOT EXISTS public.assessment_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  education_level text DEFAULT 'all', -- 'all', 'nursery', 'primary', 'junior_secondary', 'senior_secondary'
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  is_default boolean DEFAULT false,
  total_max_score numeric DEFAULT 100 CHECK (total_max_score > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- 2. Assessment Components / Criteria Table
CREATE TABLE IF NOT EXISTS public.assessment_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid NOT NULL REFERENCES public.assessment_structures(id) ON DELETE CASCADE,
  code text NOT NULL, -- e.g. 'CA1', 'CA2', 'EXAM', or skill codes 'COUNT_1_5', 'WRITE_1_5'
  name text NOT NULL, -- e.g. 'Continuous Assessment 1' or 'Can count 1–5'
  category text DEFAULT 'exam_component', -- 'exam_component' (CA1/CA2/Exam) or 'skill_criterion' (Younger class skills)
  max_score numeric NOT NULL CHECK (max_score > 0),
  weight_percentage numeric DEFAULT 0 CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
  display_order integer DEFAULT 0,
  is_mandatory boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3. Grading Scales Table
CREATE TABLE IF NOT EXISTS public.grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  education_level text DEFAULT 'all',
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  is_default boolean DEFAULT false,
  bands jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of { grade, min_score, max_score, grade_point, remark }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Result Component Scores Table (Normalized dynamic scores)
CREATE TABLE IF NOT EXISTS public.result_component_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL,
  component_id uuid REFERENCES public.assessment_components(id) ON DELETE SET NULL,
  component_code text NOT NULL,
  component_name text,
  score numeric NOT NULL CHECK (score >= 0),
  max_score numeric NOT NULL CHECK (max_score > 0),
  weight_percentage numeric,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast query resolution
CREATE INDEX IF NOT EXISTS idx_assessment_structures_lookup ON public.assessment_structures(class_id, subject_id, education_level, is_default);
CREATE INDEX IF NOT EXISTS idx_assessment_components_struct ON public.assessment_components(structure_id, display_order);
CREATE INDEX IF NOT EXISTS idx_grading_scales_lookup ON public.grading_scales(class_id, subject_id, education_level, is_default);
CREATE INDEX IF NOT EXISTS idx_result_component_scores_result ON public.result_component_scores(result_id, component_code);

-- Enable RLS
ALTER TABLE public.assessment_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_component_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can view; Staff/Admins can manage
CREATE POLICY "View assessment_structures" ON public.assessment_structures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage assessment_structures" ON public.assessment_structures FOR ALL TO authenticated USING (true);

CREATE POLICY "View assessment_components" ON public.assessment_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage assessment_components" ON public.assessment_components FOR ALL TO authenticated USING (true);

CREATE POLICY "View grading_scales" ON public.grading_scales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage grading_scales" ON public.grading_scales FOR ALL TO authenticated USING (true);

CREATE POLICY "View result_component_scores" ON public.result_component_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage result_component_scores" ON public.result_component_scores FOR ALL TO authenticated USING (true);

-- 5. RPC Resolver for Assessment Structures
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
  -- 1. Subject + Class specific override
  SELECT id, name, total_max_score INTO target_id, target_name, target_max
  FROM public.assessment_structures
  WHERE deleted_at IS NULL
    AND class_id = _class_id AND subject_id = _subject_id
  ORDER BY created_at DESC LIMIT 1;

  -- 2. Class specific override
  IF target_id IS NULL AND _class_id IS NOT NULL THEN
    SELECT id, name, total_max_score INTO target_id, target_name, target_max
    FROM public.assessment_structures
    WHERE deleted_at IS NULL
      AND class_id = _class_id AND subject_id IS NULL
    ORDER BY created_at DESC LIMIT 1;
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

-- 6. RPC Resolver for Grading Scales
CREATE OR REPLACE FUNCTION public.resolve_grading_scale(
  _class_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _education_level text DEFAULT NULL
)
RETURNS TABLE (
  scale_id uuid,
  scale_name text,
  bands jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id uuid;
  target_name text;
  target_bands jsonb;
BEGIN
  -- 1. Subject + Class specific scale
  SELECT id, name, bands INTO target_id, target_name, target_bands
  FROM public.grading_scales
  WHERE class_id = _class_id AND subject_id = _subject_id
  ORDER BY created_at DESC LIMIT 1;

  -- 2. Class specific scale
  IF target_id IS NULL AND _class_id IS NOT NULL THEN
    SELECT id, name, bands INTO target_id, target_name, target_bands
    FROM public.grading_scales
    WHERE class_id = _class_id AND subject_id IS NULL
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 3. Educational level scale
  IF target_id IS NULL AND _education_level IS NOT NULL THEN
    SELECT id, name, bands INTO target_id, target_name, target_bands
    FROM public.grading_scales
    WHERE education_level = _education_level AND class_id IS NULL AND subject_id IS NULL
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 4. Tenant default scale
  IF target_id IS NULL THEN
    SELECT id, name, bands INTO target_id, target_name, target_bands
    FROM public.grading_scales
    WHERE is_default IS TRUE
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT target_id, target_name, target_bands;
END;
$$;

-- 7. Score Boundary Validation Function & Trigger
CREATE OR REPLACE FUNCTION public.validate_assessment_component_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.score > NEW.max_score THEN
    RAISE EXCEPTION 'Score (%) exceeds configured maximum score (%) for component %', NEW.score, NEW.max_score, NEW.component_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_component_score ON public.result_component_scores;
CREATE TRIGGER trg_validate_component_score
  BEFORE INSERT OR UPDATE ON public.result_component_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_assessment_component_score();

GRANT EXECUTE ON FUNCTION public.resolve_assessment_structure(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_grading_scale(uuid,uuid,text) TO authenticated;
