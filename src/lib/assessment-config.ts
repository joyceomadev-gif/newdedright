import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GradeBand } from "@/lib/scoring";

export interface AssessmentComponent {
  id: string;
  structure_id?: string;
  code: string;
  name: string;
  category?: "exam_component" | "skill_criterion";
  max_score: number;
  weight_percentage: number;
  display_order: number;
  is_mandatory: boolean;
}

export interface AssessmentStructure {
  id: string;
  tenant_id?: string | null;
  name: string;
  education_level: string;
  session_id?: string | null;
  term_id?: string | null;
  class_id?: string | null;
  subject_id?: string | null;
  is_default: boolean;
  total_max_score: number;
  components: AssessmentComponent[];
}

export interface DynamicGradingScale {
  id: string;
  tenant_id?: string | null;
  name: string;
  education_level?: string | null;
  class_id?: string | null;
  subject_id?: string | null;
  is_default?: boolean;
  bands: (GradeBand & { grade_point?: number })[];
}

/** Hook to resolve the exact Assessment Structure for a given context */
export function useResolvedAssessmentStructure(
  classId?: string | null,
  subjectId?: string | null,
  termId?: string | null,
  sessionId?: string | null,
  educationLevel?: string | null
) {
  return useQuery({
    queryKey: ["resolved-assessment-structure", classId, subjectId, termId, sessionId, educationLevel],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_assessment_structure", {
        _class_id: classId || undefined,
        _subject_id: subjectId || undefined,
        _term_id: termId || undefined,
        _session_id: sessionId || undefined,
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        const componentsRaw = typeof row.components === "string" ? JSON.parse(row.components) : row.components;
        if (componentsRaw && componentsRaw.length > 0) {
          return {
            id: row.structure_id,
            name: row.structure_name,
            total_max_score: Number(row.total_max_score) || 100,
            components: (componentsRaw || []).map((c: any) => ({
              id: c.id,
              code: c.code,
              name: c.name,
              category: c.category || "exam_component",
              max_score: Number(c.max_score) || 0,
              weight_percentage: Number(c.weight_percentage) || 0,
              display_order: Number(c.display_order) || 0,
              is_mandatory: c.is_mandatory ?? true,
            })) as AssessmentComponent[],
          };
        }
      }

      // Direct Query Fallback: class_id -> education_level -> default
      let matchedRow: any = null;

      if (classId) {
        const { data: byClass } = await supabase
          .from("assessment_structures")
          .select("id,name,total_max_score,assessment_components(id,code,name,category,max_score,weight_percentage,display_order,is_mandatory)")
          .eq("class_id", classId)
          .is("deleted_at", null)
          .maybeSingle();
        if (byClass) matchedRow = byClass;
      }

      if (!matchedRow && educationLevel) {
        const { data: byLevel } = await supabase
          .from("assessment_structures")
          .select("id,name,total_max_score,assessment_components(id,code,name,category,max_score,weight_percentage,display_order,is_mandatory)")
          .eq("education_level", educationLevel)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byLevel) matchedRow = byLevel;
      }

      if (!matchedRow) {
        const { data: byDefault } = await supabase
          .from("assessment_structures")
          .select("id,name,total_max_score,assessment_components(id,code,name,category,max_score,weight_percentage,display_order,is_mandatory)")
          .eq("is_default", true)
          .is("deleted_at", null)
          .maybeSingle();
        if (byDefault) matchedRow = byDefault;
      }

      if (!matchedRow) return null;

      const comps = (matchedRow.assessment_components || []).map((c: any) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        category: c.category || "exam_component",
        max_score: Number(c.max_score) || 0,
        weight_percentage: Number(c.weight_percentage) || 0,
        display_order: Number(c.display_order) || 0,
        is_mandatory: c.is_mandatory ?? true,
      })).sort((a: any, b: any) => a.display_order - b.display_order);

      return {
        id: matchedRow.id,
        name: matchedRow.name,
        total_max_score: Number(matchedRow.total_max_score) || 100,
        components: comps as AssessmentComponent[],
      };
    },
    staleTime: 60_000,
  });
}

