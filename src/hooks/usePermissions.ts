import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { MODULES } from "@/lib/modules";

export interface PermissionFlag {
  canRead: boolean;
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export type PermissionAction = "read" | "write" | "edit" | "delete";

export interface UserEffectivePermissions {
  is_super_admin?: boolean;
  modules?: Array<{
    module_slug: string;
    can_read: boolean;
    can_write: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
  submodules?: Array<{
    module_slug: string;
    submodule_slug: string;
    can_read: boolean;
    can_write: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
  functions?: Array<{
    module_slug: string;
    function_code: string;
    is_allowed: boolean;
  }>;
}

export function usePermissions() {
  const { user, roles, isAdmin } = useAuth();

  const { data: effectivePermissions, isLoading } = useQuery({
    queryKey: ["user-effective-permissions", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<UserEffectivePermissions> => {
      // Try calling new get_user_effective_permissions RPC
      const { data, error } = await supabase.rpc("get_user_effective_permissions", {
        _user_id: user!.id,
      });

      if (!error && data) {
        return data as unknown as UserEffectivePermissions;
      }

      // Fallback to legacy get_user_module_permissions RPC if new RPC is not yet applied
      const { data: legacyData } = await supabase.rpc("get_user_module_permissions", {
        _user_id: user!.id,
      });

      return {
        is_super_admin: isAdmin,
        modules: (legacyData || []) as any,
        submodules: [],
        functions: [],
      };
    },
  });

  // 1. Module Permission Map
  const permissionMap = useMemo(() => {
    const map: Record<string, PermissionFlag> = {};

    // Static fallback from MODULES array
    MODULES.forEach((m) => {
      const hasStaticRole = roles.length === 0 ? m.slug === "dashboard" : m.roles.some((r) => roles.includes(r));
      map[m.slug] = {
        canRead: isAdmin || hasStaticRole,
        canWrite: isAdmin || (hasStaticRole && !["student" as AppRole, "parent" as AppRole].some((r) => roles.includes(r))),
        canEdit: isAdmin || (hasStaticRole && !["student" as AppRole, "parent" as AppRole].some((r) => roles.includes(r))),
        canDelete: isAdmin,
      };
    });

    // DB overrides for Modules
    (effectivePermissions?.modules || []).forEach((p) => {
      if (p.module_slug) {
        map[p.module_slug] = {
          canRead: isAdmin ? true : Boolean(p.can_read),
          canWrite: isAdmin ? true : Boolean(p.can_write),
          canEdit: isAdmin ? true : Boolean(p.can_edit),
          canDelete: isAdmin ? true : Boolean(p.can_delete),
        };
      }
    });

    return map;
  }, [effectivePermissions, roles, isAdmin]);

  // 2. Submodule Permission Map (key: "moduleSlug:submoduleSlug")
  const submodulePermissionMap = useMemo(() => {
    const map: Record<string, PermissionFlag> = {};

    (effectivePermissions?.submodules || []).forEach((s) => {
      const key = `${s.module_slug}:${s.submodule_slug}`;
      map[key] = {
        canRead: isAdmin ? true : Boolean(s.can_read),
        canWrite: isAdmin ? true : Boolean(s.can_write),
        canEdit: isAdmin ? true : Boolean(s.can_edit),
        canDelete: isAdmin ? true : Boolean(s.can_delete),
      };
    });

    return map;
  }, [effectivePermissions, isAdmin]);

  // 3. Function Permission Map (key: "moduleSlug:functionCode")
  const functionPermissionMap = useMemo(() => {
    const map: Record<string, boolean> = {};

    (effectivePermissions?.functions || []).forEach((f) => {
      const key = `${f.module_slug}:${f.function_code}`;
      map[key] = isAdmin ? true : Boolean(f.is_allowed);
    });

    return map;
  }, [effectivePermissions, isAdmin]);

  function getModulePermission(moduleSlug: string): PermissionFlag {
    if (isAdmin) {
      return { canRead: true, canWrite: true, canEdit: true, canDelete: true };
    }
    return permissionMap[moduleSlug] || { canRead: false, canWrite: false, canEdit: false, canDelete: false };
  }

  function canAccess(moduleSlug: string, action: PermissionAction = "read"): boolean {
    const perm = getModulePermission(moduleSlug);
    switch (action) {
      case "read": return perm.canRead;
      case "write": return perm.canWrite;
      case "edit": return perm.canEdit;
      case "delete": return perm.canDelete;
      default: return perm.canRead;
    }
  }

  function canAccessSubmodule(moduleSlug: string, submoduleSlug: string, action: PermissionAction = "read"): boolean {
    if (isAdmin) return true;

    // Rule 1: Must have Read access at Parent Module level first
    if (!canAccess(moduleSlug, "read")) return false;

    // Rule 2: Check explicit Submodule override
    const key = `${moduleSlug}:${submoduleSlug}`;
    const subPerm = submodulePermissionMap[key];

    if (subPerm) {
      switch (action) {
        case "read": return subPerm.canRead;
        case "write": return subPerm.canWrite;
        case "edit": return subPerm.canEdit;
        case "delete": return subPerm.canDelete;
        default: return subPerm.canRead;
      }
    }

    // Rule 3: Fall back to Parent Module action permission
    return canAccess(moduleSlug, action);
  }

  function canExecuteFunction(moduleSlug: string, functionCode: string, submoduleSlug?: string): boolean {
    if (isAdmin) return true;

    // Rule 1: Must have Read access at Parent Module level
    if (!canAccess(moduleSlug, "read")) return false;

    // Rule 2: If submodule specified, must have access to submodule
    if (submoduleSlug && !canAccessSubmodule(moduleSlug, submoduleSlug, "read")) return false;

    // Rule 3: Check explicit Function override
    const key = `${moduleSlug}:${functionCode}`;
    if (functionPermissionMap[key] !== undefined) {
      return functionPermissionMap[key];
    }

    // Rule 4: Fall back to Write permission on parent module/submodule
    return submoduleSlug ? canAccessSubmodule(moduleSlug, submoduleSlug, "write") : canAccess(moduleSlug, "write");
  }

  async function checkServerFunctionPermission(moduleSlug: string, functionCode: string): Promise<boolean> {
    if (!user?.id) return false;
    if (isAdmin) return true;
    const { data, error } = await supabase.rpc("check_user_function_permission", {
      _user_id: user.id,
      _module_slug: moduleSlug,
      _function_code: functionCode,
    });
    if (error) {
      console.warn("check_user_function_permission RPC call failed:", error.message);
      return canExecuteFunction(moduleSlug, functionCode);
    }
    return Boolean(data);
  }

  return {
    permissionMap,
    getModulePermission,
    canAccess,
    canAccessSubmodule,
    canExecuteFunction,
    checkServerFunctionPermission,
    isLoading,
  };
}
