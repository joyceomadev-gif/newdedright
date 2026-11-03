-- Brings the new database in line with the old Lovable Cloud database.
-- These objects existed in the old live database but were never saved as migration files.
-- Written from the old database's own catalog. Safe to re-run (IF NOT EXISTS / guarded blocks).

-- 1. Enum used by equipment.item_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'lab_item_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.lab_item_type AS ENUM ('apparatus', 'equipment', 'chemical');
  END IF;
END
$$;

-- 2. Missing tables
CREATE TABLE IF NOT EXISTS public.permissions (
  code text PRIMARY KEY,
  module text NOT NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_code)
);

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_code)
);

CREATE TABLE IF NOT EXISTS public.result_publication_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid REFERENCES public.result_publications(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  term_id uuid NOT NULL,
  class_id uuid NOT NULL,
  exam_type text NOT NULL,
  action text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Missing columns on existing tables
ALTER TABLE public.custom_roles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS item_type public.lab_item_type NOT NULL DEFAULT 'apparatus';
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS hazard_class text;
ALTER TABLE public.equipment ADD COLUMN IF NOT EXISTS expiry_date date;

ALTER TABLE public.processed_results ADD COLUMN IF NOT EXISTS processed_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.processed_results ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.processed_results ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.result_processing_runs ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE;
ALTER TABLE public.result_processing_runs ADD COLUMN IF NOT EXISTS warnings jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.result_processing_runs ADD COLUMN IF NOT EXISTS errors jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.result_processing_runs ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Make column rules match the old database
UPDATE public.custom_roles SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.custom_roles ALTER COLUMN created_at SET NOT NULL;

UPDATE public.role_function_permissions SET created_at = now() WHERE created_at IS NULL;
UPDATE public.role_function_permissions SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.role_function_permissions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.role_function_permissions ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.role_module_permissions SET created_at = now() WHERE created_at IS NULL;
UPDATE public.role_module_permissions SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.role_module_permissions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.role_module_permissions ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.role_submodule_permissions SET created_at = now() WHERE created_at IS NULL;
UPDATE public.role_submodule_permissions SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.role_submodule_permissions ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.role_submodule_permissions ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.exam_review_history ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.processed_results ALTER COLUMN total_score SET NOT NULL;

-- 5. Uniqueness rule used by processed_results
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'processed_results_unique' AND conrelid = 'public.processed_results'::regclass
  ) THEN
    ALTER TABLE public.processed_results
      ADD CONSTRAINT processed_results_unique
      UNIQUE (session_id, term_id, class_id, subject_id, student_id, exam_type);
  END IF;
END
$$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS equipment_deleted_at_idx ON public.equipment USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_equipment_academic_session_id ON public.equipment USING btree (academic_session_id);
CREATE INDEX IF NOT EXISTS idx_equipment_item_type ON public.equipment USING btree (item_type);
CREATE INDEX IF NOT EXISTS idx_equipment_lab ON public.equipment USING btree (lab_id);
CREATE INDEX IF NOT EXISTS idx_processed_results_lookup ON public.processed_results USING btree (session_id, term_id, class_id, exam_type);
CREATE INDEX IF NOT EXISTS idx_processed_results_scope ON public.processed_results USING btree (session_id, term_id, class_id, exam_type);
CREATE INDEX IF NOT EXISTS idx_processed_results_student ON public.processed_results USING btree (student_id);
CREATE INDEX IF NOT EXISTS idx_result_proc_runs_lookup ON public.result_processing_runs USING btree (session_id, term_id, class_id, exam_type);
CREATE INDEX IF NOT EXISTS idx_result_runs_lookup ON public.result_processing_runs USING btree (session_id, term_id, class_id, exam_type, created_at DESC);

-- 7. Functions (exact definitions from the old database)
CREATE OR REPLACE FUNCTION public.canonical_role(_role text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'admin'           THEN 'school_admin'
    WHEN 'admin1'          THEN 'school_admin'
    WHEN 'admin2'          THEN 'principal'
    WHEN 'admin3'          THEN 'vice_principal_academic'
    WHEN 'head_of_section' THEN 'hod'
    ELSE _role
  END
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(
      (SELECT granted FROM public.user_permission_overrides
        WHERE user_id = _user_id AND permission_code = _code),
      EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role = ur.role::text
        WHERE ur.user_id = _user_id AND rp.permission_code = _code
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.my_permissions()
 RETURNS TABLE(permission_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH role_grants AS (
    SELECT DISTINCT rp.permission_code
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = auth.uid()
  ),
  overrides AS (
    SELECT permission_code, granted
    FROM public.user_permission_overrides
    WHERE user_id = auth.uid()
  )
  SELECT p.code
  FROM public.permissions p
  WHERE
    (p.code IN (SELECT permission_code FROM role_grants)
     AND NOT EXISTS (SELECT 1 FROM overrides o WHERE o.permission_code = p.code AND o.granted = false))
    OR EXISTS (SELECT 1 FROM overrides o WHERE o.permission_code = p.code AND o.granted = true);
$function$;

-- 8. Triggers
DROP TRIGGER IF EXISTS trg_custom_roles_updated_at ON public.custom_roles;
CREATE TRIGGER trg_custom_roles_updated_at BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_equipment_updated ON public.equipment;
CREATE TRIGGER trg_equipment_updated BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_processed_results_updated_at ON public.processed_results;
CREATE TRIGGER trg_processed_results_updated_at BEFORE UPDATE ON public.processed_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_permission_overrides_updated_at ON public.user_permission_overrides;
CREATE TRIGGER trg_user_permission_overrides_updated_at BEFORE UPDATE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. Row level security and policies (the old database's current, tightened versions)
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_publication_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permissions readable by authenticated" ON public.permissions;
CREATE POLICY "permissions readable by authenticated" ON public.permissions
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "role_permissions manageable by admins" ON public.role_permissions;
CREATE POLICY "role_permissions manageable by admins" ON public.role_permissions
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "role_permissions readable by authenticated" ON public.role_permissions;
CREATE POLICY "role_permissions readable by authenticated" ON public.role_permissions
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins manage overrides" ON public.user_permission_overrides;
CREATE POLICY "admins manage overrides" ON public.user_permission_overrides
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "own overrides readable" ON public.user_permission_overrides;
CREATE POLICY "own overrides readable" ON public.user_permission_overrides
  FOR SELECT TO authenticated USING ((auth.uid() = user_id) OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "result_pub_audit_insert" ON public.result_publication_audit;
CREATE POLICY "result_pub_audit_insert" ON public.result_publication_audit
  FOR INSERT TO authenticated WITH CHECK (can_approve_results(auth.uid()));

DROP POLICY IF EXISTS "result_pub_audit_staff_read" ON public.result_publication_audit;
CREATE POLICY "result_pub_audit_staff_read" ON public.result_publication_audit
  FOR SELECT TO authenticated USING (is_staff(auth.uid()) OR is_admin(auth.uid()));

-- 10. Privileges: no anonymous access to the new tables or to the permission-checking functions
REVOKE ALL ON public.permissions, public.role_permissions, public.user_permission_overrides, public.result_publication_audit FROM anon;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;

-- 11. subscription_plans: the old database had row level security with an authenticated-read policy.
--     The new database had row level security switched off and no policy on this table.
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view plans" ON public.subscription_plans;
CREATE POLICY "Authenticated view plans" ON public.subscription_plans
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);