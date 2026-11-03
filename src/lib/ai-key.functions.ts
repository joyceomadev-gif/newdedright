import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = ["super_admin", "admin", "admin1", "admin2", "admin3"];

export interface AiKeyStatus {
  configured: boolean;
  fingerprint: string | null;
  keyLength: number | null;
  gatewayStatus: number | null;
  ok: boolean;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
}

/**
 * Admin-only health check for LOVABLE_API_KEY.
 * Never returns the key itself — only a short SHA-256 fingerprint so admins can
 * tell whether a rotation has propagated to the backend environment.
 */
export const checkAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiKeyStatus> => {
    const { supabase, userId } = context;
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Could not verify your permissions.");
    const isAdmin = (roleRows ?? []).some((r) => ADMIN_ROLES.includes(String(r.role)));
    if (!isAdmin) throw new Error("Forbidden");

    const checkedAt = new Date().toISOString();
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return {
        configured: false,
        fingerprint: null,
        keyLength: null,
        gatewayStatus: null,
        ok: false,
        latencyMs: null,
        message: "LOVABLE_API_KEY is not present in the backend environment.",
        checkedAt,
      };
    }

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    const fingerprint = Array.from(new Uint8Array(digest))
      .slice(0, 6)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const started = Date.now();
    let gatewayStatus: number | null = null;
    let ok = false;
    let message = "";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "Reply with the single word OK." }],
        }),
      });
      gatewayStatus = res.status;
      if (res.ok) {
        ok = true;
        message = "Key is valid and the AI gateway responded successfully.";
      } else if (res.status === 401 || res.status === 403) {
        message = "Gateway rejected the key — it may be revoked or not yet synced.";
      } else if (res.status === 429) {
        message = "Key is accepted but rate limited right now.";
        ok = true;
      } else if (res.status === 402) {
        message = "Key is accepted but AI credits are exhausted.";
        ok = true;
      } else {
        message = `Gateway returned an unexpected status (${res.status}).`;
      }
    } catch {
      message = "Could not reach the AI gateway.";
    }

    return {
      configured: true,
      fingerprint,
      keyLength: apiKey.length,
      gatewayStatus,
      ok,
      latencyMs: Date.now() - started,
      message,
      checkedAt,
    };
  });
