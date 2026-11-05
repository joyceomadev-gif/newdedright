import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// The school's name and logo come from its settings (school_settings), never from the code.
// They are read through a small public function so the login page can show them before anyone signs in.

type Branding = { school_name: string | null; logo_url: string | null };
type RpcResult = { data: Branding[] | Branding | null; error: unknown };

let cache: Promise<Branding> | null = null;

function load(): Promise<Branding> {
  if (!cache) {
    cache = (async () => {
      try {
        const client = supabase as unknown as { rpc: (fn: string) => Promise<RpcResult> };
        const { data, error } = await client.rpc("get_school_branding");
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return { school_name: row?.school_name ?? null, logo_url: row?.logo_url ?? null };
      } catch {
        cache = null;
        return { school_name: null, logo_url: null };
      }
    })();
  }
  return cache;
}

/** Call after saving new settings so the name and logo refresh. */
export function refreshBranding() {
  cache = null;
}

export function useBranding(): Branding | null {
  const [branding, setBranding] = useState<Branding | null>(null);
  useEffect(() => {
    let active = true;
    load().then((b) => {
      if (active) setBranding(b);
    });
    return () => {
      active = false;
    };
  }, []);
  return branding;
}

export function BrandLogo({ className }: { className?: string }) {
  const branding = useBranding();
  if (branding?.logo_url) {
    return <img src={branding.logo_url} alt={branding.school_name ?? "School logo"} className={className} />;
  }
  return <GraduationCap className={className} aria-label="School logo" />;
}

export function BrandName({ fallback = "" }: { fallback?: string }) {
  const branding = useBranding();
  return <>{branding?.school_name || fallback}</>;
}