import { describe, it, expect } from "vitest";
import {
  computeDynamicTotalScore,
  validateComponentScore,
  gradeForDynamicScale,
  AssessmentComponent,
} from "./assessment-config";

describe("Configurable Assessment & Grading Helpers", () => {
  const components: AssessmentComponent[] = [
    { id: "1", code: "CA1", name: "Continuous Assessment 1", max_score: 15, weight_percentage: 15, display_order: 1, is_mandatory: true },
    { id: "2", code: "PRACTICAL", name: "Practical Exam", max_score: 20, weight_percentage: 20, display_order: 2, is_mandatory: true },
    { id: "3", code: "EXAM", name: "Term Final Exam", max_score: 65, weight_percentage: 65, display_order: 3, is_mandatory: true },
  ];

  describe("computeDynamicTotalScore", () => {
    it("returns null when no components or no scores are provided", () => {
      expect(computeDynamicTotalScore([], { CA1: 10 })).toBeNull();
      expect(computeDynamicTotalScore(components, {})).toBeNull();
    });

    it("correctly computes weighted total score summing to 100%", () => {
      // CA1: 15/15 (15%), Practical: 20/20 (20%), Exam: 65/65 (65%) -> 100%
      const total = computeDynamicTotalScore(components, {
        CA1: 15,
        PRACTICAL: 20,
        EXAM: 65,
      });
      expect(total).toBe(100);
    });

    it("correctly computes partial weighted scores", () => {
      // CA1: 10/15 -> (10/15)*15 = 10%
      // Practical: 10/20 -> (10/20)*20 = 10%
      // Exam: 32.5/65 -> (32.5/65)*65 = 32.5%
      // Total = 10 + 10 + 32.5 = 52.5
      const total = computeDynamicTotalScore(components, {
        CA1: 10,
        PRACTICAL: 10,
        EXAM: 32.5,
      });
      expect(total).toBe(52.5);
    });
  });

  describe("validateComponentScore", () => {
    it("passes valid scores within [0, maxScore]", () => {
      expect(validateComponentScore(10, 15, "CA1")).toBeNull();
      expect(validateComponentScore(0, 15, "CA1")).toBeNull();
      expect(validateComponentScore(15, 15, "CA1")).toBeNull();
    });

    it("returns error message when score exceeds maxScore", () => {
      const err = validateComponentScore(18, 15, "CA1");
      expect(err).toContain("exceeds maximum");
    });

    it("returns error message when score is negative", () => {
      const err = validateComponentScore(-5, 15, "CA1");
      expect(err).toContain("cannot be negative");
    });
  });

  describe("gradeForDynamicScale", () => {
    const bands = [
      { grade: "A", min: 70, max: 100, grade_point: 5.0, remark: "Excellent" },
      { grade: "B", min: 60, max: 69.99, grade_point: 4.0, remark: "Very Good" },
      { grade: "C", min: 50, max: 59.99, grade_point: 3.0, remark: "Good" },
      { grade: "F", min: 0, max: 49.99, grade_point: 0.0, remark: "Fail" },
    ];

    it("returns matching grade band for a score", () => {
      const gA = gradeForDynamicScale(bands, 75);
      expect(gA?.grade).toBe("A");
      expect(gA?.grade_point).toBe(5.0);

      const gB = gradeForDynamicScale(bands, 65);
      expect(gB?.grade).toBe("B");
      expect(gB?.grade_point).toBe(4.0);

      const gF = gradeForDynamicScale(bands, 30);
      expect(gF?.grade).toBe("F");
      expect(gF?.grade_point).toBe(0.0);
    });

    it("returns null for invalid or missing scores", () => {
      expect(gradeForDynamicScale(bands, null)).toBeNull();
    });
  });
});