/** Hook to resolve the exact Grading Scale according to precedence hierarchy */
export function useResolvedGradingScale(
  classId?: string | null,
  subjectId?: string | null,
  educationLevel?: string | null
) {
  return useQuery({
    queryKey: ["resolved-grading-scale", classId, subjectId, educationLevel],
    queryFn: async () => {
      // 1. Try RPC first
      const { data, error } = await supabase.rpc("resolve_grading_scale", {
        _class_id: classId || undefined,
        _subject_id: subjectId || undefined,
        _education_level: educationLevel || undefined,
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        const bandsRaw = typeof row.bands === "string" ? JSON.parse(row.bands) : row.bands;
        if (bandsRaw && bandsRaw.length > 0) {
          return {
            id: row.scale_id,
            name: row.scale_name,
            bands: bandsRaw,
          } as DynamicGradingScale;
        }
      }

      // 2. Direct Query Fallback: class_id -> education_level / 'all' -> default
      let matchedScale: any = null;

      if (classId) {
        const { data: byClass } = await supabase
          .from("grading_scales")
          .select("id,name,bands")
          .eq("class_id", classId)
          .maybeSingle();
        if (byClass) matchedScale = byClass;
      }

      if (!matchedScale && educationLevel) {
        const { data: byLevel } = await supabase
          .from("grading_scales")
          .select("id,name,bands")
          .or(`education_level.eq.${educationLevel},education_level.eq.all`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (byLevel) matchedScale = byLevel;
      }

      if (!matchedScale) {
        const { data: byDefault } = await supabase
          .from("grading_scales")
          .select("id,name,bands")
          .eq("is_default", true)
          .maybeSingle();
        if (byDefault) matchedScale = byDefault;
      }

      if (matchedScale) {
        const bandsRaw = typeof matchedScale.bands === "string" ? JSON.parse(matchedScale.bands) : matchedScale.bands;
        if (bandsRaw && bandsRaw.length > 0) {
          return {
            id: matchedScale.id,
            name: matchedScale.name,
            bands: bandsRaw,
          } as DynamicGradingScale;
        }
      }

      // 3. Fallback to school_settings grading scale
      const { data: settings } = await supabase
        .from("school_settings")
        .select("grading_scale")
        .eq("id", 1)
        .maybeSingle();

      const settingsBands = settings?.grading_scale
        ? (typeof settings.grading_scale === "string" ? JSON.parse(settings.grading_scale) : settings.grading_scale)
        : null;

      const fallbackBands = (settingsBands && settingsBands.length > 0) ? settingsBands : [
        { grade: "A", min: 70, max: 100, remark: "Excellent", grade_point: 5 },
        { grade: "B", min: 60, max: 69, remark: "Very Good", grade_point: 4 },
        { grade: "C", min: 50, max: 59, remark: "Good", grade_point: 3 },
        { grade: "D", min: 45, max: 49, remark: "Pass", grade_point: 2 },
        { grade: "E", min: 40, max: 44, remark: "Weak Pass", grade_point: 1 },
        { grade: "F", min: 0, max: 39, remark: "Fail", grade_point: 0 },
      ];

      return {
        id: "default-scale",
        name: "Standard Grading Scale",
        bands: fallbackBands,
      } as DynamicGradingScale;
    },
    staleTime: 60_000,
  });
}

/**
 * Rescale a stored score to a target component scale.
 * Rows written by the earlier (normalized) sync trigger stored 0-100 values with
 * max_score = 100; those must be mapped back onto the component scale so every
 * consumer applies identical math. Rows already on the component scale pass through.
 */
export function rescaleStoredScore(
  score: number,
  storedMax: number | null | undefined,
  targetMax: number | undefined
): number {
  if (storedMax === 100 && targetMax && targetMax !== 100) {
    return (Number(score) / 100) * targetMax;
  }
  return Number(score);
}

/**
 * Compute a weighted total score (0..100) from components and scores.
 *
 * Each recorded component contributes `min(1, score / max_score) * weight_percentage`,
 * then the sum is normalized by the total configured weight so the result is always
 * on a 0-100 scale regardless of whether the weights sum to 100. When no component
 * carries a weight (weight-less component lists), falls back to raw score summation.
 */
export function weightedTotal(
  components: AssessmentComponent[],
  scores: Record<string, number | null | undefined>
): number | null {
  if (!components || components.length === 0) return null;

  // The denominator is the FULL configured structure weight — unrecorded
  // components contribute 0 but never shrink the scale, so partial entries
  // stay comparable (e.g. only CAs recorded on a 15/15/70 structure → /100).
  const totalWeight = components.reduce((acc, c) => acc + (Number(c.weight_percentage) || 0), 0);

  let weighted = 0;
  let hasAnyScore = false;

  for (const c of components) {
    const val = scores[c.code];
    if (val == null || isNaN(val)) continue;
    hasAnyScore = true;
    const w = Number(c.weight_percentage) || 0;
    if (c.max_score > 0) {
      weighted += Math.min(1, val / c.max_score) * w;
    }
  }

  if (!hasAnyScore) return null;

  if (totalWeight > 0) {
    // Normalized weighted score on a 0-100 scale.
    return Math.round((weighted / totalWeight) * 10000) / 100;
  }

  // No weights configured: raw summation on the component scale.
  let raw = 0;
  for (const c of components) {
    const val = scores[c.code];
    if (val != null && !isNaN(val)) raw += Number(val);
  }
  return Math.round(raw * 100) / 100;
}

/** Compute total score based on components and scores (0..100 weighted) */
export function computeDynamicTotalScore(
  components: AssessmentComponent[],
  scores: Record<string, number | null | undefined>
): number | null {
  return weightedTotal(components, scores);
}

/** Validate individual score entry against component maximum */
export function validateComponentScore(
  score: number | null | undefined,
  maxScore: number,
  componentCode: string
): string | null {
  if (score == null || isNaN(score)) return null;
  if (score < 0) return `${componentCode} score cannot be negative.`;
  if (score > maxScore) return `${componentCode} score (${score}) exceeds maximum (${maxScore}).`;
  return null;
}

/** Evaluate Grade Band matching a score against a dynamic grade scale */
export function gradeForDynamicScale(
  bands: (GradeBand & { grade_point?: number })[] | null | undefined,
  score: number | null | undefined
): (GradeBand & { grade_point?: number }) | null {
  if (score == null || isNaN(score) || !bands || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => score >= b.min) ?? null;
}
