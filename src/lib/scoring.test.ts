import { describe, it, expect } from "vitest";
import {
  computeTermTotal,
  computeCumulative,
  gradeFor,
  validateSettings,
  DEFAULT_SETTINGS,
  type SchoolSettings,
} from "./scoring";

const base: SchoolSettings = { ...DEFAULT_SETTINGS };

describe("computeTermTotal", () => {
  it("weighted_ca_exam: applies CA1/CA2/Exam weights", () => {
    // 80*15 + 90*15 + 70*70 = 1200 + 1350 + 4900 = 7450 / 100 = 74.5
    const r = computeTermTotal(base, { caScoresPct: [80, 90], examScorePct: 70 });
    expect(r).toBe(74.5);
  });

  it("weighted_ca_exam: missing parts treated as 0", () => {
    // 80*15 + 0 + 70*70 = 1200 + 4900 = 6100 / 100 = 61
    const r = computeTermTotal(base, { caScoresPct: [80], examScorePct: 70 });
    expect(r).toBe(61);
  });

  it("weighted_ca_exam: returns null when nothing recorded", () => {
    expect(computeTermTotal(base, { caScoresPct: [], examScorePct: null })).toBeNull();
  });

  it("running_average: averages all CA + exam scores", () => {
    const s = { ...base, scoring_scheme: "running_average" as const };
    expect(computeTermTotal(s, { caScoresPct: [60, 80], examScorePct: 70 })).toBe(70);
    expect(computeTermTotal(s, { caScoresPct: [50], examScorePct: null })).toBe(50);
    expect(computeTermTotal(s, { caScoresPct: [], examScorePct: null })).toBeNull();
  });

  it("display_only: always null", () => {
    const s = { ...base, scoring_scheme: "display_only" as const };
    expect(computeTermTotal(s, { caScoresPct: [80, 90], examScorePct: 70 })).toBeNull();
  });
});

describe("computeCumulative", () => {
  it("average_of_terms: averages non-null term totals", () => {
    expect(computeCumulative(base, [60, 80, 70])).toBe(70);
    expect(computeCumulative(base, [60, null, 80])).toBe(70);
  });

  it("sum_of_terms: sums non-null term totals", () => {
    const s = { ...base, cumulative_method: "sum_of_terms" as const };
    expect(computeCumulative(s, [60, 80, 70])).toBe(210);
    expect(computeCumulative(s, [60, null, 80])).toBe(140);
  });

  it("returns null when no totals or display_only", () => {
    expect(computeCumulative(base, [null, null])).toBeNull();
    const s = { ...base, scoring_scheme: "display_only" as const };
    expect(computeCumulative(s, [70, 80])).toBeNull();
  });
});

describe("gradeFor", () => {
  it("maps percentages to bands", () => {
    expect(gradeFor(base, 95)?.grade).toBe("A");
    expect(gradeFor(base, 70)?.grade).toBe("A");
    expect(gradeFor(base, 65)?.grade).toBe("B");
    expect(gradeFor(base, 50)?.grade).toBe("C");
    expect(gradeFor(base, 47)?.grade).toBe("D");
    expect(gradeFor(base, 40)?.grade).toBe("E");
    expect(gradeFor(base, 10)?.grade).toBe("F");
  });
  it("returns null for null score", () => {
    expect(gradeFor(base, null)).toBeNull();
  });
});

describe("validateSettings", () => {
  it("passes for default settings", () => {
    expect(validateSettings(base)).toBeNull();
  });

  it("fails when weighted weights don't sum to 100", () => {
    const s = { ...base, ca1_weight: 10, ca2_weight: 10, exam_weight: 70 };
    expect(validateSettings(s)).toMatch(/sum to 100/);
  });

  it("fails on negative weight under weighted scheme", () => {
    const s = { ...base, ca1_weight: -5, ca2_weight: 35, exam_weight: 70 };
    expect(validateSettings(s)).toMatch(/negative/);
  });

  it("ignores weight rules for running_average and display_only", () => {
    const ra = { ...base, scoring_scheme: "running_average" as const, ca1_weight: 0, ca2_weight: 0, exam_weight: 0 };
    expect(validateSettings(ra)).toBeNull();
    const dz = { ...base, scoring_scheme: "display_only" as const, ca1_weight: 1, ca2_weight: 2, exam_weight: 3 };
    expect(validateSettings(dz)).toBeNull();
  });

  it("rejects invalid promotion average", () => {
    expect(validateSettings({ ...base, promotion_min_average: 150 })).toMatch(/Promotion/);
  });

  it("rejects invalid grading band", () => {
    const s = { ...base, grading_scale: [{ grade: "X", min: 50, max: 10, remark: "" }] };
    expect(validateSettings(s)).toMatch(/Invalid grade band/);
  });
});
