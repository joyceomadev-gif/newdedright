import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  exportBroadsheetToExcel,
  parseBroadsheetExcel,
  type StudentExportItem,
  type SubjectExportItem,
} from "@/lib/broadsheet-excel";

describe("Broadsheet Excel: Export & Import Pipeline", () => {
  const mockStudents: StudentExportItem[] = [
    { id: "st-1", full_name: "Adebayo Ayominde Godwin", admission_no: "ADM/2026/001" },
    { id: "st-2", full_name: "Adegbite Hesidel", admission_no: "ADM/2026/002" },
    { id: "st-3", full_name: "Arabina Grace", admission_no: null },
  ];

  const mockSubjects: SubjectExportItem[] = [
    { id: "sub-1", name: "Accounting" },
    { id: "sub-2", name: "Basic Science" },
  ];

  const mockScores: Record<string, { ca1: number | null; ca2: number | null; ca3: number | null; exam_score: number | null }> = {
    "st-1|sub-1": { ca1: 14, ca2: null, ca3: null, exam_score: 22 },
    "st-1|sub-2": { ca1: 14, ca2: null, ca3: null, exam_score: 59 },
    "st-2|sub-1": { ca1: 13, ca2: null, ca3: null, exam_score: 52 },
    "st-2|sub-2": { ca1: 13, ca2: null, ca3: null, exam_score: 56 },
  };

  const mockComments: Record<string, { teacher_comment: string | null; principal_comment: string | null }> = {
    "st-1": { teacher_comment: "Very hardworking student.", principal_comment: "Promoted to next class." },
    "st-2": { teacher_comment: "Good improvement.", principal_comment: null },
  };

  const componentMax = (code: string) => (code.toUpperCase().startsWith("EXAM") ? 70 : 15);

  it("exports a 2-level header workbook reflecting active on-screen columns", () => {
    const wb = exportBroadsheetToExcel({
      className: "LAVENDER",
      sessionName: "2025/2026",
      termName: "third",
      students: mockStudents,
      subjects: mockSubjects,
      showCa1: true,
      showCa2: false,
      showCa3: false,
      showExam: true,
      getScores: (stId, subId) => mockScores[`${stId}|${subId}`] ?? { ca1: null, ca2: null, ca3: null, exam_score: null },
      getComment: (stId) => mockComments[stId] ?? { teacher_comment: null, principal_comment: null },
      returnWorkbook: true,
    }) as XLSX.WorkBook;

    expect(wb).toBeDefined();
    expect(wb.SheetNames).toContain("LAVENDER");

    const ws = wb.Sheets["LAVENDER"];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Row 0: Group Headers
    expect(aoa[0][0]).toBe("Admission No");
    expect(aoa[0][1]).toBe("Student Name");
    expect(aoa[0][2]).toBe("Accounting");
    expect(aoa[0][6]).toBe("Basic Science");
    expect(aoa[0][10]).toBe("Comments");

    // Row 1: Subheaders (CA1, ∑CA, Exam, Total)
    expect(aoa[1][2]).toBe("CA1");
    expect(aoa[1][3]).toBe("∑CA");
    expect(aoa[1][4]).toBe("Exam");
    expect(aoa[1][5]).toBe("Total");
    expect(aoa[1][6]).toBe("CA1");
    expect(aoa[1][10]).toBe("Teacher Comment");
    expect(aoa[1][11]).toBe("Principal Comment");

    // Row 2: Adebayo's marks
    expect(aoa[2][0]).toBe("ADM/2026/001");
    expect(aoa[2][1]).toBe("Adebayo Ayominde Godwin");
    expect(aoa[2][2]).toBe(14); // Accounting CA1
    expect(aoa[2][3]).toBe(14); // ∑CA
    expect(aoa[2][4]).toBe(22); // Exam
    expect(aoa[2][5]).toBe(36); // Total (14+22)
    expect(aoa[2][10]).toBe("Very hardworking student.");
  });

  it("parses the exported workbook and round-trips all scores and comments exactly", () => {
    const wb = exportBroadsheetToExcel({
      className: "LAVENDER",
      students: mockStudents,
      subjects: mockSubjects,
      showCa1: true,
      showCa2: false,
      showCa3: false,
      showExam: true,
      getScores: (stId, subId) => mockScores[`${stId}|${subId}`] ?? { ca1: null, ca2: null, ca3: null, exam_score: null },
      getComment: (stId) => mockComments[stId] ?? { teacher_comment: null, principal_comment: null },
      returnWorkbook: true,
    }) as XLSX.WorkBook;

    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = parseBroadsheetExcel(buffer, {
      students: mockStudents,
      subjects: mockSubjects,
      componentMax,
    });

    expect(result.stats.matchedStudents).toBe(3);
    expect(result.stats.updatedScores).toBe(8); // 2 students x 2 subjects x 2 components (CA1, Exam) = 8
    expect(result.stats.warnings).toHaveLength(0);

    const st1Sub1 = result.scorePatches["st-1|sub-1"];
    expect(st1Sub1).toBeDefined();
    expect(st1Sub1.ca1).toBe(14);
    expect(st1Sub1.exam_score).toBe(22);

    const st1Sub2 = result.scorePatches["st-1|sub-2"];
    expect(st1Sub2).toBeDefined();
    expect(st1Sub2.ca1).toBe(14);
    expect(st1Sub2.exam_score).toBe(59);

    const st1Comm = result.commentPatches["st-1"];
    expect(st1Comm.teacher_comment).toBe("Very hardworking student.");
    expect(st1Comm.principal_comment).toBe("Promoted to next class.");
  });

  it("handles offline student updates and flags out-of-bounds values", () => {
    const wsData = [
      ["Admission No", "Student Name", "Accounting", "Accounting", "Accounting", "Accounting"],
      ["", "", "CA1", "∑CA", "Exam", "Total"],
      ["ADM/2026/001", "Adebayo Ayominde Godwin", 15, 15, 68, 83],
      ["ADM/2026/002", "Adegbite Hesidel", 25, 25, 80, 105], // 25 > 15, 80 > 70
      ["", "Arabina Grace", 12, 12, 50, 62], // matched by Name when Adm No is empty
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = parseBroadsheetExcel(buffer, {
      students: mockStudents,
      subjects: mockSubjects,
      componentMax,
    });

    expect(result.stats.matchedStudents).toBe(3);
    expect(result.scorePatches["st-3|sub-1"].ca1).toBe(12);
    expect(result.scorePatches["st-3|sub-1"].exam_score).toBe(50);

    // Warnings for out-of-bounds scores on st-2
    expect(result.stats.warnings.some((w) => w.includes("exceeds maximum allowed (15)"))).toBe(true);
    expect(result.stats.warnings.some((w) => w.includes("exceeds maximum allowed (70)"))).toBe(true);
  });
});
