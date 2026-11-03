import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Generic payment webhook.
 *
 * Security: callers must include `x-webhook-signature` header containing
 * HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET) as a hex string.
 *
 * Idempotency + atomicity: the insert into payment_transactions and the
 * update to fees happen in a single Postgres function call, so a duplicate
 * reference (unique violation) aborts the whole operation without leaving
 * partial state.
 */

const PayloadSchema = z.object({
  fee_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000),
  reference: z.string().min(1).max(255),
  payment_method: z.string().min(1).max(64).default("online"),
  paid_at: z.string().datetime().optional(),
});

function verifySignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/payment-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.PAYMENT_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook secret not configured", { status: 500 });
        }

        const rawBody = await request.text();
        const sig = request.headers.get("x-webhook-signature");
        if (!verifySignature(rawBody, sig, secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let parsed;
        try {
          parsed = PayloadSchema.parse(JSON.parse(rawBody));
        } catch (err) {
          console.error("payment-webhook payload validation failed", err);
          return Response.json({ error: "Invalid payload" }, { status: 400 });
        }

        const paidAtIso = parsed.paid_at ?? new Date().toISOString();

        const { data, error } = await supabaseAdmin.rpc(
          "record_payment_transaction",
          {
            _fee_id: parsed.fee_id,
            _reference: parsed.reference,
            _amount: parsed.amount,
            _payment_method: parsed.payment_method,
            _paid_at: paidAtIso,
            _raw_payload: JSON.parse(rawBody),
          },
        );

        if (error) {
          const code = (error as { code?: string }).code;
          if (code === "23505") {
            return Response.json({ ok: true, deduped: true });
          }
          if (code === "P0002" || /fee_not_found/i.test(error.message)) {
            return new Response("Invoice not found", { status: 404 });
          }
          console.error("payment-webhook rpc failed", error);
          return new Response("Update failed", { status: 500 });
        }

        return Response.json({ ok: true, ...(data as object) });
      },
    },
  },
});
