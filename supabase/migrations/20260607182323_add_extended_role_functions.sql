-- Restore extended role functions after enum values commit in previous transaction.

CREATE OR REPLACE FUNCTION public.is_principal(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'principal'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_hod(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'hod'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'school_admin'::public.app_role);
$$;
