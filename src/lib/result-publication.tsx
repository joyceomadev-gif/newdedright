import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";

export type ResultKey = {
  session_id: string | undefined | null;
  term_id: string | undefined | null;
  class_id: string | undefined | null;
  exam_type?: string;
};

/**
 * Returns whether processed results for the given scope are published to
 * students / parents. Checks BOTH:
 *   1. `result_publications` table via `is_result_published` RPC (set by Reports → Publish tab)
 *   2. `report_cards.published` column (set by Academics → Report Cards "Publish all" button)
 *
 * This dual check ensures the gate opens regardless of which publish button the admin used.
 */
export function useResultsPublished(key: ResultKey) {
  const { session_id, term_id, class_id } = key;
  const exam_type = key.exam_type ?? "combined";
  return useQuery({
    queryKey: ["result-published", session_id, term_id, class_id, exam_type],
    enabled: !!session_id && !!term_id && !!class_id,
    queryFn: async () => {
      // Check 1: result_publications table (the formal approval/publish workflow)
      const { data: rpcPublished, error: rpcError } = await supabase.rpc("is_result_published", {
        _session_id: session_id!,
        _term_id: term_id!,
        _class_id: class_id!,
        _exam_type: exam_type,
      });
      if (rpcError) throw rpcError;
      if (Boolean(rpcPublished)) return true;

      // Check 2: report_cards table (the "Publish all" shortcut in Academics tab)
      // Use select without head:true for reliable RLS-compatible counting
      const { data: cards, error: rcError } = await supabase
        .from("report_cards")
        .select("id", { count: "exact" })
        .eq("term_id", term_id!)
        .eq("class_id", class_id!)
        .eq("published", true)
        .limit(1);
      if (rcError) throw rcError;
      return (cards?.length ?? 0) > 0;
    },
    staleTime: 30_000,
  });
}

export function ResultsNotPublishedNotice({
  title = "Results not yet published",
  hint = "Your school has not published this term's results yet. Please check back later.",
}: { title?: string; hint?: string }) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{hint}</p>
    </Card>
  );
}
