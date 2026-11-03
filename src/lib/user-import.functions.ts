import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ImportUserSchema } from "@/lib/user-import";

export const importUserWithRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ImportUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: permissionError } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (permissionError || !isAdmin) throw new Error("Only administrators may import users and roles.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetId: string | null = null;
    for (let page = 1; ; page++) {
      const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error("Unable to check existing accounts. Try again.");
      const match = users.users.find((user) => user.email?.toLowerCase() === data.email);
      if (match) { targetId = match.id; break; }
      if (users.users.length < 200) break;
    }

    if (targetId) {
      const { data: targetIsSuper, error } = await context.supabase.rpc("is_super_admin", { _user_id: targetId });
      if (error) throw new Error("Unable to check account permissions.");
      if (targetIsSuper) throw new Error("Super administrator accounts cannot be changed through import.");
    }

    let createdNew = false;
    if (!targetId) {
      // An actual invitation delivers the setup email; generating a link alone does not.
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name: data.full_name },
      });
      if (error || !invited.user) throw new Error("Could not invite this user. Check the email address or try again.");
      targetId = invited.user.id;
      createdNew = true;
    }
    const userId = targetId;
    try {
      // Existing profiles and existing roles remain intact; imports only add roles.
      if (createdNew) {
        const { error } = await supabaseAdmin.from("profiles").upsert({
          id: userId, full_name: data.full_name, email: data.email, phone: data.phone ?? null,
        }, { onConflict: "id" });
        if (error) throw new Error("Could not save the imported user's profile.");
      }
      const { error } = await supabaseAdmin.from("user_roles").upsert(
        data.roles.map((role) => ({ user_id: userId, role })),
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
      if (error) throw new Error("Could not assign the imported roles.");
    } catch (error) {
      if (createdNew) {
        const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (cleanupError) throw new Error("Import incomplete: a login was created but roles were not saved. Review this account before retrying.");
      }
      throw error;
    }
    return { user_id: userId, created_new: createdNew, invitation_sent: createdNew };
  });