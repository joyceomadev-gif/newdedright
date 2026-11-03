import { describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { fetchAdminRoleRows } from "@/lib/admin-role-rows";

describe("complete administration role reads", () => {
  it("reads every assigned role beyond the 1,000-row API limit", async () => {
    const records = Array.from({ length: 1418 }, (_, index) => ({
      id: String(index), user_id: `user-${index}`, role: "student",
    }));
    const ranges: number[][] = [];
    from.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(async (start: number, end: number) => {
          ranges.push([start, end]);
          return { data: records.slice(start, end + 1), error: null };
        }),
      };
      return query;
    });
    const roles = await fetchAdminRoleRows();
    expect(roles).toHaveLength(1418);
    expect(roles.at(-1)?.user_id).toBe("user-1417");
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(from).toHaveBeenCalledWith("user_roles");
  });
});