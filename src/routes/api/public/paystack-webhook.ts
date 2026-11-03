import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Paystack webhook handler.
 *
 * Configure URL in Paystack Dashboard → Settings → API Keys & Webhooks:
 *   https://<your-domain>/api/public/paystack-webhook
 *
 * Verification: Paystack signs the raw request body with HMAC-SHA512 using
 * your secret key and sends it in the `x-paystack-signature` header.
 *
 * Handled events:
 *   - charge.success         → fee payment confirmed (records via RPC)
 *   - transfer.success       → salary transfer paid (payroll → paid)
 *   - transfer.failed        → salary transfer failed (payroll → approved, clears codes)
 *   - transfer.reversed      → salary transfer reversed (payroll → approved)
 */

function verify(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface PaystackEvent {
  event: string;
  data: Record<string, unknown>;
}

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYSTACK_SECRET_KEY;
        if (!secret) return new Response("Paystack not configured", { status: 500 });

        const rawBody = await request.text();
        const sig = request.headers.get("x-paystack-signature");
        if (!verify(rawBody, sig, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let evt: PaystackEvent;
        try {
          evt = JSON.parse(rawBody) as PaystackEvent;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        try {
          if (evt.event === "charge.success") {
            const d = evt.data as {
              reference: string;
              amount: number; // kobo
              paid_at?: string;
              metadata?: { fee_id?: string };
            };
            const feeId = d.metadata?.fee_id;
            if (!feeId) return Response.json({ ok: true, ignored: "no fee_id" });

            const { error } = await supabaseAdmin.rpc("record_payment_transaction", {
              _fee_id: feeId,
              _reference: d.reference,
              _amount: d.amount / 100,
              _payment_method: "paystack",
              _paid_at: d.paid_at ?? new Date().toISOString(),
              _raw_payload: JSON.parse(rawBody),
            });
            if (error) {
              const code = (error as { code?: string }).code;
              if (code === "23505") return Response.json({ ok: true, deduped: true });
              console.error("paystack charge.success failed", error);
              return new Response("Update failed", { status: 500 });
            }
            return Response.json({ ok: true });
          }

          if (
            evt.event === "transfer.success" ||
            evt.event === "transfer.failed" ||
            evt.event === "transfer.reversed"
          ) {
            const d = evt.data as { transfer_code: string };
            if (!d.transfer_code) return Response.json({ ok: true, ignored: "no transfer_code" });

            const { data: payroll } = await supabaseAdmin
              .from("payroll")
              .select("id, status")
              .eq("paystack_transfer_code", d.transfer_code)
              .maybeSingle();

            if (!payroll) return Response.json({ ok: true, ignored: "no matching payroll" });

            if (evt.event === "transfer.success") {
              if (payroll.status === "approved") {
                const { error } = await supabaseAdmin
                  .from("payroll")
                  .update({ status: "paid" })
                  .eq("id", payroll.id);
                if (error) {
                  console.error("paystack transfer.success update failed", error);
                  return new Response("Update failed", { status: 500 });
                }
              }
            } else {
              // failed or reversed → reset transfer code so admin can retry
              const { error } = await supabaseAdmin
                .from("payroll")
                .update({ paystack_transfer_code: null, paystack_reference: null })
                .eq("id", payroll.id);
              if (error) {
                console.error("paystack transfer.failed reset failed", error);
                return new Response("Update failed", { status: 500 });
              }
            }
            return Response.json({ ok: true });
          }

          return Response.json({ ok: true, ignored: evt.event });
        } catch (err) {
          console.error("paystack-webhook handler error", err);
          return new Response("Internal error", { status: 500 });
        }
      },
    },
  },
});
