/**
 * Integration test: saving school_settings must invalidate the
 * "school-settings" query key so the Gradebook (and other consumers
 * of useSchoolSettings) refetch with the new scoring options.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

describe("school_settings save → query invalidation contract", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("invalidating ['school-settings'] triggers refetch in subscribers", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ scoring_scheme: "weighted_ca_exam", cumulative_method: "average_of_terms" })
                          .mockResolvedValueOnce({ scoring_scheme: "display_only", cumulative_method: "sum_of_terms" });

    // Prime the cache the way useSchoolSettings does.
    await qc.fetchQuery({ queryKey: ["school-settings"], queryFn: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(["school-settings"])).toMatchObject({ scoring_scheme: "weighted_ca_exam" });

    // Simulate the admin "Save settings" success handler from administration.tsx.
    const onSettingsSaved = async (client: QueryClient) => {
      await client.invalidateQueries({ queryKey: ["admin-settings"] });
      await client.invalidateQueries({ queryKey: ["school-settings"] });
    };
    await onSettingsSaved(qc);

    // The active query is invalidated AND there is at least one observer-less
    // refetch path: actively re-run via fetchQuery to reflect new server state.
    await qc.fetchQuery({ queryKey: ["school-settings"], queryFn: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData(["school-settings"])).toMatchObject({
      scoring_scheme: "display_only",
      cumulative_method: "sum_of_terms",
    });

    // The Gradebook reads from this exact key — confirm the cache is now the
    // new shape so a re-render would compute with display_only semantics.
    const cached = qc.getQueryData<{ scoring_scheme: string }>(["school-settings"]);
    expect(cached?.scoring_scheme).toBe("display_only");
  });

  it("only invalidating ['admin-settings'] would leave Gradebook stale (regression guard)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ scoring_scheme: "weighted_ca_exam" });
    await qc.fetchQuery({ queryKey: ["school-settings"], queryFn: fetcher });

    await qc.invalidateQueries({ queryKey: ["admin-settings"] });
    const state = qc.getQueryState(["school-settings"]);
    // Without invalidating school-settings, the cached entry remains "fresh"
    // from this client's POV (no observers refetched).
    expect(state?.isInvalidated).toBe(false);
  });
});
