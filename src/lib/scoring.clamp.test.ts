/**
 * Documents the gradeFor out-of-range policy:
 *   - negative percentages → null (invalid input, never mapped)
 *   - >100 percentages    → clamped into the top band (highest min ≤ score),
 *                           which lets bonus marks still receive the highest grade
 *   - selection is deterministic across repeated calls and across band orderings
 */
import { describe, it, expect } from "vitest";
import { gradeFor, DEFAULT_SETTINGS, type SchoolSettings } from "./scoring";

const s: SchoolSettings = DEFAULT_SETTINGS;

describe("gradeFor — out-of-range policy", () => {
  describe("negative percentages return null", () => {
    for (const p of [-0.0001, -1, -50, -100, -Number.MIN_VALUE]) {
      it(`returns null for ${p}`, () => {
        expect(gradeFor(s, p)).toBeNull();
      });
    }
  });

  describe(">100 percentages clamp into the top band", () => {
    for (const p of [100.0001, 101, 120, 150, 999, 1e6]) {
      it(`maps ${p} to the top band ("A")`, () => {
        expect(gradeFor(s, p)?.grade).toBe("A");
      });
    }

    it("does not return null for any finite super-100 score", () => {
      for (const p of [101, 200, 500]) {
        expect(gradeFor(s, p)).not.toBeNull();
      }
    });

    it("works when the top band is custom", () => {
      const custom: SchoolSettings = {
        ...s,
        grading_scale: [
          { grade: "DISTINCTION", min: 75, max: 100, remark: "" },
          { grade: "PASS", min: 40, max: 74, remark: "" },
          { grade: "FAIL", min: 0, max: 39, remark: "" },
        ],
      };
      expect(gradeFor(custom, 110)?.grade).toBe("DISTINCTION");
      expect(gradeFor(custom, 1000)?.grade).toBe("DISTINCTION");
    });
  });

  describe("deterministic selection", () => {
    it("returns the same band across repeated calls (negative)", () => {
      const a = gradeFor(s, -5);
      const b = gradeFor(s, -5);
      expect(a).toEqual(b);
    });

    it("returns the same band across repeated calls (above 100)", () => {
      for (const p of [101, 250, 9999]) {
        const a = gradeFor(s, p);
        const b = gradeFor(s, p);
        expect(a?.grade).toBe(b?.grade);
      }
    });

    it("does not mutate the input grading_scale ordering", () => {
      const scale = [
        { grade: "A", min: 70, max: 100, remark: "" },
        { grade: "B", min: 60, max: 69, remark: "" },
        { grade: "F", min: 0, max: 59, remark: "" },
      ];
      const before = scale.map((b) => b.grade);
      const settings: SchoolSettings = { ...s, grading_scale: scale };
      gradeFor(settings, 200);
      gradeFor(settings, -10);
      gradeFor(settings, 65);
      expect(scale.map((b) => b.grade)).toEqual(before);
    });

    it("non-finite inputs (NaN, Infinity) do not throw", () => {
      // Policy: NaN behaves like an invalid comparison and returns null;
      // +Infinity is treated as an above-100 score (top band);
      // -Infinity is treated as a negative score (null).
      expect(() => gradeFor(s, Number.NaN)).not.toThrow();
      expect(gradeFor(s, Number.NaN)).toBeNull();
      expect(gradeFor(s, Number.POSITIVE_INFINITY)?.grade).toBe("A");
      expect(gradeFor(s, Number.NEGATIVE_INFINITY)).toBeNull();
    });
  });
});
