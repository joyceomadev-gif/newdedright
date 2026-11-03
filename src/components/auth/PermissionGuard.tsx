import React from "react";
import { usePermissions, type PermissionAction } from "@/hooks/usePermissions";

interface PermissionGuardProps {
  module: string;
  submodule?: string;
  functionCode?: string;
  action?: PermissionAction;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({
  module,
  submodule,
  functionCode,
  action = "read",
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { canAccess, canAccessSubmodule, canExecuteFunction, isLoading } = usePermissions();

  if (isLoading) {
    return null;
  }

  let hasAccess = false;

  if (functionCode) {
    hasAccess = canExecuteFunction(module, functionCode, submodule);
  } else if (submodule) {
    hasAccess = canAccessSubmodule(module, submodule, action);
  } else {
    hasAccess = canAccess(module, action);
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
