import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron-callable endpoint that advances the current term forward when today's
 * date enters the next term's range. Called daily by pg_cron.
 *
 * Protected by a shared secret header `x-cron-secret` that must match the
 * `CRON_SECRET` env var. Without it, the endpoint returns 401.
 */
export const Route = createFileRoute("/api/public/hooks/advance-term")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        if (!expected) {
          console.error("[advance-term] CRON_SECRET is not configured");
          return new Response(JSON.stringify({ ok: false, error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const provided = request.headers.get("x-cron-secret");
        if (!provided || provided !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { data, error } = await supabaseAdmin.rpc("advance_current_term");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
