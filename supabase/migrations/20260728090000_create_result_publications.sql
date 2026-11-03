-- Restore result_publications table, enum, and RPC functions that previously existed outside the repository migration history.

DO $$ BEGIN
    CREATE TYPE public.result_pub_status AS ENUM ('draft', 'approved', 'published');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.result_publications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    exam_type text NOT NULL DEFAULT 'combined',
    status public.result_pub_status NOT NULL DEFAULT 'draft',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    approved_at timestamptz,
    approved_by uuid,
    published_at timestamptz,
    published_by uuid,
    unpublished_at timestamptz,
    unpublished_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, term_id, class_id, exam_type)
);

-- Enable RLS
ALTER TABLE public.result_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view result publications"
    ON public.result_publications FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.can_approve_results(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR public.has_role(_user_id, 'head_of_section'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_result_published(
  _session_id uuid,
  _term_id uuid,
  _class_id uuid,
  _exam_type text DEFAULT 'combined'
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.result_publications
    WHERE session_id = _session_id
      AND term_id = _term_id
      AND class_id = _class_id
      AND (exam_type = _exam_type OR _exam_type IS NULL OR _exam_type = 'combined')
      AND status = 'published'::public.result_pub_status
  );
$$;

CREATE OR REPLACE FUNCTION public.approve_results(
  _session_id uuid,
  _term_id uuid,
  _class_id uuid,
  _exam_type text DEFAULT 'combined',
  _notes text DEFAULT NULL
)
RETURNS public.result_publications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec public.result_publications;
BEGIN
  INSERT INTO public.result_publications (session_id, term_id, class_id, exam_type, status, notes, approved_at, approved_by, created_by)
  VALUES (_session_id, _term_id, _class_id, COALESCE(_exam_type, 'combined'), 'approved'::public.result_pub_status, _notes, now(), auth.uid(), auth.uid())
  ON CONFLICT (session_id, term_id, class_id, exam_type)
  DO UPDATE SET
    status = 'approved'::public.result_pub_status,
    notes = COALESCE(EXCLUDED.notes, public.result_publications.notes),
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_rec;
  RETURN v_rec;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_results(
  _session_id uuid,
  _term_id uuid,
  _class_id uuid,
  _exam_type text DEFAULT 'combined',
  _notes text DEFAULT NULL
)
RETURNS public.result_publications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec public.result_publications;
BEGIN
  INSERT INTO public.result_publications (session_id, term_id, class_id, exam_type, status, notes, published_at, published_by, created_by)
  VALUES (_session_id, _term_id, _class_id, COALESCE(_exam_type, 'combined'), 'published'::public.result_pub_status, _notes, now(), auth.uid(), auth.uid())
  ON CONFLICT (session_id, term_id, class_id, exam_type)
  DO UPDATE SET
    status = 'published'::public.result_pub_status,
    notes = COALESCE(EXCLUDED.notes, public.result_publications.notes),
    published_at = now(),
    published_by = auth.uid(),
    updated_at = now()
  RETURNING * INTO v_rec;
  RETURN v_rec;
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_results(
  _session_id uuid,
  _term_id uuid,
  _class_id uuid,
  _exam_type text DEFAULT 'combined',
  _notes text DEFAULT NULL
)
RETURNS public.result_publications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec public.result_publications;
BEGIN
  UPDATE public.result_publications
  SET
    status = 'draft'::public.result_pub_status,
    notes = COALESCE(_notes, notes),
    unpublished_at = now(),
    unpublished_by = auth.uid(),
    updated_at = now()
  WHERE session_id = _session_id
    AND term_id = _term_id
    AND class_id = _class_id
    AND exam_type = COALESCE(_exam_type, 'combined')
  RETURNING * INTO v_rec;
  RETURN v_rec;
END;
$$;
