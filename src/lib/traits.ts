import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Rating = "M" | "SP" | "P" | "NA";
export const RATING_COLUMNS: Rating[] = ["M", "SP", "P", "NA"];
export const RATING_LABEL: Record<Rating, string> = {
  M: "Mastered",
  SP: "Strongly Progressing",
  P: "Progressing",
  NA: "Needs Attention",
};

export type TraitGroup = {
  id: string;
  title: string;
  items: Array<{ id: string; label: string; rating: Rating | null }>;
};

/**
 * Loads all trait categories + items, joined with the student's ratings for a
 * given term. Returns groups in display order with each item's current rating
 * (or null if the teacher hasn't rated it yet).
 */
export function useStudentTraitGroups(studentId: string | null | undefined, termId: string | null | undefined) {
  return useQuery({
    queryKey: ["student-trait-groups", studentId, termId],
    enabled: !!studentId && !!termId,
    queryFn: async (): Promise<TraitGroup[]> => {
      const [catsRes, itemsRes, ratingsRes] = await Promise.all([
        supabase.from("trait_categories").select("id,name,display_order").order("display_order"),
        supabase.from("trait_items").select("id,category_id,label,display_order").order("display_order"),
        supabase
          .from("student_trait_ratings")
          .select("trait_item_id,rating")
          .eq("student_id", studentId!)
          .eq("term_id", termId!),
      ]);
      if (catsRes.error) throw catsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (ratingsRes.error) throw ratingsRes.error;

      const ratingMap = new Map<string, Rating>();
      (ratingsRes.data ?? []).forEach((r: { trait_item_id: string; rating: Rating }) =>
        ratingMap.set(r.trait_item_id, r.rating),
      );

      return (catsRes.data ?? []).map((c) => ({
        id: c.id as string,
        title: c.name as string,
        items: (itemsRes.data ?? [])
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id as string,
            label: i.label as string,
            rating: ratingMap.get(i.id as string) ?? null,
          })),
      }));
    },
    // Trait ratings rarely change mid-session; cache aggressively so switching
    // between terms / report cards re-uses data without re-hitting the DB.
    staleTime: 5 * 60 * 1000,        // 5 min — considered fresh
    gcTime: 30 * 60 * 1000,          // 30 min — keep in memory after unmount
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData, // smooth swap on student/term change
  });
}
