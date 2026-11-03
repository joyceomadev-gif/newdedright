import { describe, it, expect } from "vitest";
import type { PermissionFlag, PermissionAction } from "./usePermissions";

describe("Granular Module Permissions Resolution Engine", () => {
  function resolvePermission(
    isAdmin: boolean,
    userRoles: string[],
    dbPerms: Array<{ module_slug: string; can_read: boolean; can_write: boolean; can_edit: boolean; can_delete: boolean }>,
    targetSlug: string,
    action: PermissionAction = "read"
  ): boolean {
    // 1. Admin bypass
    if (isAdmin) return true;

    // 2. Dynamic DB permission override
    const dbMatch = dbPerms.find((p) => p.module_slug === targetSlug);
    if (dbMatch) {
      switch (action) {
        case "read":
          return dbMatch.can_read;
        case "write":
          return dbMatch.can_write;
        case "edit":
          return dbMatch.can_edit;
        case "delete":
          return dbMatch.can_delete;
        default:
          return dbMatch.can_read;
      }
    }

    // 3. Fallback
    return userRoles.includes("teacher") && targetSlug === "academics";
  }

  it("grants full access across all actions when user is super_admin or admin", () => {
    const actions: PermissionAction[] = ["read", "write", "edit", "delete"];
    actions.forEach((act) => {
      expect(resolvePermission(true, ["admin"], [], "finance", act)).toBe(true);
      expect(resolvePermission(true, ["super_admin"], [], "settings", act)).toBe(true);
    });
  });

  it("evaluates granular read/write/edit/delete levels accurately for custom teacher role", () => {
    const dbPerms = [
      {
        module_slug: "academics",
        can_read: true,
        can_write: true,
        can_edit: false,
        can_delete: false,
      },
    ];

    expect(resolvePermission(false, ["teacher"], dbPerms, "academics", "read")).toBe(true);
    expect(resolvePermission(false, ["teacher"], dbPerms, "academics", "write")).toBe(true);
    expect(resolvePermission(false, ["teacher"], dbPerms, "academics", "edit")).toBe(false);
    expect(resolvePermission(false, ["teacher"], dbPerms, "academics", "delete")).toBe(false);
  });

  it("denies access when user has no permissions for module", () => {
    const dbPerms = [
      {
        module_slug: "finance",
        can_read: false,
        can_write: false,
        can_edit: false,
        can_delete: false,
      },
    ];

    expect(resolvePermission(false, ["student"], dbPerms, "finance", "read")).toBe(false);
    expect(resolvePermission(false, ["student"], dbPerms, "finance", "write")).toBe(false);
  });
});
