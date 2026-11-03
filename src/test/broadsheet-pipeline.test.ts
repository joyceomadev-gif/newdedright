import { describe, it, expect } from "vitest";
import {
  buildResultsCardRows,
  resolveExamFallback,
  buildCaScoreMap,
  dedupeCaRows,
  pickPreferredRow,
  type PortalCaRow,
  type PortalExamRow,
  type BroadSheetScoreRow,
  type CAScoreRow,
} from "@/lib/broadsheet";
import { weightedTotal, type AssessmentComponent } from "@/lib/assessment-config";
import { pct } from "@/lib/scoring";

const ALL_SUBJECTS = [{ id: "math", name: "Mathematics" }];
const SETTINGS = { ca1_weight: 15, ca2_weight: 15, exam_weight: 70, grading_scale: [] as never[] };

function portalCa(
  partial: Partial<PortalCaRow> & { score: number; ca_type: string }
): PortalCaRow {
  return {
    max_score: partial.ca_type === "exam" ? 70 : 15,
    subject: { id: "math", name: "Mathematics" },
    ...partial,
  };
}

function bsRow(partial: Partial<BroadSheetScoreRow>): BroadSheetScoreRow {
  return { student_id: "st1", subject_id: "math", ca1: null, ca2: null, ca3: null, exam_score: null, ...partial };
}

describe("Student Portal Results Card (buildResultsCardRows)", () => {
  it("scales raw broadsheet CA marks against the component max and sets exam_max", () => {
    const caRows: PortalCaRow[] = [
      portalCa({ score: 12, ca_type: "ca1" }),
      portalCa({ score: 13.5, ca_type: "ca2" }),
      portalCa({ score: 56, ca_type: "exam" }),
    ];
    const rows = buildResultsCardRows({
      caRows,
      examRows: [],
      bsRows: [],
      allSubjects: ALL_SUBJECTS,
      settings: SETTINGS,
      structure: null,
      gradingBands: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].ca1).toBe(8); // 12/15 * 10
    expect(rows[0].ca2).toBe(9); // 13.5/15 * 10
    expect(rows[0].exam).toBe(56);
    expect(rows[0].exam_max).toBe(70);
    // (8/10)*15 + (9/10)*15 + (56/70)*70 = 12 + 13.5 + 56 = 81.5
    expect(rows[0].total).toBe(81.5);
  });

  it("handles legacy normalized (max=100) CA rows consistently", () => {
    const caRows: PortalCaRow[] = [portalCa({ score: 80, max_score: 100, ca_type: "ca1" })];
    const rows = buildResultsCardRows({
      caRows,
      examRows: [],
      bsRows: [],
      allSubjects: ALL_SUBJECTS,
      settings: SETTINGS,
      structure: null,
      gradingBands: null,
    });
    // 80% of 15 marks = 12 → scaled to 8/10, contributing 12 points
    expect(rows[0].ca1).toBe(8);
    expect(rows[0].total).toBe(12);
  });

  it("falls back to the raw broadsheet exam with the structure/settings max", () => {
    const caRows: PortalCaRow[] = [portalCa({ score: 12, ca_type: "ca1" })];
    const bsRows: BroadSheetScoreRow[] = [bsRow({ exam_score: 56 })];
    const rows = buildResultsCardRows({
      caRows,
      examRows: [],
      bsRows,
      allSubjects: ALL_SUBJECTS,
      settings: SETTINGS,
      structure: null,
      gradingBands: null,
    });
    expect(rows[0].exam).toBe(56);
    expect(rows[0].exam_max).toBe(70);
    expect(rows[0].total).toBe(68); // 12 + (56/70)*70
  });

  it("uses the resolved structure's weights/maxes when present (I6)", () => {
    const structure = {
      components: [
        { id: "1", code: "CA1", name: "CA1", max_score: 20, weight_percentage: 10, display_order: 1, is_mandatory: true },
        { id: "2", code: "CA2", name: "CA2", max_score: 20, weight_percentage: 10, display_order: 2, is_mandatory: true },
        { id: "3", code: "EXAM", name: "Exam", max_score: 60, weight_percentage: 80, display_order: 3, is_mandatory: true },
      ],
    };
    const caRows: PortalCaRow[] = [
      portalCa({ score: 12, max_score: 20, ca_type: "ca1" }),
      portalCa({ score: 48, max_score: 60, ca_type: "exam" }),
    ];
    const rows = buildResultsCardRows({
      caRows,
      examRows: [],
      bsRows: [],
      allSubjects: ALL_SUBJECTS,
      settings: SETTINGS, // deliberately 15/15/70 — must be ignored when a structure exists
      structure,
      gradingBands: null,
    });
    expect(rows[0].ca1).toBe(6); // (12/20)*10
    expect(rows[0].exam_max).toBe(60);
    expect(rows[0].total).toBe(70); // (6/10)*10 + (48/60)*80 = 6 + 64
  });

  it("prefers the synced [broadsheet] row over a manual row for the same CA (I5)", () => {
    const caRows: PortalCaRow[] = [
      portalCa({ score: 2, ca_type: "ca1", title: "Test", created_at: "2026-01-01" }),
      portalCa({ score: 12, ca_type: "ca1", title: "[broadsheet] CA1", created_at: "2026-01-02" }),
    ];
    const rows = buildResultsCardRows({
      caRows,
      examRows: [],
      bsRows: [],
      allSubjects: ALL_SUBJECTS,
      settings: SETTINGS,
      structure: null,
      gradingBands: null,
    });
    expect(rows[0].ca1).toBe(8); // 12/15*10, not 2/15*10
  });

  it("lets a published CBT result override the synced exam row", () => {
    const caRows: PortalCaRow[] = [portalCa({ score: 56, ca_type: "exam" })];
    const examRows: PortalExamRow[] = [
      {
        score: 60,
        grade: "B",
        remark: "Very Good",
        exam: { max_score: 70, subject: { id: "math", name: "Mathematics" } },
      },
    ];
    const rows = buildResultsCardRows({
      caRows,
      examRows,
      bsRows: [],
      allSubjects: ALL_SUBJECTS,
      settings: SETTINGS,
      structure: null,
      gradingBands: null,
    });
    expect(rows[0].exam).toBe(60);
    expect(rows[0].exam_max).toBe(70);
    expect(rows[0].grade).toBe("B");
  });
});

