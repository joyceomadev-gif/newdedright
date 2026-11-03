
-- 1. promotion_recommendations
DO $$ BEGIN
  CREATE TYPE public.promotion_recommendation AS ENUM ('pass','repeat','graduate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.promotion_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  session_id uuid NOT NULL,
  from_class_id uuid,
  recommendation public.promotion_recommendation NOT NULL,
  note text,
  recommended_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_prom_rec_session ON public.promotion_recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_prom_rec_class ON public.promotion_recommendations(from_class_id);

ALTER TABLE public.promotion_recommendations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_class_teacher_of_student(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students st
    JOIN public.classes c ON c.id = st.class_id
    JOIN public.staff s ON s.id = c.class_teacher_id
    WHERE st.id = _student_id AND s.user_id = _user_id
  )
$$;

CREATE POLICY "Staff view recommendations" ON public.promotion_recommendations
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR student_id IN (SELECT s.id FROM public.students s JOIN public.parents p ON s.parent_id=p.id WHERE p.user_id=auth.uid())
  );

CREATE POLICY "Admin manage recommendations" ON public.promotion_recommendations
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Class teacher insert recommendations" ON public.promotion_recommendations
  FOR INSERT TO authenticated WITH CHECK (
    public.is_class_teacher_of_student(auth.uid(), student_id)
    AND recommended_by = auth.uid()
  );

CREATE POLICY "Class teacher update own recommendations" ON public.promotion_recommendations
  FOR UPDATE TO authenticated
  USING (public.is_class_teacher_of_student(auth.uid(), student_id))
  WITH CHECK (public.is_class_teacher_of_student(auth.uid(), student_id));

CREATE TRIGGER trg_prom_rec_updated_at
  BEFORE UPDATE ON public.promotion_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. notify parents on promotion insert
CREATE OR REPLACE FUNCTION public.notify_parents_on_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_uid uuid;
  student_name text;
  to_class_name text;
  status_text text;
BEGIN
  SELECT p.user_id, st.full_name
    INTO parent_uid, student_name
  FROM public.students st
  LEFT JOIN public.parents p ON p.id = st.parent_id
  WHERE st.id = NEW.student_id;

  IF parent_uid IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO to_class_name FROM public.classes WHERE id = NEW.to_class_id;
  status_text := COALESCE(NEW.status::text, 'updated');

  INSERT INTO public.notifications (recipient_user_id, channel, status, subject, body, related_id, related_type)
  VALUES (
    parent_uid,
    'in_app',
    'sent',
    'Promotion update: ' || COALESCE(student_name, 'your child'),
    CASE
      WHEN status_text = 'graduated' THEN COALESCE(student_name,'Your child') || ' has been marked graduated.'
      WHEN to_class_name IS NOT NULL THEN COALESCE(student_name,'Your child') || ' has been ' || status_text || ' to ' || to_class_name || '.'
      ELSE COALESCE(student_name,'Your child') || ' promotion status: ' || status_text || '.'
    END,
    NEW.id,
    'promotion'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_parents_on_promotion ON public.promotion;
CREATE TRIGGER trg_notify_parents_on_promotion
  AFTER INSERT ON public.promotion
  FOR EACH ROW EXECUTE FUNCTION public.notify_parents_on_promotion();

-- 3. advance_current_term helper
CREATE OR REPLACE FUNCTION public.advance_current_term()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur_session uuid;
  today date := CURRENT_DATE;
  target_term record;
  prev_current uuid;
BEGIN
  SELECT id INTO cur_session FROM public.sessions WHERE is_current = true LIMIT 1;
  IF cur_session IS NULL THEN
    RETURN jsonb_build_object('changed', false, 'reason', 'no current session');
  END IF;

  SELECT id, name INTO target_term
  FROM public.terms
  WHERE session_id = cur_session
    AND start_date <= today
    AND end_date   >= today
  ORDER BY start_date DESC
  LIMIT 1;

  IF target_term.id IS NULL THEN
    RETURN jsonb_build_object('changed', false, 'reason', 'no term covers today');
  END IF;

  SELECT id INTO prev_current FROM public.terms WHERE is_current = true LIMIT 1;
  IF prev_current = target_term.id THEN
    RETURN jsonb_build_object('changed', false, 'current_term_id', target_term.id);
  END IF;

  UPDATE public.terms SET is_current = false WHERE is_current = true;
  UPDATE public.terms SET is_current = true WHERE id = target_term.id;

  RETURN jsonb_build_object('changed', true, 'current_term_id', target_term.id, 'name', target_term.name);
END $$;

REVOKE ALL ON FUNCTION public.advance_current_term() FROM public;
GRANT EXECUTE ON FUNCTION public.advance_current_term() TO authenticated, service_role;
