
-- Update is_admin to include all admin tiers
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin','admin1','admin2','admin3')
  )
$$;

-- Update is_staff to include head_of_section + admin tiers
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin','admin1','admin2','admin3','head_of_section','teacher')
  )
$$;

-- New: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Grant EXECUTE on admin RPCs (functions already check is_admin internally)
GRANT EXECUTE ON FUNCTION public.advance_current_term() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_with_terms(text, date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_session(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_session_dry_run(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction(uuid, text, numeric, text, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- Add state_of_origin + lga to parents and staff
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS state_of_origin text,
  ADD COLUMN IF NOT EXISTS lga text;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS state_of_origin text,
  ADD COLUMN IF NOT EXISTS lga text;

-- Assign super_admin to joyceomade@gmail.com / joyceomadev@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::app_role
FROM auth.users u
WHERE lower(u.email) IN ('joyceomade@gmail.com','joyceomadev@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;