describe("resolveExamFallback (ProcessResultsPanel exam precedence)", () => {
  const caRows: CAScoreRow[] = [{ student_id: "st1", subject_id: "math", ca_type: "exam", score: 56, max_score: 70, title: "[broadsheet] Exam" }];

  it("prefers the CBT/published result", () => {
    const r = resolveExamFallback({ result: { score: 60 }, examMaxFromExam: 70, examCARows: caRows, bsExam: 45, componentMaxExam: 70 });
    expect(r).toEqual({ examRawScore: 60, examMax: 70 });
  });

  it("falls back to the synced exam CA row with its stored max", () => {
    const r = resolveExamFallback({ result: null, examMaxFromExam: undefined, examCARows: caRows, bsExam: null, componentMaxExam: 70 });
    expect(r).toEqual({ examRawScore: 56, examMax: 70 });
  });

  it("falls back to the raw broadsheet exam on the component scale", () => {
    const r = resolveExamFallback({ result: null, examMaxFromExam: undefined, examCARows: [], bsExam: 45, componentMaxExam: 90 });
    expect(r).toEqual({ examRawScore: 45, examMax: 90 });
  });

  it("returns null when no source exists", () => {
    const r = resolveExamFallback({ result: null, examMaxFromExam: undefined, examCARows: [], bsExam: null, componentMaxExam: 70 });
    expect(r).toEqual({ examRawScore: null, examMax: 0 });
  });
});

