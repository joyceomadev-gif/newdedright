import { describe, expect, it } from "vitest";
import { IMPORTABLE_USER_ROLES, ImportUserSchema, parseUserImportRow } from "@/lib/user-import";

describe("user and role import validation", () => {
  it("normalizes emails and accepts multiple roles without duplicates", () => {
    expect(parseUserImportRow({ email: " Teacher@Example.com ", full_name: " Test Teacher ", phone: " 0123456789 ", roles: "teacher;hod|teacher" }))
      .toEqual({ email: "teacher@example.com", full_name: "Test Teacher", phone: "0123456789", roles: ["teacher", "hod"] });
  });
  it("accepts all existing non-super-admin school roles", () => {
    expect(parseUserImportRow({ email: "staff@example.com", full_name: "Staff", roles: IMPORTABLE_USER_ROLES.join(",") }).roles)
      .toEqual([...IMPORTABLE_USER_ROLES]);
  });
  it("rejects super admin roles in both uploads and direct server input", () => {
    expect(() => parseUserImportRow({ email: "a@example.com", full_name: "A", roles: "super_admin" })).toThrow();
    expect(ImportUserSchema.safeParse({ email: "a@example.com", full_name: "A", roles: ["super_admin"] }).success).toBe(false);
  });
  it("rejects unknown or missing roles before creating a login", () => {
    for (const roles of ["", "administrator", "teacher,unknown"]) {
      expect(() => parseUserImportRow({ email: "a@example.com", full_name: "A", roles })).toThrow();
    }
  });
  it("rejects missing names and invalid emails", () => {
    expect(() => parseUserImportRow({ email: "bad", full_name: "A", roles: "teacher" })).toThrow();
    expect(() => parseUserImportRow({ email: "a@example.com", full_name: "", roles: "teacher" })).toThrow();
  });
  it("rejects password and token columns rather than importing credentials", () => {
    for (const column of ["password", "access_token", "secret"]) {
      expect(() => parseUserImportRow({ email: "a@example.com", full_name: "A", roles: "teacher", [column]: "not-imported" })).toThrow("Remove password");
    }
  });
});