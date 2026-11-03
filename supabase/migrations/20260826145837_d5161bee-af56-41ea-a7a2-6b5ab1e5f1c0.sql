-- Custom roles defined by administrators
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view custom roles" ON public.custom_roles;
CREATE POLICY "Authenticated can view custom roles"
  ON public.custom_roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage custom roles" ON public.custom_roles;
CREATE POLICY "Admins can manage custom roles"
  ON public.custom_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Per-role, per-module permission matrix
CREATE TABLE IF NOT EXISTS public.role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_slug text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module_slug)
);

CREATE INDEX IF NOT EXISTS idx_role_module_permissions_role ON public.role_module_permissions(role);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_module_permissions TO authenticated;
GRANT ALL ON public.role_module_permissions TO service_role;

ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view role permissions" ON public.role_module_permissions;
CREATE POLICY "Authenticated can view role permissions"
  ON public.role_module_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_module_permissions;
CREATE POLICY "Admins can manage role permissions"
  ON public.role_module_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_custom_roles_updated_at ON public.custom_roles;
CREATE TRIGGER trg_custom_roles_updated_at
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_role_module_permissions_updated_at ON public.role_module_permissions;
CREATE TRIGGER trg_role_module_permissions_updated_at
  BEFORE UPDATE ON public.role_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve effective module permissions for a user (union across their roles)
CREATE OR REPLACE FUNCTION public.get_user_module_permissions(_user_id uuid)
RETURNS TABLE (
  module_slug text,
  can_read boolean,
  can_write boolean,
  can_edit boolean,
  can_delete boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.module_slug,
    bool_or(p.can_read)   AS can_read,
    bool_or(p.can_write)  AS can_write,
    bool_or(p.can_edit)   AS can_edit,
    bool_or(p.can_delete) AS can_delete
  FROM public.role_module_permissions p
  JOIN public.user_roles ur
    ON ur.role::text = p.role
  WHERE ur.user_id = _user_id
  GROUP BY p.module_slug;
$$;

REVOKE ALL ON FUNCTION public.get_user_module_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_module_permissions(uuid) TO authenticated;