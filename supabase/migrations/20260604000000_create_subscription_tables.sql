-- Restore subscription schema that previously existed outside the
-- repository migration history.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    code text PRIMARY KEY,
    name text NOT NULL,
    monthly_price numeric NOT NULL DEFAULT 0,
    annual_price numeric NOT NULL DEFAULT 0,
    features text[] NOT NULL DEFAULT '{}'::text[],
    tier_rank integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_subscription (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code text NOT NULL
        REFERENCES public.subscription_plans(code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    billing_cycle text NOT NULL DEFAULT 'monthly',
    status text NOT NULL DEFAULT 'active',
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    license_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

CREATE OR REPLACE FUNCTION public.current_plan_code()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT plan_code FROM public.school_subscription ORDER BY created_at DESC LIMIT 1),
    'free'
  );
$$;

