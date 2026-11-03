import { describe, it, expect } from "vitest";
import {
  buildScoreMatrix,
  buildSubjectScoreMap,
  mergeBroadsheetScores,
  type ProcessedScoreRow,
  type CAScoreRow,
  type BroadSheetScoreRow,
} from "@/lib/broadsheet";
import { weightedTotal, gradeForDynamicScale, type AssessmentComponent } from "@/lib/assessment-config";

interface StudentRow { id: string; full_name: string; admission_no: string | null }
interface SubjectRow { id: string; name: string }

const compMax = (code: string): number =>
  code.toUpperCase().startsWith("EXAM") ? 70 : 15;

const componentsStandard: AssessmentComponent[] = [
  { id: "1", code: "CA1", name: "Continuous Assessment 1", max_score: 15, weight_percentage: 15, display_order: 1, is_mandatory: true },
  { id: "2", code: "CA2", name: "Continuous Assessment 2", max_score: 15, weight_percentage: 15, display_order: 2, is_mandatory: true },
  { id: "3", code: "EXAM", name: "Term Final Exam", max_score: 70, weight_percentage: 70, display_order: 3, is_mandatory: true },
];

function bs(partial: Partial<BroadSheetScoreRow>): BroadSheetScoreRow {
  return { student_id: "s1", subject_id: "math", ca1: null, ca2: null, ca3: null, exam_score: null, ...partial };
}

describe("buildScoreMatrix (Class Broadsheet Report source merging)", () => {
  it("gives raw broadsheet marks authoritative precedence over processed rows", () => {
    const processed: ProcessedScoreRow[] = [
      { student_id: "s1", subject_id: "math", ca1_score: 80, ca2_score: 80, ca3_score: null, exam_score: 80 },
    ];
    const broadsheet: BroadSheetScoreRow[] = [bs({ ca1: 12, ca2: 12, exam_score: 56 })];
    const matrix = buildScoreMatrix(processed, [], broadsheet, compMax);
    expect(matrix["s1"]["math"]["CA1"]).toBe(12);
    expect(matrix["s1"]["math"]["CA2"]).toBe(12);
    expect(matrix["s1"]["math"]["EXAM"]).toBe(56);
  });

  it("rescales processed 0-100% fallback back to the component scale", () => {
    const processed: ProcessedScoreRow[] = [
      { student_id: "s1", subject_id: "math", ca1_score: 80, ca2_score: 80, ca3_score: null, exam_score: 80 },
    ];
    const matrix = buildScoreMatrix(processed, [], [], compMax);
    expect(matrix["s1"]["math"]["CA1"]).toBe(12); // (80/100)*15
    expect(matrix["s1"]["math"]["EXAM"]).toBe(56); // (80/100)*70
  });

  it("rescales legacy normalized (max=100) CA rows to the component scale", () => {
    const ca: CAScoreRow[] = [
      { student_id: "s1", subject_id: "math", ca_type: "ca1", score: 80, max_score: 100, title: "[broadsheet] CA1" },
    ];
    const matrix = buildScoreMatrix([], ca, [], compMax);
    expect(matrix["s1"]["math"]["CA1"]).toBe(12); // 80% of 15
  });

  it("keeps zero marks as active scores and drops null/NaN entries", () => {
    const broadsheet: BroadSheetScoreRow[] = [bs({ ca1: 0, exam_score: null })];
    const matrix = buildScoreMatrix([], [], broadsheet, compMax);
    expect(matrix["s1"]["math"]["CA1"]).toBe(0);
    expect(matrix["s1"]["math"]["EXAM"]).toBeUndefined();
    expect(weightedTotal(componentsStandard, matrix["s1"]["math"])).toBe(0);
    expect(weightedTotal(componentsStandard, {})).toBeNull();
  });
});

describe("buildSubjectScoreMap + mergeBroadsheetScores (LevelSpecificReportCards)", () => {
  it("dedupes CA rows (synced [broadsheet] row preferred) and rescales legacy rows", () => {
    const ca: CAScoreRow[] = [
      { student_id: "s1", subject_id: "math", ca_type: "ca1", score: 2, max_score: 15, title: "Test", created_at: "2026-01-01" },
      { student_id: "s1", subject_id: "math", ca_type: "ca1", score: 80, max_score: 100, title: "[broadsheet] CA1", created_at: "2026-01-02" },
    ];
    const map = buildSubjectScoreMap(ca, componentsStandard);
    expect(map["math"]["CA1"]).toBe(12); // synced row (80% of 15), not the manual 2
  });

  it("merges authoritative broadsheet raw marks over CA rows", () => {
    const ca: CAScoreRow[] = [
      { student_id: "s1", subject_id: "math", ca_type: "ca1", score: 86.67, max_score: 100, title: "[broadsheet] CA1" },
    ];
    const map = buildSubjectScoreMap(ca, componentsStandard);
    const merged = mergeBroadsheetScores(map, [bs({ ca1: 12, exam_score: 56 })]);
    expect(merged["math"]["CA1"]).toBe(12);
    expect(merged["math"]["EXAM"]).toBe(56);
  });
});

