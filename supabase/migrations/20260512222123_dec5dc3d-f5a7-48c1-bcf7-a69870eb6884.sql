-- ===== school_settings (singleton row, id=1) =====
CREATE TABLE IF NOT EXISTS public.school_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  grading_scale jsonb NOT NULL DEFAULT '[
    {"grade":"A","min":70,"max":100,"remark":"Excellent"},
    {"grade":"B","min":60,"max":69,"remark":"Very Good"},
    {"grade":"C","min":50,"max":59,"remark":"Good"},
    {"grade":"D","min":45,"max":49,"remark":"Pass"},
    {"grade":"E","min":40,"max":44,"remark":"Weak Pass"},
    {"grade":"F","min":0,"max":39,"remark":"Fail"}
  ]'::jsonb,
  promotion_min_average numeric NOT NULL DEFAULT 50,
  ca1_weight numeric NOT NULL DEFAULT 15,
  ca2_weight numeric NOT NULL DEFAULT 15,
  exam_weight numeric NOT NULL DEFAULT 70,
  school_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.school_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All view school_settings" ON public.school_settings;
CREATE POLICY "All view school_settings" ON public.school_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage school_settings" ON public.school_settings;
CREATE POLICY "Admin manage school_settings" ON public.school_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_school_settings_updated
  BEFORE UPDATE ON public.school_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== branches =====
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  address text,
  phone text,
  is_main boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All view branches" ON public.branches;
CREATE POLICY "All view branches" ON public.branches
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage branches" ON public.branches;
CREATE POLICY "Admin manage branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.classes  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.staff    ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- ===== create_session_with_terms =====
CREATE OR REPLACE FUNCTION public.create_session_with_terms(
  _name text,
  _start_date date,
  _end_date date,
  _make_current boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_session_id uuid;
  span integer;
  t1_end date; t2_start date; t2_end date; t3_start date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins may create sessions';
  END IF;
  IF _end_date <= _start_date THEN
    RAISE EXCEPTION 'End date must be after start date';
  END IF;

  IF _make_current THEN
    UPDATE public.sessions SET is_current = false WHERE is_current = true;
  END IF;

  INSERT INTO public.sessions (name, start_date, end_date, is_current)
  VALUES (_name, _start_date, _end_date, COALESCE(_make_current, false))
  RETURNING id INTO new_session_id;

  span := (_end_date - _start_date);
  t1_end   := _start_date + (span / 3);
  t2_start := t1_end + 1;
  t2_end   := _start_date + (2 * span / 3);
  t3_start := t2_end + 1;

  IF _make_current THEN
    UPDATE public.terms SET is_current = false WHERE is_current = true;
  END IF;

  INSERT INTO public.terms (session_id, name, start_date, end_date, is_current) VALUES
    (new_session_id, 'first',  _start_date, t1_end,   COALESCE(_make_current, false)),
    (new_session_id, 'second', t2_start,    t2_end,   false),
    (new_session_id, 'third',  t3_start,    _end_date, false);

  RETURN new_session_id;
END $$;

-- ===== rollover_session =====
-- _mappings: jsonb array of {from_class_id, to_class_id} to bulk-promote.
-- Students in from_class with status='active' move to to_class, and a promotion row is created.
CREATE OR REPLACE FUNCTION public.rollover_session(
  _from_session_id uuid,
  _to_session_id uuid,
  _mappings jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m jsonb;
  from_cls uuid; to_cls uuid;
  promoted_count integer := 0;
  affected integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins may run rollover';
  END IF;
  IF _from_session_id IS NULL OR _to_session_id IS NULL THEN
    RAISE EXCEPTION 'Both from and to session ids are required';
  END IF;
  IF _from_session_id = _to_session_id THEN
    RAISE EXCEPTION 'From and to sessions must differ';
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(_mappings, '[]'::jsonb))
  LOOP
    from_cls := (m->>'from_class_id')::uuid;
    to_cls   := NULLIF(m->>'to_class_id','')::uuid;

    INSERT INTO public.promotion (student_id, from_class_id, to_class_id, session_id, status, remark)
    SELECT s.id, from_cls, to_cls, _to_session_id,
           CASE WHEN to_cls IS NULL THEN 'graduated'::promotion_status ELSE 'promoted'::promotion_status END,
           'Bulk rollover'
    FROM public.students s
    WHERE s.class_id = from_cls AND s.status = 'active';

    GET DIAGNOSTICS affected = ROW_COUNT;
    promoted_count := promoted_count + affected;

    IF to_cls IS NULL THEN
      UPDATE public.students
        SET status = 'graduated', graduated_at = CURRENT_DATE, is_active = false
        WHERE class_id = from_cls AND status = 'active';
    ELSE
      UPDATE public.students
        SET class_id = to_cls
        WHERE class_id = from_cls AND status = 'active';
    END IF;
  END LOOP;

  -- Mark target session/term1 as current
  UPDATE public.sessions SET is_current = (id = _to_session_id);
  UPDATE public.terms    SET is_current = false;
  UPDATE public.terms    SET is_current = true
    WHERE session_id = _to_session_id AND name = 'first';

  RETURN promoted_count;
END $$;
