
CREATE TABLE public.result_import_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  term_id UUID REFERENCES public.terms(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  exam_type TEXT,
  max_score NUMERIC,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.result_import_log TO authenticated;
GRANT ALL ON public.result_import_log TO service_role;

ALTER TABLE public.result_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view import log" ON public.result_import_log
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));

CREATE POLICY "Staff add import log" ON public.result_import_log
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()) AND imported_by = auth.uid());