describe("buildCaScoreMap (ProcessResultsPanel dynamic path)", () => {
  const componentMax = (code: string) => (code.toUpperCase().startsWith("EXAM") ? 70 : 15);

  it("rescales legacy max=100 rows to the component scale", () => {
    const map = buildCaScoreMap(
      [{ student_id: "s", subject_id: "m", ca_type: "ca1", score: 80, max_score: 100, title: "[broadsheet] CA1" }],
      componentMax
    );
    expect(map["CA1"]).toBe(12); // 80% of 15
  });

  it("keeps raw component-scale rows untouched and dedupes by ca_type", () => {
    const map = buildCaScoreMap(
      [
        { student_id: "s", subject_id: "m", ca_type: "ca1", score: 2, max_score: 15, title: "Test", created_at: "2026-01-01" },
        { student_id: "s", subject_id: "m", ca_type: "ca1", score: 12, max_score: 15, title: "[broadsheet] CA1", created_at: "2026-01-02" },
      ],
      componentMax
    );
    expect(map["CA1"]).toBe(12);
  });
});

describe("dedupeCaRows / pickPreferredRow (I5 policy)", () => {
  it("prefers the [broadsheet]-titled row over manual rows", () => {
    const picked = pickPreferredRow([
      { title: "Test", created_at: "2026-01-03" },
      { title: "[broadsheet] CA1", created_at: "2026-01-01" },
    ]);
    expect(picked?.title).toBe("[broadsheet] CA1");
  });

  it("falls back to the most recently created row", () => {
    const picked = pickPreferredRow([
      { title: "Test A", created_at: "2026-01-01" },
      { title: "Test B", created_at: "2026-02-01" },
    ]);
    expect(picked?.title).toBe("Test B");
  });

  it("dedupeCaRows returns one row per (subject, ca_type)", () => {
    const deduped = dedupeCaRows([
      { student_id: "s", subject_id: "m", ca_type: "ca1", title: "Test" },
      { student_id: "s", subject_id: "m", ca_type: "ca1", title: "[broadsheet] CA1" },
      { student_id: "s", subject_id: "m", ca_type: "exam", title: "[broadsheet] Exam" },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((d) => d.title).sort()).toEqual(["[broadsheet] CA1", "[broadsheet] Exam"]);
  });
});

describe("weightedTotal (assessment-config)", () => {
  const standard: AssessmentComponent[] = [
    { id: "1", code: "CA1", name: "CA1", max_score: 15, weight_percentage: 15, display_order: 1, is_mandatory: true },
    { id: "2", code: "CA2", name: "CA2", max_score: 15, weight_percentage: 15, display_order: 2, is_mandatory: true },
    { id: "3", code: "EXAM", name: "Exam", max_score: 70, weight_percentage: 70, display_order: 3, is_mandatory: true },
  ];

  it("returns weighted marks when weights sum to 100", () => {
    expect(weightedTotal(standard, { CA1: 12, CA2: 13.5, EXAM: 56 })).toBe(81.5);
  });

  it("normalizes to 0-100 when weights do not sum to 100 (I2)", () => {
    const partial: AssessmentComponent[] = standard.map((c, i) =>
      i < 2 ? { ...c, weight_percentage: 10 } : { ...c, weight_percentage: 70 }
    );
    // Σ min(1, score/max)*w = 8 + 9 + 56 = 73 over Σw = 90 → 81.11
    expect(weightedTotal(partial, { CA1: 12, CA2: 13.5, EXAM: 56 })).toBeCloseTo(81.11, 2);
  });

  it("returns null when nothing is recorded and 0 for all-zero scores", () => {
    expect(weightedTotal(standard, { CA1: null, EXAM: undefined })).toBeNull();
    expect(weightedTotal(standard, { CA1: 0, CA2: 0, EXAM: 0 })).toBe(0);
  });

  it("keeps pct() clamp semantics for the legacy non-dynamic path", () => {
    expect(pct(12, 15)).toBe(80);
    expect(pct(80, 100)).toBe(80);
  });
});