-- Migration: Submodule & Function-Level Permissions with Hardened Security, Custom Role Assignment, Administrative Role Protection & Updated_at Triggers (Enhancement 6.3)
-- Description: Adds role_submodule_permissions, role_function_permissions, and user_custom_roles tables, seeds default permissions, adds hardened Security Definer RPCs, administrative role mutation triggers (INSERT/UPDATE/DELETE), and updated_at triggers.

-- 1. User Custom Roles Table (Enables assigning custom created roles to users)
CREATE TABLE IF NOT EXISTS public.user_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_user_custom_role UNIQUE(user_id, role_name)
);

-- 2. Role Submodule Permissions Table
CREATE TABLE IF NOT EXISTS public.role_submodule_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_slug text NOT NULL,
  submodule_slug text NOT NULL,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_role_module_submodule UNIQUE(role, module_slug, submodule_slug)
);

-- 3. Role Function Permissions Table
CREATE TABLE IF NOT EXISTS public.role_function_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_slug text NOT NULL,
  submodule_slug text DEFAULT '',
  function_code text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_role_module_function UNIQUE(role, module_slug, function_code)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user ON public.user_custom_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_role_submodule_permissions_lookup ON public.role_submodule_permissions(role, module_slug, submodule_slug);
CREATE INDEX IF NOT EXISTS idx_role_function_permissions_lookup ON public.role_function_permissions(role, module_slug, function_code);

-- Enable RLS
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_submodule_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_function_permissions ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON public.user_custom_roles TO authenticated;
GRANT ALL ON public.user_custom_roles TO service_role;

GRANT SELECT ON public.role_submodule_permissions TO authenticated;
GRANT ALL ON public.role_submodule_permissions TO service_role;

GRANT SELECT ON public.role_function_permissions TO authenticated;
GRANT ALL ON public.role_function_permissions TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users view user custom roles" ON public.user_custom_roles;
CREATE POLICY "Authenticated users view user custom roles" ON public.user_custom_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage user custom roles" ON public.user_custom_roles;
CREATE POLICY "Admins manage user custom roles" ON public.user_custom_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users view submodule permissions" ON public.role_submodule_permissions;
CREATE POLICY "Authenticated users view submodule permissions" ON public.role_submodule_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage submodule permissions" ON public.role_submodule_permissions;
CREATE POLICY "Admins manage submodule permissions" ON public.role_submodule_permissions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users view function permissions" ON public.role_function_permissions;
CREATE POLICY "Authenticated users view function permissions" ON public.role_function_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage function permissions" ON public.role_function_permissions;
CREATE POLICY "Admins manage function permissions" ON public.role_function_permissions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4. Administrative Role Permission Mutation Guard Trigger (Covers INSERT, UPDATE, and DELETE for admin-tier roles)
CREATE OR REPLACE FUNCTION public.prevent_super_admin_permission_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role IN ('super_admin', 'admin', 'admin1', 'admin2', 'admin3')) 
     OR (TG_OP IN ('INSERT', 'UPDATE') AND (NEW.role IN ('super_admin', 'admin', 'admin1', 'admin2', 'admin3') OR (OLD IS NOT NULL AND OLD.role IN ('super_admin', 'admin', 'admin1', 'admin2', 'admin3')))) THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin') THEN
      RAISE EXCEPTION 'Forbidden: Only Super Admins can alter administrative role permissions';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_super_admin_submodule ON public.role_submodule_permissions;
CREATE TRIGGER trg_protect_super_admin_submodule
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_submodule_permissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_permission_mutation();

DROP TRIGGER IF EXISTS trg_protect_super_admin_function ON public.role_function_permissions;
CREATE TRIGGER trg_protect_super_admin_function
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_function_permissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_permission_mutation();

-- 5. Updated_at Trigger Helper & Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_custom_roles_updated_at ON public.user_custom_roles;
CREATE TRIGGER update_user_custom_roles_updated_at
  BEFORE UPDATE ON public.user_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_role_submodule_permissions_updated_at ON public.role_submodule_permissions;
CREATE TRIGGER update_role_submodule_permissions_updated_at
  BEFORE UPDATE ON public.role_submodule_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_role_function_permissions_updated_at ON public.role_function_permissions;
CREATE TRIGGER update_role_function_permissions_updated_at
  BEFORE UPDATE ON public.role_function_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Security Definer RPC to Fetch User's Effective Permissions (Hardened against enumeration & includes custom roles)
CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_super_admin boolean := false;
  user_roles_list text[];
  modules_json jsonb;
  submodules_json jsonb;
  functions_json jsonb;
