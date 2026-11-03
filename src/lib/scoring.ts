import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScoringScheme = "weighted_ca_exam" | "running_average" | "display_only";
export type CumulativeMethod = "average_of_terms" | "sum_of_terms";

export interface GradeBand { grade: string; min: number; max: number; remark: string }
export interface SchoolSettings {
  id: number;
  scoring_scheme: ScoringScheme;
  cumulative_method: CumulativeMethod;
  ca1_weight: number;
  ca2_weight: number;
  ca3_weight: number;
  exam_weight: number;
  promotion_min_average: number;
  grading_scale: GradeBand[];
  school_name: string | null;
}

export const DEFAULT_SETTINGS: SchoolSettings = {
  id: 1,
  scoring_scheme: "weighted_ca_exam",
  cumulative_method: "average_of_terms",
  ca1_weight: 15,
  ca2_weight: 15,
  ca3_weight: 0,
  exam_weight: 70,
  promotion_min_average: 50,
  grading_scale: [
    { grade: "A", min: 70, max: 100, remark: "Excellent" },
    { grade: "B", min: 60, max: 69, remark: "Very Good" },
    { grade: "C", min: 50, max: 59, remark: "Good" },
    { grade: "D", min: 45, max: 49, remark: "Pass" },
    { grade: "E", min: 40, max: 44, remark: "Weak Pass" },
    { grade: "F", min: 0, max: 39, remark: "Fail" },
  ],
  school_name: null,
};

export function formatTermName(name?: string | null): string {
  if (!name) return "";
  const lower = name.toLowerCase().trim();
  if (lower === "first" || lower === "1st") return "Term 1";
  if (lower === "second" || lower === "2nd") return "Term 2";
  if (lower === "third" || lower === "3rd") return "Term 3";
  if (lower.startsWith("term")) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function useSchoolSettings() {
  return useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data as unknown as SchoolSettings) ?? DEFAULT_SETTINGS;
    },
    staleTime: 60_000,
  });
}

export interface TermInputs {
  /** all CA scores (any number) for one student/subject/term, normalized to /100 */
  caScoresPct: number[];
  /** exam score normalized to /100, or null when no exam */
  examScorePct: number | null;
}

/** Normalize a raw score to a percentage (0..100). */
export function pct(score: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, (score / max) * 100));
}

/**
 * Compute a single term total (0..100) for one subject according to the school's scoring scheme.
 * Returns null when the scheme is "display_only" (no computed term total).
 */
export function computeTermTotal(s: SchoolSettings, t: TermInputs): number | null {
  if (s.scoring_scheme === "display_only") return null;

  if (s.scoring_scheme === "running_average") {
    const all = [...t.caScoresPct, ...(t.examScorePct != null ? [t.examScorePct] : [])];
    if (all.length === 0) return null;
    return round2(all.reduce((a, b) => a + b, 0) / all.length);
  }

  // weighted_ca_exam — pair the first three CAs with CA1/CA2/CA3 weights.
  // If the subject doesn't record CA3 (no third CA score), CA3 contributes 0
  // and the formula naturally degrades to CA1·w1 + CA2·w2 + Exam·we.
  const w1 = Number(s.ca1_weight) || 0;
  const w2 = Number(s.ca2_weight) || 0;
  const w3 = Number(s.ca3_weight) || 0;
  const we = Number(s.exam_weight) || 0;
  const ca1 = t.caScoresPct[0];
  const ca2 = t.caScoresPct[1];
  const ca3 = t.caScoresPct[2];
  const ex = t.examScorePct;
  // If nothing recorded, return null
  if (ca1 == null && ca2 == null && ca3 == null && ex == null) return null;
  const total =
    ((ca1 ?? 0) * w1 + (ca2 ?? 0) * w2 + (ca3 ?? 0) * w3 + (ex ?? 0) * we) / 100;
  return round2(total);
}

/**
 * Compute the cumulative across term totals according to cumulative_method.
 * Returns null when the scheme is "display_only" or no term totals are present.
 */
export function computeCumulative(s: SchoolSettings, termTotals: Array<number | null>): number | null {
  if (s.scoring_scheme === "display_only") return null;
  const vals = termTotals.filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  if (s.cumulative_method === "sum_of_terms") return round2(vals.reduce((a, b) => a + b, 0));
  return round2(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function gradeFor(s: SchoolSettings, pctScore: number | null): GradeBand | null {
  if (pctScore == null) return null;
  if (pctScore < 0) return null;
  // Match by lower bound (highest min that still ≤ pct). This avoids gaps when
  // bands use integer boundaries (e.g. A=70-100, B=60-69) and a fractional
  // score like 69.5 would otherwise fall between bands.
  const sorted = [...(s.grading_scale ?? [])].sort((a, b) => b.min - a.min);
  return sorted.find((b) => pctScore >= b.min) ?? null;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

/**
 * Format the raw CA / Exam parts shown in display_only mode.
 * - CA scores are rounded to the nearest integer
 * - Exam score is prefixed with "E:" and rounded
 * - Parts are joined with " / "
 * - Missing entries (null / undefined / NaN) are skipped, not rendered as "0"
 * - Returns "—" when nothing is recorded
 */
export function formatRawTermParts(t: TermInputs): string {
  const parts: string[] = [];
  for (const c of t.caScoresPct ?? []) {
    if (c == null || Number.isNaN(c)) continue;
    parts.push(Math.round(c).toString());
  }
  if (t.examScorePct != null && !Number.isNaN(t.examScorePct)) {
    parts.push(`E:${Math.round(t.examScorePct)}`);
  }
  return parts.length ? parts.join(" / ") : "—";
}

/** Validation used by Settings save. Returns an error message or null. */
export function validateSettings(s: SchoolSettings): string | null {
  if (s.promotion_min_average < 0 || s.promotion_min_average > 100) {
    return "Promotion minimum average must be between 0 and 100.";
  }
  for (const b of s.grading_scale ?? []) {
    if (!b.grade?.trim()) return "Each grade band needs a label.";
    if (b.min < 0 || b.max < b.min || b.max > 100) return `Invalid grade band "${b.grade}".`;
  }
  if (s.scoring_scheme === "weighted_ca_exam") {
    const w3 = Number(s.ca3_weight) || 0;
    const weights = [s.ca1_weight, s.ca2_weight, s.ca3_weight ?? 0, s.exam_weight];
    if (weights.some((w) => Number(w) < 0)) {
      return "Weights cannot be negative.";
    }
    const total = Number(s.ca1_weight) + Number(s.ca2_weight) + w3 + Number(s.exam_weight);
    if (Math.round(total) !== 100) {
      const label = w3 > 0 ? "CA1 + CA2 + CA3 + Exam" : "CA1 + CA2 + Exam";
      return `${label} weights must sum to 100 (currently ${total}).`;
    }
  }
  if (s.scoring_scheme === "display_only" && s.cumulative_method !== "average_of_terms") {
    // not strictly broken; normalize silently
  }
  return null;
}
