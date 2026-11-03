import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AvatarImage } from "@/components/ui/avatar";

function isPassthrough(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:");
}

/**
 * Returns the object path inside `bucket` for a stored value, which may be
 * a bare path or a legacy public/signed URL.
 */
export function extractStoragePath(
  bucket: string,
  urlOrPath: string | null | undefined,
): string | null {
  if (!urlOrPath) return null;
  if (isPassthrough(urlOrPath)) return null;

  const publicMarker = `/object/public/${bucket}/`;
  const pi = urlOrPath.indexOf(publicMarker);
  if (pi !== -1) {
    return decodeURIComponent(urlOrPath.slice(pi + publicMarker.length).split("?")[0]);
  }
  const signMarker = `/object/sign/${bucket}/`;
  const si = urlOrPath.indexOf(signMarker);
  if (si !== -1) {
    return decodeURIComponent(urlOrPath.slice(si + signMarker.length).split("?")[0]);
  }
  if (/^https?:\/\//i.test(urlOrPath)) return null;
  return urlOrPath;
}

/** Returns a short-lived signed URL for a private-bucket object. */
export async function getSignedUrl(
  bucket: string,
  urlOrPath: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!urlOrPath) return null;
  if (isPassthrough(urlOrPath)) return urlOrPath;
  const path = extractStoragePath(bucket, urlOrPath);
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

/** Hook that resolves a stored value to a signed URL (or passes blob/data URLs through). */
export function useSignedUrl(
  bucket: string,
  urlOrPath: string | null | undefined,
  expiresIn = 3600,
): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    urlOrPath && isPassthrough(urlOrPath) ? urlOrPath : null,
  );
  useEffect(() => {
    let cancelled = false;
    if (!urlOrPath) {
      setUrl(null);
      return;
    }
    if (isPassthrough(urlOrPath)) {
      setUrl(urlOrPath);
      return;
    }
    getSignedUrl(bucket, urlOrPath, expiresIn).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, urlOrPath, expiresIn]);
  return url;
}

export function SignedAvatarImage({
  bucket,
  src,
  alt,
}: {
  bucket: string;
  src: string | null | undefined;
  alt?: string;
}) {
  const signed = useSignedUrl(bucket, src);
  if (!signed) return null;
  return <AvatarImage src={signed} alt={alt} />;
}

export function SignedImage({
  bucket,
  src,
  fallback = null,
  ...rest
}: {
  bucket: string;
  src: string | null | undefined;
  fallback?: React.ReactNode;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const signed = useSignedUrl(bucket, src);
  if (!signed) return <>{fallback}</>;
  return <img src={signed} {...rest} />;
}