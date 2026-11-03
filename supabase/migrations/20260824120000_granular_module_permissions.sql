-- Migration: Granular Module & Menu Permissions (Enhancement 6.2)
-- Description: Adds role_module_permissions and custom_roles tables, seed default permissions, and Security Definer RPCs for 4 permission levels (read, write, edit, delete).

-- 1. Custom Roles Table
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- 2. Role Module Permissions Table
CREATE TABLE IF NOT EXISTS public.role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_slug text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_role_module UNIQUE(role, module_slug)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_role_module_permissions_role ON public.role_module_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_module_permissions_slug ON public.role_module_permissions(module_slug);

-- Enable RLS
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;

GRANT SELECT ON public.role_module_permissions TO authenticated;
GRANT ALL ON public.role_module_permissions TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users view custom roles" ON public.custom_roles;
CREATE POLICY "Authenticated users view custom roles" ON public.custom_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage custom roles" ON public.custom_roles;
CREATE POLICY "Admins manage custom roles" ON public.custom_roles
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users view permissions" ON public.role_module_permissions;
CREATE POLICY "Authenticated users view permissions" ON public.role_module_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage permissions" ON public.role_module_permissions;
CREATE POLICY "Admins manage permissions" ON public.role_module_permissions
  FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 3. Seed Default Permissions
INSERT INTO public.role_module_permissions (role, module_slug, can_read, can_write, can_edit, can_delete) VALUES
-- Super Admin (Full access to all modules)
('super_admin', 'dashboard', true, true, true, true),
('super_admin', 'administration', true, true, true, true),
('super_admin', 'report-templates', true, true, true, true),
('super_admin', 'ai-key', true, true, true, true),
('super_admin', 'academics', true, true, true, true),
('super_admin', 'classes', true, true, true, true),
('super_admin', 'students', true, true, true, true),
('super_admin', 'parents', true, true, true, true),
('super_admin', 'staff', true, true, true, true),
('super_admin', 'finance', true, true, true, true),
('super_admin', 'payment-transactions', true, true, true, true),
('super_admin', 'exams', true, true, true, true),
('super_admin', 'broadsheet', true, true, true, true),
('super_admin', 'reports', true, true, true, true),
('super_admin', 'library', true, true, true, true),
('super_admin', 'health', true, true, true, true),
('super_admin', 'lab', true, true, true, true),
('super_admin', 'communication', true, true, true, true),
('super_admin', 'teacher', true, true, true, true),
('super_admin', 'parent', true, true, true, true),
('super_admin', 'student', true, true, true, true),
('super_admin', 'settings', true, true, true, true),

-- Admin (Full administrative access)
('admin', 'dashboard', true, true, true, true),
('admin', 'administration', true, true, true, true),
('admin', 'report-templates', true, true, true, true),
('admin', 'ai-key', true, true, true, true),
('admin', 'academics', true, true, true, true),
('admin', 'classes', true, true, true, true),
('admin', 'students', true, true, true, true),
('admin', 'parents', true, true, true, true),
('admin', 'staff', true, true, true, true),
('admin', 'finance', true, true, true, true),
('admin', 'payment-transactions', true, true, true, true),
('admin', 'exams', true, true, true, true),
('admin', 'broadsheet', true, true, true, true),
('admin', 'reports', true, true, true, true),
('admin', 'library', true, true, true, true),
('admin', 'health', true, true, true, true),
('admin', 'lab', true, true, true, true),
('admin', 'communication', true, true, true, true),
('admin', 'teacher', true, true, true, true),
('admin', 'parent', true, true, true, true),
('admin', 'student', true, true, true, true),
('admin', 'settings', true, true, true, true),

