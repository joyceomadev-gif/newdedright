import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { listRecycleBin } from "@/lib/soft-delete";

describe("Complete Recycle Bin reads", () => {
  it("returns all 1,235 students beyond the 1,000-row API cap in stable order", async () => {
    const records = Array.from({ length: 1235 }, (_, i) => ({table_name:"students",record_id:String(i)}));
    const ranges: number[][] = [];
    rpc.mockImplementation(() => {
      const query = {
        order: vi.fn(() => query),
        range: vi.fn(async (start:number,end:number) => {
          ranges.push([start,end]);
          return {data:records.slice(start,end + 1),error:null};
        }),
      };
      return query;
    });
    const result = await listRecycleBin("students");
    expect(result).toHaveLength(1235);
    expect(result.at(-1)?.record_id).toBe("1234");
    expect(ranges).toEqual([[0,499],[500,999],[1000,1499]]);
  });
});