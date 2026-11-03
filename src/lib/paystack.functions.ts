import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAYSTACK_BASE = "https://api.paystack.co";

function normalizePaystackSecret(value?: string | null): string {
  return (value ?? "")
    .trim()
    .replace(/^PAYSTACK_SECRET_KEY\s*=\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^[`'"]|[`'"]$/g, "")
    .replace(/\s+/g, "");
}

function getSecret(): string {
  const raw = normalizePaystackSecret(process.env.PAYSTACK_SECRET_KEY);
  if (!raw) {
    throw new Error("Payment provider is not configured. Please add PAYSTACK_SECRET_KEY.");
  }
  if (raw.startsWith("pk_") || raw.startsWith("rk_")) {
    throw new Error("Payment provider is misconfigured. PAYSTACK_SECRET_KEY must be a secret key starting with sk_test_ or sk_live_.");
  }
  if (!raw.startsWith("sk_test_") && !raw.startsWith("sk_live_")) {
    throw new Error("Payment provider is misconfigured. Update PAYSTACK_SECRET_KEY to a valid Paystack secret key.");
  }
  return raw;
}

function getPaystackErrorMessage(status: number, message?: string): string {
  if (message && /invalid key/i.test(message)) {
    return "Payment provider rejected the configured secret key. Update PAYSTACK_SECRET_KEY to a valid Paystack secret key (sk_test_... or sk_live_...).";
  }
  return message || `Paystack error (${status})`;
}

async function paystack<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${getSecret()}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json()) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || json.status === false) {
    throw new Error(getPaystackErrorMessage(res.status, json.message));
  }
  return json as T;
}

/* ------------------------ Fee payment initialization ------------------------ */

export const initializeFeePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      feeId: z.string().uuid(),
      callbackUrl: z.string().url().max(2048).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate callback URL origin to prevent open redirect via Paystack
    let safeCallbackUrl: string | undefined;
    if (data.callbackUrl) {
      const allowedOrigins = [
        process.env.SITE_URL,
        process.env.PUBLIC_SITE_URL,
        "https://schools.zgils.com",
        "https://www.schools.zgils.com",
      ]
        .filter((v): v is string => !!v)
        .map((v) => {
          try { return new URL(v).origin; } catch { return null; }
        })
        .filter((v): v is string => !!v);
      try {
        const parsed = new URL(data.callbackUrl);
        if (allowedOrigins.includes(parsed.origin)) {
          safeCallbackUrl = parsed.toString();
        }
      } catch {
        // ignore malformed
      }
      // Silently drop invalid callback rather than failing — Paystack will use its dashboard default.
    }

    const { data: fee, error } = await supabase
      .from("fees")
      .select("id, amount, amount_paid, status, student_id, description")
      .eq("id", data.feeId)
      .single();
    if (error || !fee) throw new Error("Invoice not found.");
    if (fee.status === "paid") throw new Error("Invoice already paid.");

    const balance = Number(fee.amount) - Number(fee.amount_paid ?? 0);
    if (balance <= 0) throw new Error("No outstanding balance.");

    // Look up user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const email = profile?.email ?? `user-${userId}@gilaschools.local`;

    const reference = `fee_${fee.id.slice(0, 8)}_${Date.now()}`;

    const resp = await paystack<{ data: { authorization_url: string; reference: string } }>(
      "/transaction/initialize",
      {
        method: "POST",
        body: {
          email,
          amount: Math.round(balance * 100), // kobo
          currency: "NGN",
          reference,
          callback_url: safeCallbackUrl,
          metadata: {
            fee_id: fee.id,
            student_id: fee.student_id,
            description: fee.description,
          },
        },
      },
    );

    return { authorizationUrl: resp.data.authorization_url, reference: resp.data.reference };
  });

/* ------------------------ Payroll transfer (salary) ------------------------ */

export const paySalaryViaPaystack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ payrollId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Admin check
    const { data: isAdminRes } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
    if (!isAdminRes) throw new Error("Only admins can initiate salary transfers.");

    const { data: row, error } = await supabaseAdmin
      .from("payroll")
      .select("id, status, net_pay, staff_id, paystack_transfer_code, staff:staff(full_name, bank_name, bank_code, bank_account_number, bank_account_name, paystack_recipient_code)")
      .eq("id", data.payrollId)
      .single();
    if (error || !row) throw new Error("Payroll record not found.");
    if (row.status !== "approved") throw new Error("Payroll must be approved before paying.");
    if (row.paystack_transfer_code) throw new Error("Transfer already initiated for this payroll.");

    const staff = row.staff as unknown as {
      full_name: string;
      bank_name: string | null;
      bank_code: string | null;
      bank_account_number: string | null;
      bank_account_name: string | null;
      paystack_recipient_code: string | null;
    };

    if (!staff?.bank_code || !staff?.bank_account_number) {
      throw new Error("Staff bank details are missing. Add bank code and account number first.");
    }

    // Create transfer recipient if needed
    let recipientCode = staff.paystack_recipient_code;
    if (!recipientCode) {
      const r = await paystack<{ data: { recipient_code: string } }>("/transferrecipient", {
        method: "POST",
        body: {
          type: "nuban",
          name: staff.bank_account_name || staff.full_name,
          account_number: staff.bank_account_number,
          bank_code: staff.bank_code,
          currency: "NGN",
        },
      });
      recipientCode = r.data.recipient_code;
      await supabaseAdmin
        .from("staff")
        .update({ paystack_recipient_code: recipientCode })
        .eq("id", row.staff_id);
    }

    const reference = `payroll_${row.id.slice(0, 8)}_${Date.now()}`;

    const transfer = await paystack<{ data: { transfer_code: string; reference: string; status: string } }>(
      "/transfer",
      {
        method: "POST",
        body: {
          source: "balance",
          amount: Math.round(Number(row.net_pay) * 100), // kobo
          recipient: recipientCode,
          reason: `Salary payment - ${staff.full_name}`,
          reference,
          currency: "NGN",
        },
      },
    );

    await supabaseAdmin
      .from("payroll")
      .update({
        paystack_transfer_code: transfer.data.transfer_code,
        paystack_reference: transfer.data.reference,
      })
      .eq("id", row.id);

    return {
      transferCode: transfer.data.transfer_code,
      reference: transfer.data.reference,
      status: transfer.data.status,
    };
  });
