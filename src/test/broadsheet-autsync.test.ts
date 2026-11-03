import { describe, it, expect, vi } from "vitest";
import { populateBroadsheetFromCbtAndCas } from "@/lib/broadsheet";

function mockSupabase(data: {
  students?: any[];
  subjects?: any[];
  continuous_assessments?: any[];
  exams?: any[];
  results?: any[];
}) {
  const upsertCalls: any[] = [];

  const client = {
    from: (table: string) => {
      const selectedData: any[] = (data as any)[table] ?? [];
      const queryObj: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockImplementation(async (payload: any) => {
          upsertCalls.push({ table, payload });
          return { error: null };
        }),
        then: (resolve: any) => resolve({ data: selectedData, error: null }),
      };
      return queryObj;
    },
    upsertCalls,
  };

  return client;
}

describe("populateBroadsheetFromCbtAndCas", () => {
  const scope = {
    headerId: "hdr-1",
    sessionId: "sess-1",
    termId: "term-1",
    classId: "cls-1",
  };

  it("returns populatedCount: 0 and does not upsert when no CBT exams or CAs exist", async () => {
    const db = mockSupabase({
      students: [{ id: "st-1" }, { id: "st-2" }],
      subjects: [{ id: "sub-1" }, { id: "sub-2" }],
      continuous_assessments: [],
      exams: [],
      results: [],
    });

    const res = await populateBroadsheetFromCbtAndCas(db as any, scope, { persistToDb: true });

    expect(res.populatedCount).toBe(0);
    expect(res.matchedStudents).toBe(0);
    expect(Object.keys(res.patches)).toHaveLength(0);
    expect(db.upsertCalls).toHaveLength(0);
  });

  it("populates CA scores and published CBT exam results into broadsheet", async () => {
    const db = mockSupabase({
      students: [{ id: "st-1" }, { id: "st-2" }],
      subjects: [{ id: "sub-math" }],
      continuous_assessments: [
        {
          id: "ca-1",
          student_id: "st-1",
          subject_id: "sub-math",
          ca_type: "ca1",
          score: 12,
          max_score: 15,
          title: "Math Quiz 1",
          created_at: "2026-09-01",
        },
        {
          id: "ca-2",
          student_id: "st-1",
          subject_id: "sub-math",
          ca_type: "ca2",
          score: 14,
          max_score: 15,
          title: "Math Homework 2",
          created_at: "2026-09-02",
        },
        // A previously synced broadsheet row should be ignored
        {
          id: "ca-synced",
          student_id: "st-1",
          subject_id: "sub-math",
          ca_type: "ca1",
          score: 99,
          max_score: 15,
          title: "[broadsheet] CA1",
          created_at: "2026-09-05",
        },
      ],
      exams: [
        {
          id: "exam-math",
          subject_id: "sub-math",
          max_score: 70,
        },
      ],
      results: [
        {
          student_id: "st-1",
          exam_id: "exam-math",
          score: 58,
        },
      ],
    });

    const res = await populateBroadsheetFromCbtAndCas(db as any, scope, { persistToDb: true });

    expect(res.populatedCount).toBe(3); // CA1, CA2, and Exam
    expect(res.matchedStudents).toBe(1);
    expect(res.caScoresCount).toBe(2);
    expect(res.examScoresCount).toBe(1);

    const st1Patch = res.patches["st-1|sub-math"];
    expect(st1Patch).toBeDefined();
    expect(st1Patch.ca1).toBe(12);
    expect(st1Patch.ca2).toBe(14);
    expect(st1Patch.exam_score).toBe(58);

    // Verify DB upsert call
    expect(db.upsertCalls).toHaveLength(1);
    expect(db.upsertCalls[0].table).toBe("broadsheets");
    expect(db.upsertCalls[0].payload[0]).toMatchObject({
      header_id: "hdr-1",
      session_id: "sess-1",
      term_id: "term-1",
      class_id: "cls-1",
      student_id: "st-1",
      subject_id: "sub-math",
      ca1: 12,
      ca2: 14,
      exam_score: 58,
    });
  });

  it("rescales legacy percentage CAs (max_score=100) to component max", async () => {
    const db = mockSupabase({
      students: [{ id: "st-1" }],
      subjects: [{ id: "sub-eng" }],
      continuous_assessments: [
        {
          id: "ca-eng",
          student_id: "st-1",
          subject_id: "sub-eng",
          ca_type: "ca1",
          score: 80, // 80% out of 100 -> should be 12 on a 15-scale
          max_score: 100,
          title: "Grammar test",
        },
      ],
      exams: [],
      results: [],
    });

    const res = await populateBroadsheetFromCbtAndCas(
      db as any,
      scope,
      {
        componentMax: (code) => (code === "CA1" ? 15 : 70),
        persistToDb: false,
      }
    );

    expect(res.populatedCount).toBe(1);
    expect(res.patches["st-1|sub-eng"].ca1).toBe(12);
  });

  it("rescales CBT exam score when exam max_score differs from EXAM component max", async () => {
    const db = mockSupabase({
      students: [{ id: "st-1" }],
      subjects: [{ id: "sub-sci" }],
      continuous_assessments: [],
      exams: [
        {
          id: "exam-sci",
          subject_id: "sub-sci",
          max_score: 100, // Exam configured out of 100
        },
      ],
      results: [
        {
          student_id: "st-1",
          exam_id: "exam-sci",
          score: 80, // 80 out of 100 -> should scale to 56 on a 70-scale
        },
      ],
    });

    const res = await populateBroadsheetFromCbtAndCas(
      db as any,
      scope,
      {
        componentMax: (code) => (code === "EXAM" ? 70 : 15),
        persistToDb: false,
      }
    );

    expect(res.populatedCount).toBe(1);
    expect(res.patches["st-1|sub-sci"].exam_score).toBe(56);
  });
});
