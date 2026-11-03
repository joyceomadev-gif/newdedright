import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, render, screen } from "@testing-library/react";
import { usePermissions } from "./usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import * as authContext from "@/lib/auth-context";

// Mock tanstack query synchronously
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      is_super_admin: false,
      modules: [
        { module_slug: "academics", can_read: true, can_write: true, can_edit: true, can_delete: false },
        { module_slug: "exams", can_read: true, can_write: false, can_edit: false, can_delete: false },
        { module_slug: "finance", can_read: false, can_write: false, can_edit: false, can_delete: false },
      ],
      submodules: [
        { module_slug: "academics", submodule_slug: "broadsheet", can_read: true, can_write: true, can_edit: true, can_delete: false },
        { module_slug: "exams", submodule_slug: "cbt-runner", can_read: true, can_write: true, can_edit: false, can_delete: false },
        { module_slug: "finance", submodule_slug: "fee-structures", can_read: true, can_write: true, can_edit: true, can_delete: true },
      ],
      functions: [
        { module_slug: "exams", function_code: "publish_exam", is_allowed: false },
        { module_slug: "academics", function_code: "edit_grading_scale", is_allowed: true },
      ],
    },
    isLoading: false,
  }),
}));

describe("Submodule & Function Level Permissions Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("inherits module permissions when no submodule override exists", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-1" } as any,
      roles: ["teacher"],
      isAdmin: false,
    } as any);

    const { result } = renderHook(() => usePermissions());
    expect(result.current.canAccess("academics", "read")).toBe(true);
    expect(result.current.canAccessSubmodule("academics", "curriculum-setup", "read")).toBe(true);
  });

  it("applies explicit submodule overrides when parent module is readable", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-1" } as any,
      roles: ["teacher"],
      isAdmin: false,
    } as any);

    const { result } = renderHook(() => usePermissions());
    // exams module write is false, but cbt-runner submodule write override is true
    expect(result.current.canAccess("exams", "write")).toBe(false);
    expect(result.current.canAccessSubmodule("exams", "cbt-runner", "write")).toBe(true);
  });

  it("blocks submodule access if parent module read permission is false", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-1" } as any,
      roles: ["teacher"],
      isAdmin: false,
    } as any);

    const { result } = renderHook(() => usePermissions());
    // finance module read is false, so submodule fee-structures is blocked even if submodule flag is true
    expect(result.current.canAccess("finance", "read")).toBe(false);
    expect(result.current.canAccessSubmodule("finance", "fee-structures", "read")).toBe(false);
  });

  it("evaluates explicit function allow/deny overrides without and with submodule qualification", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-1" } as any,
      roles: ["teacher"],
      isAdmin: false,
    } as any);

    const { result } = renderHook(() => usePermissions());
    // publish_exam is explicitly denied for exams module
    expect(result.current.canExecuteFunction("exams", "publish_exam")).toBe(false);
    expect(result.current.canExecuteFunction("exams", "publish_exam", "cbt-runner")).toBe(false);

    // edit_grading_scale is explicitly allowed for academics module
    expect(result.current.canExecuteFunction("academics", "edit_grading_scale")).toBe(true);
    expect(result.current.canExecuteFunction("academics", "edit_grading_scale", "broadsheet")).toBe(true);

    // function in blocked parent module is denied
    expect(result.current.canExecuteFunction("finance", "record_payment", "fee-structures")).toBe(false);
  });

  it("grants full access across modules, submodules, and functions for super_admin", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "admin-1" } as any,
      roles: ["super_admin"],
      isAdmin: true,
    } as any);

    const { result } = renderHook(() => usePermissions());
    expect(result.current.canAccess("finance", "read")).toBe(true);
    expect(result.current.canAccessSubmodule("finance", "fee-structures", "delete")).toBe(true);
    expect(result.current.canExecuteFunction("exams", "publish_exam")).toBe(true);
  });

  it("PermissionGuard renders children when permitted and renders fallback when denied", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-1" } as any,
      roles: ["teacher"],
      isAdmin: false,
    } as any);

    const { rerender } = render(
      <PermissionGuard module="academics" submodule="broadsheet" action="write" fallback={<div>Denied</div>}>
        <div>Allowed Content</div>
      </PermissionGuard>
    );

    expect(screen.getByText("Allowed Content")).toBeDefined();

    rerender(
      <PermissionGuard module="exams" functionCode="publish_exam" fallback={<div>Denied Access</div>}>
        <div>Publish Button</div>
      </PermissionGuard>
    );

    expect(screen.getByText("Denied Access")).toBeDefined();
  });

  it("checkServerFunctionPermission returns permission state from server RPC helper", async () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-1" } as any,
      roles: ["teacher"],
      isAdmin: false,
    } as any);

    const { result } = renderHook(() => usePermissions());
    const isAllowed = await result.current.checkServerFunctionPermission("academics", "edit_grading_scale");
    expect(typeof isAllowed).toBe("boolean");
  });
});
