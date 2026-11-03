
CREATE TABLE IF NOT EXISTS public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  section text,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read templates"
  ON public.report_templates FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins insert templates"
  ON public.report_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update templates"
  ON public.report_templates FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete templates"
  ON public.report_templates FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER report_templates_set_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_report_templates_lookup
  ON public.report_templates (status, class_id, term_id, session_id, section)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_report_template(_class_id uuid, _term_id uuid)
RETURNS SETOF public.report_templates
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH ctx AS (
    SELECT
      lower(c.level::text) AS lvl_raw,
      lower(public.class_level_bucket(c.level::text)::text) AS lvl_bucket
    FROM public.classes c WHERE c.id = _class_id
  )
  SELECT t.*
  FROM public.report_templates t
  LEFT JOIN ctx ON true
  WHERE t.status = 'active'
    AND t.deleted_at IS NULL
    AND (t.class_id IS NULL OR t.class_id = _class_id)
    AND (t.term_id  IS NULL OR t.term_id  = _term_id)
    AND (
      t.section IS NULL
      OR ctx.lvl_raw IS NULL
      OR lower(t.section) = ctx.lvl_raw
      OR lower(t.section) = ctx.lvl_bucket
    )
  ORDER BY
    (t.class_id IS NOT NULL)::int DESC,
    (t.term_id  IS NOT NULL)::int DESC,
    (t.section  IS NOT NULL)::int DESC,
    t.updated_at DESC
  LIMIT 1;
$$;
