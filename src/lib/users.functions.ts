import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["super_admin", "admin", "teacher", "student", "parent"] as const;

const CreateUserSchema = z.object({
  email: z.string().trim().email().max(254),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(40).optional().nullable(),
  roles: z.array(z.enum(ROLES)).min(1).max(5),
  send_invite: z.boolean().optional().default(true),
});

function genPassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only admins may manage users");
}

async function assertCanGrantSuperAdmin(supabase: any, userId: string, requestedRoles: readonly string[]) {
  if (!requestedRoles.includes("super_admin")) return;
  const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only a super admin may grant the super_admin role");
}

async function findAuthUserByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Admin-only: create (or link) an auth user, assign roles, and upsert profile.
 * Sends a recovery email so the user sets their own password.
 */
export const createUserWithRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    await assertCanGrantSuperAdmin(supabase, userId, data.roles);

    const email = data.email.toLowerCase();
    let authUserId = await findAuthUserByEmail(email);
    let createdNew = false;
    let generatedPassword: string | null = null;

    if (!authUserId) {
      generatedPassword = genPassword();
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (error) throw new Error(error.message);
      authUserId = created.user.id;
      createdNew = true;
    }

    // Upsert profile
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          full_name: data.full_name,
          email,
          phone: data.phone ?? null,
        },
        { onConflict: "id" },
      );
    if (profErr) throw new Error(profErr.message);

    // Assign roles (idempotent)
    const rows = data.roles.map((role) => ({ user_id: authUserId!, role }));
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(rows, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleErr) throw new Error(roleErr.message);

    // Send password-setup / recovery email
    let inviteSent = false;
    if (data.send_invite && createdNew) {
      const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (!linkErr) inviteSent = true;
    }

    return {
      user_id: authUserId,
      email,
      created_new: createdNew,
      invite_sent: inviteSent,
      username: email,
      password: generatedPassword,
    };
  });

const UpdateRolesSchema = z.object({
  user_id: z.string().uuid(),
  roles: z.array(z.enum(ROLES)).max(5),
});

/** Admin-only: replace a user's roles with the provided set. */
export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateRolesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    await assertCanGrantSuperAdmin(supabase, userId, data.roles);

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", data.user_id);
    if (exErr) throw new Error(exErr.message);

    const have = new Set((existing ?? []).map((r) => r.role));
    const want = new Set(data.roles);

    const toAdd = [...want].filter((r) => !have.has(r as any));
    const toRemove = (existing ?? []).filter((r) => !want.has(r.role as any));

    if (toAdd.length) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert(toAdd.map((role) => ({ user_id: data.user_id, role })));
      if (error) throw new Error(error.message);
    }
    if (toRemove.length) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .in("id", toRemove.map((r) => r.id));
      if (error) throw new Error(error.message);
    }
    return { added: toAdd.length, removed: toRemove.length };
  });

const SendResetSchema = z.object({ email: z.string().email() });

/** Admin-only: send a password-recovery email to an existing user. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendResetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ADMIN_ROLES = ["admin", "admin1", "admin2", "admin3", "head_of_section"] as const;

async function assertNotActingOnSuperAdmin(targetUserId: string, callerUserId: string, supabase: any) {
  const { data: targetIsSuper, error } = await supabase.rpc("is_super_admin", { _user_id: targetUserId });
  if (error) throw new Error(error.message);
  if (!targetIsSuper) return;
  const { data: callerIsSuper, error: e2 } = await supabase.rpc("is_super_admin", { _user_id: callerUserId });
  if (e2) throw new Error(e2.message);
  if (!callerIsSuper) throw new Error("Only a super admin may act on another super admin");
}

const UpdateUserSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(254).optional(),
  password: z.string().min(8).max(128).optional(),
});

/** Admin-only: update a user's profile fields and optionally reset their password. */
export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    await assertNotActingOnSuperAdmin(data.user_id, userId, supabase);

    const authPatch: Record<string, unknown> = {};
    if (data.email) authPatch.email = data.email.toLowerCase();
    if (data.password) authPatch.password = data.password;
    if (data.full_name) authPatch.user_metadata = { full_name: data.full_name };
    if (Object.keys(authPatch).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, authPatch);
      if (error) throw new Error(error.message);
    }

    const profilePatch: { full_name?: string; email?: string; phone?: string | null } = {};
    if (data.full_name) profilePatch.full_name = data.full_name;
    if (data.email) profilePatch.email = data.email.toLowerCase();
    if (data.phone !== undefined) profilePatch.phone = data.phone;
    if (Object.keys(profilePatch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profilePatch as any).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const UserIdSchema = z.object({ user_id: z.string().uuid() });

/** Admin-only: permanently delete a user (auth, profile, roles). */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UserIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    if (data.user_id === userId) throw new Error("You cannot delete your own account");
    await assertNotActingOnSuperAdmin(data.user_id, userId, supabase);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin-only: revoke all admin-tier roles from a user. */
export const revokeAdminRights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UserIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    if (data.user_id === userId) throw new Error("You cannot revoke your own admin rights");
    await assertNotActingOnSuperAdmin(data.user_id, userId, supabase);

    const { error, count } = await supabaseAdmin
      .from("user_roles")
      .delete({ count: "exact" })
      .eq("user_id", data.user_id)
      .in("role", ADMIN_ROLES as unknown as any);
    if (error) throw new Error(error.message);
    return { removed: count ?? 0 };
  });
