import { useRef, useState, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo, refreshBranding, useBranding } from "@/lib/branding";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const BUCKET = "school-branding";

export function LogoUploader() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const branding = useBranding();

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) return void toast.error("Please choose a PNG, JPEG or WebP image.");
    if (file.size > MAX_BYTES) return void toast.error("The image is larger than 2 MB. Please choose a smaller one.");

    setBusy(true);
    try {
      const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
      const path = `logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

      const { error } = await supabase.from("school_settings").update({ logo_url: url } as never).eq("id", 1);
      if (error) throw error;

      // tidy up the previous logo file (ignore any problem)
      const old = branding?.logo_url ?? "";
      const marker = `/${BUCKET}/`;
      if (old.includes(marker)) {
        const oldPath = decodeURIComponent(old.split(marker)[1] ?? "");
        if (oldPath && oldPath !== path) void supabase.storage.from(BUCKET).remove([oldPath]);
      }

      refreshBranding();
      toast.success("Logo updated. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the logo.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center overflow-hidden">
        <BrandLogo className="h-14 w-14 object-contain" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium">School logo</div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP, up to 2 MB. Shown on the login page, the header and report cards.
        </p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPick} />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          {busy ? "Uploading…" : "Upload logo"}
        </Button>
      </div>
    </div>
  );
}