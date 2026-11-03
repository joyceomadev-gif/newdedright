import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignedImage } from "@/lib/storage";
import { bankMediaInfo, setBankMediaText, validateBankImage } from "@/lib/question-bank-media";

export function useBankUploads(userId: string) {
  const paths = useRef(new Set<string>());
  const committed = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (!committed.current && paths.current.size)
        void supabase.storage.from("question-media").remove([...paths.current]);
    },
    [],
  );
  const upload = async (files: File[]) => {
    files.forEach(validateBankImage);
    setBusy(true);
    try {
      const media: Json[] = [];
      for (const file of files) {
        const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
        const path = `question-bank/${userId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("question-media")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (error) throw error;
        paths.current.add(path);
        media.push({ bucket: "question-media", path, label: "", caption: "" });
      }
      return media;
    } finally {
      setBusy(false);
    }
  };
  const commit = () => {
    committed.current = true;
  };
  return { upload, busy, commit };
}

export function BankMediaView({ media }: { media: Json[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {media.map((entry, i) => {
        const info = bankMediaInfo(entry);
        return info ? (
          <figure key={i} className="min-w-0 space-y-2">
            {info.label && <p className="text-sm font-medium">{info.label}</p>}
            <SignedImage
              bucket={info.bucket}
              src={info.path}
              alt={info.caption || info.label || "Question figure"}
              className="max-h-64 max-w-full object-contain"
              fallback={<p className="text-sm text-muted-foreground">Image unavailable</p>}
            />
            {info.caption && (
              <figcaption className="text-sm text-muted-foreground">{info.caption}</figcaption>
            )}
          </figure>
        ) : null;
      })}
    </div>
  );
}

export function BankMediaEditor({
  media,
  change,
  uploads,
  disabled = false,
}: {
  media: Json[];
  change: (media: Json[]) => void;
  uploads: ReturnType<typeof useBankUploads>;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const add = async (files: File[]) => {
    if (disabled || uploads.busy || !files.length) return;
    setError("");
    try {
      change([...media, ...(await uploads.upload(files))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed.");
    }
  };
  return (
    <div
      className="space-y-3"
      onPaste={(e) => {
        if (disabled || uploads.busy) return;
        const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
        if (files.length) {
          e.preventDefault();
          void add(files);
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        disabled={disabled || uploads.busy}
        onClick={() => input.current?.click()}
      >
        <ImagePlus />
        {uploads.busy ? "Uploading…" : "Add images"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {media.map((entry, i) => {
        const info = bankMediaInfo(entry);
        return (
          <div key={i} className="border-b py-3 space-y-2">
            {info ? (
              <>
                <BankMediaView media={[entry]} />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Image ${i + 1} label`}
                    placeholder="Label"
                    value={info.label}
                    disabled={disabled || uploads.busy}
                    onChange={(e) => change(setBankMediaText(media, i, "label", e.target.value))}
                  />
                  <Input
                    aria-label={`Image ${i + 1} caption`}
                    placeholder="Caption"
                    value={info.caption}
                    disabled={disabled || uploads.busy}
                    onChange={(e) => change(setBankMediaText(media, i, "caption", e.target.value))}
                  />
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Existing attachment</p>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove image ${i + 1}`}
              title="Remove attachment"
              disabled={disabled || uploads.busy}
              onClick={() => change(media.filter((_, index) => index !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
