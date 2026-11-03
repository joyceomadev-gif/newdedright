CREATE TABLE IF NOT EXISTS public.exam_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  title text NOT NULL,
  instruction text,
  section_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delete_reason text
);

CREATE INDEX IF NOT EXISTS idx_exam_sections_exam ON public.exam_sections(exam_id, section_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sections TO authenticated;
GRANT ALL ON public.exam_sections TO service_role;

ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage exam sections" ON public.exam_sections;
CREATE POLICY "Admin manage exam sections" ON public.exam_sections
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Teacher manage own class exam sections" ON public.exam_sections;
CREATE POLICY "Teacher manage own class exam sections" ON public.exam_sections
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_sections.exam_id
      AND class_matches_user_scope(e.class_id, auth.uid())
      AND (teaches_class(auth.uid(), e.class_id) OR (e.subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), e.class_id, e.subject_id)))))
  WITH CHECK (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM exams e WHERE e.id = exam_sections.exam_id
      AND class_matches_user_scope(e.class_id, auth.uid())
      AND (teaches_class(auth.uid(), e.class_id) OR (e.subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), e.class_id, e.subject_id)))));

ALTER TABLE public.exam_sections ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.exam_sections ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.exam_sections ADD COLUMN IF NOT EXISTS delete_reason text;

DROP POLICY IF EXISTS "hide_soft_deleted" ON public.exam_sections;
CREATE POLICY "hide_soft_deleted" ON public.exam_sections
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL OR is_super_admin(auth.uid()));

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.exam_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_section ON public.questions(section_id);