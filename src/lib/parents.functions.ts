import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CreateParentSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  occupation: z.string().trim().max(200).optional().nullable(),
  state_of_origin: z.string().trim().max(100).optional().nullable(),
  lga: z.string().trim().max(100).optional().nullable(),
  academic_session_id: z.string().uuid().optional().nullable(),
  redirect_to: z.string().trim().url().max(500).optional(),
  create_login: z.boolean().optional().default(true),
});

function genPassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

/**
 * Creates a parent record and automatically provisions a Supabase auth
 * account for them using their email. A password-reset / recovery link is
 * issued so the parent sets their own password on first login.
 * Admin-only.
 */
export const createParentWithAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateParentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Admin gate
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", {
      _user_id: userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Only admins may create parent accounts");

    if (data.create_login && !data.email)
      throw new Error("Email is required to create a parent login.");
    const email = (data.email ?? "").toLowerCase();

    // Plain record only — no portal login requested.
    if (!data.create_login) {
      const { data: parentRow, error: insErr } = await supabaseAdmin
        .from("parents")
        .insert({
          full_name: data.full_name,
          email: email || null,
          phone: data.phone || null,
          address: data.address || null,
          occupation: data.occupation || null,
          state_of_origin: data.state_of_origin || null,
          lga: data.lga || null,
          ...(data.academic_session_id ? { academic_session_id: data.academic_session_id } : {}),
          user_id: null,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(insErr.message);
      return {
        parent_id: parentRow.id,
        user_id: null,
        email,
        linked_existing: false,
        email_sent: false,
        email_error: null,
      };
    }

    // Find existing auth user by email
    let existingId: string | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const match = list.users.find((u) => u.email?.toLowerCase() === email);
      if (match) {
        existingId = match.id;
        break;
      }
      if (list.users.length < 200) break;
    }

    let authUserId: string;
    if (existingId) {
      authUserId = existingId;
    } else {
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: genPassword(),
          email_confirm: true,
          user_metadata: { full_name: data.full_name },
        });
      if (createErr) throw new Error(createErr.message);
      authUserId = created.user.id;
    }

    // Assign parent role (idempotent)
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: authUserId, role: "parent" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (roleErr) throw new Error(roleErr.message);

    // Insert parent row linked to the auth user
    const { data: parentRow, error: insErr } = await supabaseAdmin
      .from("parents")
      .insert({
        full_name: data.full_name,
        email,
        phone: data.phone || null,
        address: data.address || null,
        occupation: data.occupation || null,
        state_of_origin: data.state_of_origin || null,
        lga: data.lga || null,
        ...(data.academic_session_id ? { academic_session_id: data.academic_session_id } : {}),
        user_id: authUserId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Actually SEND a password-setup (recovery) email. `generateLink` only
    // creates a link without delivering it, so we use the public auth endpoint.
    const redirectTo =
      data.redirect_to ||
      (process.env.SITE_URL ? `${process.env.SITE_URL}/reset-password` : undefined);

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const publicClient = createClient(
        process.env['SUPABASE_URL']!,
        process.env['SUPABASE_PUBLISHABLE_KEY']!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { error: mailErr } = await publicClient.auth.resetPasswordForEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (mailErr) emailError = mailErr.message;
      else emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
    }

    return {
      parent_id: parentRow.id,
      user_id: authUserId,
      email,
      linked_existing: !!existingId,
      email_sent: emailSent,
      email_error: emailError,
    };
  });

async function sendSetupEmail(email: string, redirectTo?: string) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const publicClient = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await publicClient.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) return { sent: false, error: error.message };
    return { sent: true, error: null as string | null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const ParentIdSchema = z.object({
  parent_id: z.string().uuid(),
  redirect_to: z.string().trim().url().max(500).optional(),
});

/**
 * Admin-only: provision a parent-portal login for an existing parent record
 * that has no linked auth account yet, then email a password-setup link.
 */
export const provisionParentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ParentIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", {
      _user_id: userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Only admins may create parent logins");

    const { data: parent, error: pErr } = await supabaseAdmin
      .from("parents")
      .select("id, full_name, email, user_id")
      .eq("id", data.parent_id)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!parent?.email) throw new Error("This parent has no email address to create a login with.");

    if (parent.user_id) {
      const mail = await sendSetupEmail(parent.email.toLowerCase(), data.redirect_to);
      return { user_id: parent.user_id, already_linked: true, email_sent: mail.sent, email_error: mail.error };
    }

    const email = parent.email.toLowerCase();

    // Find existing auth user by email
    let authUserId: string | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const match = list.users.find((u) => u.email?.toLowerCase() === email);
      if (match) { authUserId = match.id; break; }
      if (list.users.length < 200) break;
    }

    if (!authUserId) {
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: genPassword(),
        email_confirm: true,
        user_metadata: { full_name: parent.full_name },
      });
      if (createErr) throw new Error(createErr.message);
      authUserId = created.user.id;
    }

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: authUserId, role: "parent" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (roleErr) throw new Error(roleErr.message);

    const { error: upErr } = await supabaseAdmin
      .from("parents")
      .update({ user_id: authUserId })
      .eq("id", data.parent_id);
    if (upErr) throw new Error(upErr.message);

    const mail = await sendSetupEmail(email, data.redirect_to);
    return { user_id: authUserId, already_linked: false, email_sent: mail.sent, email_error: mail.error };
  });

/**
 * Admin-only: send a password-reset email to a parent who already has a
 * portal login.
 */
export const sendParentPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ParentIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", {
      _user_id: userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Only admins may reset parent passwords");

    const { data: parent, error: pErr } = await supabaseAdmin
      .from("parents")
      .select("id, email, user_id")
      .eq("id", data.parent_id)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (!parent?.email) throw new Error("This parent has no email address.");
    if (!parent.user_id) throw new Error("This parent has no portal login yet. Generate a login first.");

    const mail = await sendSetupEmail(parent.email.toLowerCase(), data.redirect_to);
    if (!mail.sent) throw new Error(mail.error || "Failed to send reset email.");
    return { ok: true, email: parent.email.toLowerCase() };
  });