-- Head of Section (Read/Write/Edit academic & student management)
('head_of_section', 'dashboard', true, false, false, false),
('head_of_section', 'academics', true, true, true, false),
('head_of_section', 'classes', true, true, true, false),
('head_of_section', 'students', true, true, true, false),
('head_of_section', 'exams', true, true, true, false),
('head_of_section', 'broadsheet', true, true, true, false),
('head_of_section', 'reports', true, true, true, false),
('head_of_section', 'library', true, false, false, false),
('head_of_section', 'health', true, true, true, false),
('head_of_section', 'lab', true, true, true, false),
('head_of_section', 'communication', true, true, true, false),
('head_of_section', 'teacher', true, true, true, false),
('head_of_section', 'settings', true, false, false, false),

-- Teacher (Academic entry, CBT, student grades)
('teacher', 'dashboard', true, false, false, false),
('teacher', 'academics', true, true, true, false),
('teacher', 'classes', true, false, false, false),
('teacher', 'students', true, false, false, false),
('teacher', 'exams', true, true, true, false),
('teacher', 'broadsheet', true, true, true, false),
('teacher', 'reports', true, false, false, false),
('teacher', 'library', true, false, false, false),
('teacher', 'health', true, true, true, false),
('teacher', 'lab', true, true, true, false),
('teacher', 'communication', true, true, false, false),
('teacher', 'teacher', true, true, true, false),
('teacher', 'settings', true, false, false, false),

-- Student (Read student portal, cbt, library)
('student', 'dashboard', true, false, false, false),
('student', 'exams', true, true, false, false),
('student', 'library', true, false, false, false),
('student', 'lab', true, false, false, false),
('student', 'communication', true, true, false, false),
('student', 'student', true, false, false, false),
('student', 'settings', true, false, false, false),

-- Parent (Read parent portal, student performance)
('parent', 'dashboard', true, false, false, false),
('parent', 'library', true, false, false, false),
('parent', 'communication', true, true, false, false),
('parent', 'parent', true, false, false, false),
('parent', 'settings', true, false, false, false)
ON CONFLICT (role, module_slug) DO NOTHING;

-- 4. RPC Function to Fetch Permissions for User
CREATE OR REPLACE FUNCTION public.get_user_module_permissions(_user_id uuid)
RETURNS TABLE (
  module_slug text,
  can_read boolean,
  can_write boolean,
  can_edit boolean,
  can_delete boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super Admin check: If user has super_admin role, return full access across all registered modules
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') THEN
    RETURN QUERY
    SELECT
      p.module_slug,
      true AS can_read,
      true AS can_write,
      true AS can_edit,
      true AS can_delete
    FROM (SELECT DISTINCT p_in.module_slug FROM public.role_module_permissions p_in) p;
    RETURN;
  END IF;

  -- Otherwise aggregate permissions across user's assigned roles
  RETURN QUERY
  SELECT
    p.module_slug,
    bool_or(p.can_read) AS can_read,
    bool_or(p.can_write) AS can_write,
    bool_or(p.can_edit) AS can_edit,
    bool_or(p.can_delete) AS can_delete
  FROM public.role_module_permissions p
  JOIN public.user_roles ur ON ur.role = p.role
  WHERE ur.user_id = _user_id
  GROUP BY p.module_slug;
END;
$$;

-- 5. RPC Function to Check Specific Module & Action Permission
CREATE OR REPLACE FUNCTION public.check_user_module_permission(
  _user_id uuid,
  _module_slug text,
  _action text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_perm boolean := false;
BEGIN
  -- Super admin bypass
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin') THEN
    RETURN true;
  END IF;

  SELECT
    CASE lower(_action)
      WHEN 'read' THEN bool_or(p.can_read)
      WHEN 'write' THEN bool_or(p.can_write)
      WHEN 'edit' THEN bool_or(p.can_edit)
      WHEN 'delete' THEN bool_or(p.can_delete)
      ELSE bool_or(p.can_read)
    END INTO has_perm
  FROM public.role_module_permissions p
  JOIN public.user_roles ur ON ur.role = p.role
  WHERE ur.user_id = _user_id AND p.module_slug = _module_slug;

  RETURN COALESCE(has_perm, false);
END;
$$;

-- Grant EXECUTE on RPCs
GRANT EXECUTE ON FUNCTION public.get_user_module_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_module_permission(uuid, text, text) TO authenticated;