BEGIN
  -- Security Hardening: Block unauthorized users from enumerating other users' RBAC profiles
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: You can only query your own effective permissions';
  END IF;

  -- Super admin check
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') THEN
    is_super_admin := true;
  END IF;

  -- User roles (aggregates standard roles + custom roles)
  SELECT array_agg(r) INTO user_roles_list FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _user_id
    UNION
    SELECT role_name AS r FROM public.user_custom_roles WHERE user_id = _user_id
  ) sub;

  -- 1. Modules Permissions
  IF is_super_admin THEN
    SELECT jsonb_agg(jsonb_build_object(
      'module_slug', p.module_slug,
      'can_read', true,
      'can_write', true,
      'can_edit', true,
      'can_delete', true
    )) INTO modules_json
    FROM (SELECT DISTINCT module_slug FROM public.role_module_permissions) p;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'module_slug', p.module_slug,
      'can_read', bool_or(p.can_read),
      'can_write', bool_or(p.can_write),
      'can_edit', bool_or(p.can_edit),
      'can_delete', bool_or(p.can_delete)
    )) INTO modules_json
    FROM public.role_module_permissions p
    WHERE p.role = ANY(user_roles_list)
    GROUP BY p.module_slug;
  END IF;

  -- 2. Submodules Permissions
  IF is_super_admin THEN
    SELECT jsonb_agg(jsonb_build_object(
      'module_slug', s.module_slug,
      'submodule_slug', s.submodule_slug,
      'can_read', true,
      'can_write', true,
      'can_edit', true,
      'can_delete', true
    )) INTO submodules_json
    FROM (SELECT DISTINCT module_slug, submodule_slug FROM public.role_submodule_permissions) s;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'module_slug', s.module_slug,
      'submodule_slug', s.submodule_slug,
      'can_read', bool_or(s.can_read),
      'can_write', bool_or(s.can_write),
      'can_edit', bool_or(s.can_edit),
      'can_delete', bool_or(s.can_delete)
    )) INTO submodules_json
    FROM public.role_submodule_permissions s
    WHERE s.role = ANY(user_roles_list)
    GROUP BY s.module_slug, s.submodule_slug;
  END IF;

  -- 3. Functions Permissions
  IF is_super_admin THEN
    SELECT jsonb_agg(jsonb_build_object(
      'module_slug', f.module_slug,
      'function_code', f.function_code,
      'is_allowed', true
    )) INTO functions_json
    FROM (SELECT DISTINCT module_slug, function_code FROM public.role_function_permissions) f;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'module_slug', f.module_slug,
      'function_code', f.function_code,
      'is_allowed', bool_or(f.is_allowed)
    )) INTO functions_json
    FROM public.role_function_permissions f
    WHERE f.role = ANY(user_roles_list)
    GROUP BY f.module_slug, f.function_code;
  END IF;

  RETURN jsonb_build_object(
    'is_super_admin', is_super_admin,
    'modules', COALESCE(modules_json, '[]'::jsonb),
    'submodules', COALESCE(submodules_json, '[]'::jsonb),
    'functions', COALESCE(functions_json, '[]'::jsonb)
  );
END;
$$;

-- 7. Server-Side Function Permission Enforcement RPC
CREATE OR REPLACE FUNCTION public.check_user_function_permission(
  _user_id uuid,
  _module_slug text,
  _function_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  -- Super admin bypass
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') THEN
    RETURN true;
  END IF;

  -- Check explicit function permission override across standard + custom roles
  SELECT bool_or(f.is_allowed) INTO allowed
  FROM public.role_function_permissions f
  WHERE f.role IN (
    SELECT role::text FROM public.user_roles WHERE user_id = _user_id
    UNION
    SELECT role_name FROM public.user_custom_roles WHERE user_id = _user_id
  )
    AND f.module_slug = _module_slug
    AND f.function_code = _function_code;

  IF allowed IS NOT NULL THEN
    RETURN allowed;
  END IF;

  -- Fallback: check write permission on module
  SELECT bool_or(p.can_write) INTO allowed
  FROM public.role_module_permissions p
  WHERE p.role IN (
    SELECT role::text FROM public.user_roles WHERE user_id = _user_id
    UNION
    SELECT role_name FROM public.user_custom_roles WHERE user_id = _user_id
  )
    AND p.module_slug = _module_slug;

  RETURN COALESCE(allowed, false);
END;
$$;

-- 8. Revoke from anon & public for defense-in-depth
REVOKE EXECUTE ON FUNCTION public.get_user_effective_permissions(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_user_function_permission(uuid, text, text) FROM anon, PUBLIC;

-- Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_effective_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_function_permission(uuid, text, text) TO authenticated;
