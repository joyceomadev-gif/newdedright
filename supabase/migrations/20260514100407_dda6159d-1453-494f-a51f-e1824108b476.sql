
-- 1. Approval workflow on promotion_recommendations
DO $$ BEGIN
  CREATE TYPE public.recommendation_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.promotion_recommendations
  ADD COLUMN IF NOT EXISTS status public.recommendation_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- Block teachers from changing their own approval status; only admins can.
CREATE OR REPLACE FUNCTION public.guard_recommendation_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins may change recommendation status';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'pending'
     AND NOT public.is_admin(auth.uid()) THEN
    NEW.status := 'pending';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_rec_status ON public.promotion_recommendations;
CREATE TRIGGER trg_guard_rec_status
  BEFORE INSERT OR UPDATE ON public.promotion_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.guard_recommendation_status();

-- 2. system_jobs (cron run tracking)
CREATE TABLE IF NOT EXISTS public.system_jobs (
  job_name text PRIMARY KEY,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view system_jobs" ON public.system_jobs
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admin manage system_jobs" ON public.system_jobs
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  promotion_in_app boolean NOT NULL DEFAULT true,
  promotion_email  boolean NOT NULL DEFAULT false,
  promotion_sms    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own prefs" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Insert own prefs" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Update own prefs" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admin manage prefs" ON public.notification_preferences
  FOR ALL TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_notification_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Replace notify trigger to honor per-channel preferences
CREATE OR REPLACE FUNCTION public.notify_parents_on_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_uid uuid;
  student_name text;
  to_class_name text;
  status_text text;
  prefs public.notification_preferences%ROWTYPE;
  body_text text;
  subject_text text;
BEGIN
  SELECT p.user_id, st.full_name
    INTO parent_uid, student_name
  FROM public.students st
  LEFT JOIN public.parents p ON p.id = st.parent_id
  WHERE st.id = NEW.student_id;

  IF parent_uid IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO to_class_name FROM public.classes WHERE id = NEW.to_class_id;
  status_text := COALESCE(NEW.status::text, 'updated');
  subject_text := 'Promotion update: ' || COALESCE(student_name, 'your child');
  body_text := CASE
    WHEN status_text = 'graduated' THEN COALESCE(student_name,'Your child') || ' has been marked graduated.'
    WHEN to_class_name IS NOT NULL THEN COALESCE(student_name,'Your child') || ' has been ' || status_text || ' to ' || to_class_name || '.'
    ELSE COALESCE(student_name,'Your child') || ' promotion status: ' || status_text || '.'
  END;

  SELECT * INTO prefs FROM public.notification_preferences WHERE user_id = parent_uid;
  -- default = in-app only
  IF NOT FOUND THEN
    prefs.promotion_in_app := true;
    prefs.promotion_email  := false;
    prefs.promotion_sms    := false;
  END IF;

  IF prefs.promotion_in_app THEN
    INSERT INTO public.notifications (recipient_user_id, channel, status, subject, body, related_id, related_type)
    VALUES (parent_uid, 'in_app', 'sent', subject_text, body_text, NEW.id, 'promotion');
  END IF;
  IF prefs.promotion_email THEN
    INSERT INTO public.notifications (recipient_user_id, channel, status, subject, body, related_id, related_type)
    VALUES (parent_uid, 'email', 'queued', subject_text, body_text, NEW.id, 'promotion');
  END IF;
  IF prefs.promotion_sms THEN
    INSERT INTO public.notifications (recipient_user_id, channel, status, subject, body, related_id, related_type)
    VALUES (parent_uid, 'sms', 'queued', subject_text, body_text, NEW.id, 'promotion');
  END IF;
  RETURN NEW;
END $$;

-- 5. advance_current_term: log to system_jobs every call
CREATE OR REPLACE FUNCTION public.advance_current_term()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur_session uuid;
  today date := CURRENT_DATE;
  target_term record;
  prev_current uuid;
  result jsonb;
  msg text;
BEGIN
  SELECT id INTO cur_session FROM public.sessions WHERE is_current = true LIMIT 1;
  IF cur_session IS NULL THEN
    result := jsonb_build_object('changed', false, 'reason', 'no current session');
    msg := 'no current session';
  ELSE
    SELECT id, name INTO target_term FROM public.terms
    WHERE session_id = cur_session AND start_date <= today AND end_date >= today
    ORDER BY start_date DESC LIMIT 1;

    IF target_term.id IS NULL THEN
      result := jsonb_build_object('changed', false, 'reason', 'no term covers today');
      msg := 'no term covers today';
    ELSE
      SELECT id INTO prev_current FROM public.terms WHERE is_current = true LIMIT 1;
      IF prev_current = target_term.id THEN
        result := jsonb_build_object('changed', false, 'current_term_id', target_term.id);
        msg := 'already on current term';
      ELSE
        UPDATE public.terms SET is_current = false WHERE is_current = true;
        UPDATE public.terms SET is_current = true WHERE id = target_term.id;
        result := jsonb_build_object('changed', true, 'current_term_id', target_term.id, 'name', target_term.name);
        msg := 'advanced to ' || target_term.name;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.system_jobs (job_name, last_run_at, last_status, last_message, updated_at)
  VALUES ('advance_current_term', now(), 'success', msg, now())
  ON CONFLICT (job_name) DO UPDATE
    SET last_run_at = EXCLUDED.last_run_at,
        last_status = EXCLUDED.last_status,
        last_message = EXCLUDED.last_message,
        updated_at = now();

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.advance_current_term() FROM public;
GRANT EXECUTE ON FUNCTION public.advance_current_term() TO authenticated, service_role;