describe("Consistency: report-card and broadsheet builders agree", () => {
  it("produces identical CA/EXAM values for the same published data", () => {
    const broadsheet: BroadSheetScoreRow[] = [bs({ ca1: 12, ca2: 13.5, exam_score: 56 })];
    const matrix = buildScoreMatrix([], [], broadsheet, compMax);
    const map = mergeBroadsheetScores(buildSubjectScoreMap([], componentsStandard), broadsheet);
    expect(matrix["s1"]["math"]).toEqual(map["math"]);
    expect(weightedTotal(componentsStandard, matrix["s1"]["math"])).toBe(81.5);
    expect(weightedTotal(componentsStandard, map["math"])).toBe(81.5);
  });
});

describe("Dynamic weighting & totals", () => {
  it("handles a structure with 3 CAs (10% + 10% + 10% + 70% Exam)", () => {
    const components3CA: AssessmentComponent[] = [
      { id: "1", code: "CA1", name: "CA1", max_score: 10, weight_percentage: 10, display_order: 1, is_mandatory: true },
      { id: "2", code: "CA2", name: "CA2", max_score: 10, weight_percentage: 10, display_order: 2, is_mandatory: true },
      { id: "3", code: "CA3", name: "CA3", max_score: 10, weight_percentage: 10, display_order: 3, is_mandatory: true },
      { id: "4", code: "EXAM", name: "Exam", max_score: 70, weight_percentage: 70, display_order: 4, is_mandatory: true },
    ];
    const total = weightedTotal(components3CA, { CA1: 8, CA2: 9, CA3: 7, EXAM: 49 });
    expect(total).toBe(73);
  });

  it("evaluates partial score when only CAs are recorded", () => {
    expect(weightedTotal(componentsStandard, { CA1: 15, CA2: 15 })).toBe(30);
  });
});

describe("Dynamic grading scale bands", () => {
  const standardScale = [
    { grade: "A", min: 70, max: 100, remark: "Distinction", grade_point: 5.0 },
    { grade: "B", min: 60, max: 69.99, remark: "Very Good", grade_point: 4.0 },
    { grade: "C", min: 50, max: 59.99, remark: "Credit", grade_point: 3.0 },
    { grade: "D", min: 45, max: 49.99, remark: "Pass", grade_point: 2.0 },
    { grade: "E", min: 40, max: 44.99, remark: "Weak Pass", grade_point: 1.0 },
    { grade: "F", min: 0, max: 39.99, remark: "Fail", grade_point: 0.0 },
  ];

  it("classifies at upper/lower thresholds", () => {
    expect(gradeForDynamicScale(standardScale, 100)?.grade).toBe("A");
    expect(gradeForDynamicScale(standardScale, 70)?.grade).toBe("A");
    expect(gradeForDynamicScale(standardScale, 69.99)?.grade).toBe("B");
    expect(gradeForDynamicScale(standardScale, 40)?.grade).toBe("E");
    expect(gradeForDynamicScale(standardScale, 0)?.grade).toBe("F");
  });

  it("maps a score of 0 to F rather than null", () => {
    const zeroGrade = gradeForDynamicScale(standardScale, 0);
    expect(zeroGrade?.grade).toBe("F");
    expect(zeroGrade?.grade_point).toBe(0);
  });

  it("returns null for null/undefined/NaN scores", () => {
    expect(gradeForDynamicScale(standardScale, null)).toBeNull();
    expect(gradeForDynamicScale(standardScale, undefined)).toBeNull();
    expect(gradeForDynamicScale(standardScale, NaN)).toBeNull();
  });
});

describe("Student filtering & search", () => {
  const students: StudentRow[] = [
    { id: "1", full_name: "Chidera Okafor", admission_no: "ADM/2026/001" },
    { id: "2", full_name: "Amina Bello", admission_no: "ADM/2026/002" },
    { id: "3", full_name: "Grace Emmanuel", admission_no: null },
  ];

  function filterStudents(list: StudentRow[], query: string): StudentRow[] {
    if (!query.trim()) return list;
    const q = query.toLowerCase().trim();
    return list.filter((s) => s.full_name.toLowerCase().includes(q) || s.admission_no?.toLowerCase().includes(q));
  }

  it("filters by name case-insensitively and by admission number", () => {
    expect(filterStudents(students, "chidera")).toHaveLength(1);
    expect(filterStudents(students, "002")).toHaveLength(1);
  });

  it("handles null admission numbers and empty queries", () => {
    expect(filterStudents(students, "Grace")).toHaveLength(1);
    expect(filterStudents(students, "   ")).toHaveLength(3);
    expect(filterStudents(students, "nonexistent")).toHaveLength(0);
  });
});

describe("Export payload structure", () => {
  const sampleSubjects: SubjectRow[] = [
    { id: "sub-1", name: "Mathematics" },
    { id: "sub-2", name: "English Language" },
  ];
  const sampleComponents: AssessmentComponent[] = componentsStandard;

  it("builds dual-row headers with per-subject component/total/grade columns", () => {
    const headerRow1: string[] = ["Admission No", "Student Name"];
    const headerRow2: string[] = ["", ""];
    sampleSubjects.forEach((sub) => {
      sampleComponents.forEach((c) => { headerRow1.push(sub.name); headerRow2.push(c.code); });
      headerRow1.push(sub.name); headerRow2.push("Total");
      headerRow1.push(sub.name); headerRow2.push("Grade");
    });
    headerRow1.push("Summary"); headerRow2.push("Average (%)");
    expect(headerRow1).toHaveLength(13);
    expect(headerRow2).toHaveLength(13);
    expect(headerRow1[2]).toBe("Mathematics");
    expect(headerRow2[2]).toBe("CA1");
    expect(headerRow2[5]).toBe("Total");
  });
});