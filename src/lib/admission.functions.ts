import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ProvisionSchema = z.object({
  student_id: z.string().uuid(),
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .email({ message: "A valid email address is required to create or re-link a portal login." }),
  password: z.string().min(8).max(128).optional(),
});

function genPassword(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

/**
 * Provisions or links a Supabase auth user for an existing student row,
 * assigns the `student` role, and patches `students.user_id`.
 * Admin-only.
 */
export const provisionStudentLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProvisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Admin gate
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", {
      _user_id: userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Only admins may provision logins");

    // Verify the student exists
    const { data: student, error: stErr } = await supabaseAdmin
      .from("students")
      .select("id, user_id, full_name")
      .eq("id", data.student_id)
      .maybeSingle();
    if (stErr) throw new Error(stErr.message);
    if (!student) throw new Error("Student not found");
    if (student.user_id) throw new Error("This student already has a login linked");

    // Find existing auth user by email (paginate)
    let existingId: string | null = null;
    for (let page = 1; page <= 20; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const match = list.users.find(
        (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
      );
      if (match) {
        existingId = match.id;
        break;
      }
      if (list.users.length < 200) break;
    }

    let authUserId: string;
    let tempPassword: string | null = null;

    if (existingId) {
      authUserId = existingId;
    } else {
      tempPassword = data.password ?? genPassword();
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: student.full_name },
        });
      if (createErr) throw new Error(createErr.message);
      authUserId = created.user.id;
    }

    // Link student row
    const { error: linkErr } = await supabaseAdmin
      .from("students")
      .update({ user_id: authUserId })
      .eq("id", student.id);
    if (linkErr) throw new Error(linkErr.message);

    // Assign student role (idempotent)
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: authUserId, role: "student" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (roleErr) throw new Error(roleErr.message);

    return {
      user_id: authUserId,
      email: data.email,
      temp_password: tempPassword,
      linked_existing: !!existingId,
    };
  });
