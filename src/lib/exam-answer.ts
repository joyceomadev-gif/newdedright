/** MCQ option identity is the original uppercase key, never its display label. */
export function optionEntries(options: unknown): [string, string][] {
  const text = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      return String(o.text ?? o.value ?? o.label ?? "");
    }
    return String(v);
  };
  return (Array.isArray(options)
    ? options.map((v, i): [string, string] => [String.fromCharCode(65 + i), text(v)])
    : options && typeof options === "object"
      ? Object.entries(options).map(([k, v]): [string, string] => [k.trim().toUpperCase(), text(v)])
      : []).filter(([, v]) => v.trim() !== "");
}

function plain(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim().replace(/\s+/g, " ").toLowerCase();
}

export function equivalentAnswer(a: string, b: string): boolean {
  const x = plain(a), y = plain(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  return number.test(x) && number.test(y) && Number(x) === Number(y);
}

export function normalizeMcqAnswer(answer: unknown, options: unknown): string | null {
  if (answer == null || !String(answer).trim()) return null;
  const raw = String(answer).trim();
  const entries = optionEntries(options);
  const key = entries.find(([k]) => k === raw.toUpperCase());
  if (key) return key[0];
  const matches = entries.filter(([, v]) => equivalentAnswer(raw, v));
  if (matches.length === 1) return matches[0][0];
  const prefix = raw.match(/^([a-z])[.)]\s*(.*)$/i);
  if (!prefix) return null;
  const prefixedKey = entries.find(([k]) => k === prefix[1].toUpperCase());
  if (prefixedKey && (!prefix[2].trim() || equivalentAnswer(prefix[2], prefixedKey[1]))) return prefixedKey[0];
  const fallback = entries.filter(([, v]) => equivalentAnswer(prefix[2], v));
  return fallback.length === 1 ? fallback[0][0] : null;
}

export function answersMatch(answer: unknown, correct: unknown, options: unknown): boolean {
  const key = normalizeMcqAnswer(correct, options);
  return key !== null && normalizeMcqAnswer(answer, options) === key;
}

/** Compact blank editor slots while preserving the selected original identity. */
export function compactMcq(options: unknown, answer: unknown) {
  const entries = optionEntries(options);
  const key = normalizeMcqAnswer(answer, options);
  const index = entries.findIndex(([k]) => k === key);
  return { options: entries.map(([, v]) => v.trim()), correct: index >= 0 ? String.fromCharCode(65 + index) : null };
}