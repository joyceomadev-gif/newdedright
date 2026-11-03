import { describe, it, expect } from "vitest";
import { gradeFor, DEFAULT_SETTINGS, type SchoolSettings } from "./scoring";

const s: SchoolSettings = DEFAULT_SETTINGS;

describe("gradeFor — boundary mapping", () => {
  // Default bands: A 70-100, B 60-69, C 50-59, D 45-49, E 40-44, F 0-39
  const cases: Array<[number, string]> = [
    [100, "A"], [70, "A"], [70.0, "A"],
    [69, "B"], [69.99, "B"], [60, "B"],
    [59, "C"], [50, "C"],
    [49, "D"], [45, "D"],
    [44, "E"], [40, "E"],
    [39, "F"], [0, "F"],
  ];
  for (const [pct, expected] of cases) {
    it(`maps ${pct}% -> ${expected}`, () => {
      expect(gradeFor(s, pct)?.grade).toBe(expected);
    });
  }

  it("returns null for null input", () => {
    expect(gradeFor(s, null)).toBeNull();
  });

  it("returns null for negative scores", () => {
    expect(gradeFor(s, -1)).toBeNull();
    expect(gradeFor(s, -0.01)).toBeNull();
  });

  it("clamps above-100 scores into the top band (handles bonus marks)", () => {
    expect(gradeFor(s, 101)?.grade).toBe("A");
    expect(gradeFor(s, 200)?.grade).toBe("A");
  });

  it("handles fractional values inside a band", () => {
    expect(gradeFor(s, 65.5)?.grade).toBe("B");
    expect(gradeFor(s, 49.4)?.grade).toBe("D");
    expect(gradeFor(s, 39.999)?.grade).toBe("F");
  });

  it("respects custom grading scales", () => {
    const custom: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "PASS", min: 50, max: 100, remark: "" },
        { grade: "FAIL", min: 0, max: 49, remark: "" },
      ],
    };
    expect(gradeFor(custom, 50)?.grade).toBe("PASS");
    expect(gradeFor(custom, 49)?.grade).toBe("FAIL");
  });
});

describe("gradeFor — reordering and overlapping bands", () => {
  it("is order-insensitive: shuffled bands map identically to sorted bands", () => {
    const ordered: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "A", min: 70, max: 100, remark: "" },
        { grade: "B", min: 60, max: 69, remark: "" },
        { grade: "C", min: 50, max: 59, remark: "" },
        { grade: "F", min: 0, max: 49, remark: "" },
      ],
    };
    const shuffled: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "C", min: 50, max: 59, remark: "" },
        { grade: "F", min: 0, max: 49, remark: "" },
        { grade: "A", min: 70, max: 100, remark: "" },
        { grade: "B", min: 60, max: 69, remark: "" },
      ],
    };
    for (const p of [0, 25, 49, 50, 59, 60, 69, 70, 99, 100]) {
      expect(gradeFor(shuffled, p)?.grade).toBe(gradeFor(ordered, p)?.grade);
    }
  });

  it("on overlapping bands, picks the band with the highest min ≤ score (lower-bound match)", () => {
    const overlapping: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "BROAD", min: 50, max: 100, remark: "" },
        { grade: "TIGHT", min: 70, max: 100, remark: "" },
        { grade: "LOW", min: 0, max: 100, remark: "" },
      ],
    };
    expect(gradeFor(overlapping, 80)?.grade).toBe("TIGHT"); // highest min ≤ 80
    expect(gradeFor(overlapping, 70)?.grade).toBe("TIGHT");
    expect(gradeFor(overlapping, 69)?.grade).toBe("BROAD");
    expect(gradeFor(overlapping, 50)?.grade).toBe("BROAD");
    expect(gradeFor(overlapping, 49)?.grade).toBe("LOW");
    expect(gradeFor(overlapping, 0)?.grade).toBe("LOW");
  });

  it("ignores inconsistent max values (mapping is min-driven)", () => {
    // Bands have nonsensical max values that overlap or invert; gradeFor
    // must still pick by the highest min ≤ score and never return null for
    // an in-range percentage.
    const messy: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "TOP", min: 80, max: 50, remark: "" },   // max < min
        { grade: "MID", min: 50, max: 200, remark: "" },  // max > 100
        { grade: "BOT", min: 0, max: 49, remark: "" },
      ],
    };
    expect(gradeFor(messy, 95)?.grade).toBe("TOP");
    expect(gradeFor(messy, 80)?.grade).toBe("TOP");
    expect(gradeFor(messy, 79)?.grade).toBe("MID");
    expect(gradeFor(messy, 50)?.grade).toBe("MID");
    expect(gradeFor(messy, 10)?.grade).toBe("BOT");
  });

  it("returns null when no band has min ≤ score", () => {
    const noFloor: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "HI", min: 90, max: 100, remark: "" },
        { grade: "MD", min: 50, max: 89, remark: "" },
      ],
    };
    expect(gradeFor(noFloor, 25)).toBeNull();
    expect(gradeFor(noFloor, 49.99)).toBeNull();
    expect(gradeFor(noFloor, 50)?.grade).toBe("MD");
  });

  it("returns null when grading_scale is empty", () => {
    const empty: SchoolSettings = { ...s, grading_scale: [] };
    expect(gradeFor(empty, 75)).toBeNull();
  });

  it("handles duplicate bands at the same min (first match in sorted order wins, deterministically)", () => {
    const dupes: SchoolSettings = {
      ...s,
      grading_scale: [
        { grade: "DUP1", min: 60, max: 100, remark: "" },
        { grade: "DUP2", min: 60, max: 100, remark: "" },
        { grade: "F",    min: 0,  max: 59,  remark: "" },
      ],
    };
    const g = gradeFor(dupes, 75)?.grade;
    expect(["DUP1", "DUP2"]).toContain(g);
    // And it's stable across calls
    expect(gradeFor(dupes, 75)?.grade).toBe(g);
  });
});
