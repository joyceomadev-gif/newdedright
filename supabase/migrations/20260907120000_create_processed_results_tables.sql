-- Create processed_results, result_processing_runs, and result_component_scores tables if they do not exist
-- Used by ProcessResultsPanel, ClassBroadsheetReport, and analytics subsystems.

CREATE TABLE IF NOT EXISTS public.result_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  exam_type text NOT NULL DEFAULT 'combined',
  students_processed integer NOT NULL DEFAULT 0,
  subjects_processed integer NOT NULL DEFAULT 0,
  rows_written integer NOT NULL DEFAULT 0,
  duration_ms integer,
  is_reprocess boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_result_proc_runs_lookup
  ON public.result_processing_runs(session_id, term_id, class_id, exam_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.result_processing_runs TO authenticated;
GRANT ALL ON public.result_processing_runs TO service_role;
ALTER TABLE public.result_processing_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rpr_read" ON public.result_processing_runs;
CREATE POLICY "rpr_read" ON public.result_processing_runs FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
);

DROP POLICY IF EXISTS "rpr_write" ON public.result_processing_runs;
CREATE POLICY "rpr_write" ON public.result_processing_runs FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
WITH CHECK (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id));

-- Processed results table
CREATE TABLE IF NOT EXISTS public.processed_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  exam_type text NOT NULL DEFAULT 'combined',
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  ca1_score numeric,
  ca2_score numeric,
  ca3_score numeric,
  ca_total numeric,
  exam_score numeric,
  total_score numeric,
  grade text,
  remark text,
  subject_position integer,
  subject_highest numeric,
  subject_lowest numeric,
  student_total_marks numeric,
  student_average numeric,
  subjects_count integer,
  class_position integer,
  class_average numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, term_id, class_id, exam_type, student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_results_scope
  ON public.processed_results(session_id, term_id, class_id, exam_type);
CREATE INDEX IF NOT EXISTS idx_processed_results_student
  ON public.processed_results(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.processed_results TO authenticated;
GRANT ALL ON public.processed_results TO service_role;
ALTER TABLE public.processed_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_read" ON public.processed_results;
CREATE POLICY "pr_read" ON public.processed_results FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = processed_results.student_id AND s.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id
             WHERE s.id = processed_results.student_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "pr_write" ON public.processed_results;
CREATE POLICY "pr_write" ON public.processed_results FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
WITH CHECK (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id));

-- Result component scores (normalized dynamic components breakdown)
CREATE TABLE IF NOT EXISTS public.result_component_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.processed_results(id) ON DELETE CASCADE,
  component_id uuid,
  component_code text NOT NULL,
  component_name text NOT NULL,
  score numeric,
  max_score numeric,
  weight_percentage numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_result_comp_scores_result
  ON public.result_component_scores(result_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.result_component_scores TO authenticated;
GRANT ALL ON public.result_component_scores TO service_role;
ALTER TABLE public.result_component_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rcs_read" ON public.result_component_scores;
CREATE POLICY "rcs_read" ON public.result_component_scores FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.processed_results pr
    WHERE pr.id = result_component_scores.result_id
      AND (
        public.teaches_class(auth.uid(), pr.class_id)
        OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = pr.student_id AND s.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id
                   WHERE s.id = pr.student_id AND p.user_id = auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "rcs_write" ON public.result_component_scores;
CREATE POLICY "rcs_write" ON public.result_component_scores FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
