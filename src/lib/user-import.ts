import { z } from "zod";

export const IMPORTABLE_USER_ROLES = [
  "admin", "teacher", "student", "parent", "admin1", "admin2", "admin3",
  "head_of_section", "school_admin", "principal", "vice_principal_academic",
  "vice_principal_admin", "hod", "class_teacher",
] as const;

export const ImportUserSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  roles: z.array(z.enum(IMPORTABLE_USER_ROLES)).min(1).max(IMPORTABLE_USER_ROLES.length)
    .transform((roles) => [...new Set(roles)]),
}).strict();

export function parseUserImportRow(row: Record<string, string>) {
  if (Object.keys(row).some((key) => /password|token|secret/i.test(key))) {
    throw new Error("Remove password, token, and secret columns before importing.");
  }
  const result = ImportUserSchema.safeParse({
    email: row.email ?? "",
    full_name: row.full_name ?? "",
    phone: row.phone?.trim() || null,
    roles: (row.roles ?? row.role ?? "").split(/[,;|]/).map((role) => role.trim().toLowerCase()).filter(Boolean),
  });
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  }
  return result.data;
}