
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;

DROP POLICY IF EXISTS "Staff view all staff" ON public.staff;
CREATE POLICY "Staff view own record"
  ON public.staff FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid());

CREATE OR REPLACE VIEW public.staff_directory
WITH (security_invoker = true) AS
SELECT id, user_id, staff_no, full_name, position, department, email, phone, photo_url, branch_id, is_active
FROM public.staff
WHERE is_active = true;
GRANT SELECT ON public.staff_directory TO authenticated;

REVOKE EXECUTE ON FUNCTION public.advance_current_term() FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.advance_current_term() TO service_role;
CREATE OR REPLACE FUNCTION public.advance_current_term()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_session uuid;
  today date := CURRENT_DATE;
  target_term record;
  prev_current uuid;
  result jsonb;
  msg text;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NOT NULL AND NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'Only admins may advance the current term';
  END IF;

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
END $function$;

REVOKE EXECUTE ON FUNCTION public.claim_super_admin() FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.claim_super_admin() TO service_role;

DROP POLICY IF EXISTS "All view allocations" ON public.equipment_allocations;
CREATE POLICY "Staff view allocations"
  ON public.equipment_allocations FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR allocated_to = auth.uid());

DROP POLICY IF EXISTS "Authenticated upload library-files" ON storage.objects;
CREATE POLICY "Staff upload library-files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'library-files' AND public.is_staff(auth.uid()));
