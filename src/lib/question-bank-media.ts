import type { Json } from "@/integrations/supabase/types";

export const BANK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export function bankPassageChoice(value: string): string | undefined {
  return value ? (value === "none" ? "" : value) : undefined;
}
export function validateBankImage(file: { type: string; size: number }) {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type))
    throw new Error("Choose a PNG, JPEG, WebP or GIF image.");
  if (file.size <= 0 || file.size > BANK_IMAGE_MAX_BYTES)
    throw new Error("Images must be nonempty and no larger than 5 MB.");
}
export function bankMediaEntries(media: Json): Json[] {
  return Array.isArray(media) ? [...media] : media == null ? [] : [media];
}
export function bankMediaInfo(entry: Json) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const path =
    typeof entry.path === "string" ? entry.path : typeof entry.url === "string" ? entry.url : null;
  if (!path) return null;
  return {
    bucket: typeof entry.bucket === "string" ? entry.bucket : "question-media",
    path,
    label: typeof entry.label === "string" ? entry.label : "",
    caption: typeof entry.caption === "string" ? entry.caption : "",
  };
}
export function setBankMediaText(
  media: Json[],
  index: number,
  key: "label" | "caption",
  value: string,
): Json[] {
  return media.map((entry, i) =>
    i === index && entry && typeof entry === "object" && !Array.isArray(entry)
      ? { ...entry, [key]: value }
      : entry,
  );
}
export function assertBankStimulusScope(
  stimulus: { class_id: string; subject_id: string },
  classId: string,
  subjectId: string,
) {
  if (stimulus.class_id !== classId || stimulus.subject_id !== subjectId)
    throw new Error("Choose a passage for this class and subject.");
}
export function bankPassagePayload(title: string, html: string) {
  if (!title.trim() || !html.replace(/<[^>]*>/g, "").trim())
    throw new Error("Enter a passage title and text.");
  return { title: title.trim(), content_json: [{ id: "passage", kind: "passage", html }] };
}
