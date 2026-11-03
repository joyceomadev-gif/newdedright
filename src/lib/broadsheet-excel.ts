import * as XLSX from "xlsx";
import { broadsheetColumns, type BroadSheetColumnSpec } from "@/lib/broadsheet";

export interface StudentExportItem {
  id: string;
  full_name: string;
  admission_no?: string | null;
}

export interface SubjectExportItem {
  id: string;
  name: string;
}

export interface ScoreData {
  ca1: number | null;
  ca2: number | null;
  ca3: number | null;
  exam_score: number | null;
}

export interface CommentData {
  teacher_comment: string | null;
  principal_comment: string | null;
}

export interface ExportBroadsheetOptions {
  className: string;
  sessionName?: string;
  termName?: string;
  students: StudentExportItem[];
  subjects: SubjectExportItem[];
  showCa1: boolean;
  showCa2: boolean;
  showCa3: boolean;
  showExam: boolean;
  getScores: (studentId: string, subjectId: string) => ScoreData;
  getComment: (studentId: string) => CommentData;
  /** If true, returns the workbook object instead of triggering browser download (useful for tests) */
  returnWorkbook?: boolean;
}

/**
 * Generates an Excel workbook reflecting the exact on-screen broadsheet structure.
 */
export function exportBroadsheetToExcel(options: ExportBroadsheetOptions): XLSX.WorkBook | void {
  const {
    className,
    sessionName,
    termName,
    students,
    subjects,
    showCa1,
    showCa2,
    showCa3,
    showExam,
    getScores,
    getComment,
    returnWorkbook = false,
  } = options;

  const cols: BroadSheetColumnSpec[] = broadsheetColumns(showCa1, showCa2, showCa3, showExam);

  // Row 1: Group headers
  // [Admission No, Student Name, ... [Subject Name for each col] ..., "Comments", "Comments"]
  const headerRow1: any[] = ["Admission No", "Student Name"];
  const headerRow2: any[] = ["", ""];

  subjects.forEach((sub) => {
    cols.forEach((col) => {
      headerRow1.push(sub.name);
      headerRow2.push(col.h);
    });
  });

  headerRow1.push("Comments", "Comments");
  headerRow2.push("Teacher Comment", "Principal Comment");

  const dataRows: any[][] = [headerRow1, headerRow2];

  // Data rows
  students.forEach((st) => {
    const row: any[] = [st.admission_no || "", st.full_name];

    subjects.forEach((sub) => {
      const scores = getScores(st.id, sub.id);
      const ca1Val = showCa1 && scores.ca1 != null ? Number(scores.ca1) : 0;
      const ca2Val = showCa2 && scores.ca2 != null ? Number(scores.ca2) : 0;
      const ca3Val = showCa3 && scores.ca3 != null ? Number(scores.ca3) : 0;
      const examVal = showExam && scores.exam_score != null ? Number(scores.exam_score) : 0;
      const totalCa = Math.round((ca1Val + ca2Val + ca3Val) * 100) / 100;
      const total = Math.round((totalCa + examVal) * 100) / 100;
      const hasAny = [
        showCa1 && scores.ca1 != null,
        showCa2 && scores.ca2 != null,
        showCa3 && scores.ca3 != null,
        showExam && scores.exam_score != null,
      ].some(Boolean);

      cols.forEach((col) => {
        if (col.kind === "CA1") {
          row.push(scores.ca1 != null ? scores.ca1 : "");
        } else if (col.kind === "CA2") {
          row.push(scores.ca2 != null ? scores.ca2 : "");
        } else if (col.kind === "CA3") {
          row.push(scores.ca3 != null ? scores.ca3 : "");
        } else if (col.kind === "SUM_CA") {
          row.push(hasAny ? totalCa : "");
        } else if (col.kind === "EXAM") {
          row.push(scores.exam_score != null ? scores.exam_score : "");
        } else if (col.kind === "TOTAL") {
          row.push(hasAny ? total : "");
        }
      });
    });

    const comm = getComment(st.id);
    row.push(comm.teacher_comment || "", comm.principal_comment || "");
    dataRows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(dataRows);

  // Column width hints
  const colWidths: any[] = [
    { wch: 16 }, // Adm No
    { wch: 28 }, // Student Name
  ];

  subjects.forEach(() => {
    cols.forEach((c) => {
      colWidths.push({ wch: c.kind === "SUM_CA" || c.kind === "TOTAL" ? 9 : 8 });
    });
  });
  colWidths.push({ wch: 30 }, { wch: 30 }); // Comments
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  const safeSheetName = (className || "Broadsheet").replace(/[:\\/?*\[\]]/g, "_").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  if (returnWorkbook) {
    return wb;
  }

  const cleanFileName = `Broadsheet_${className || "Class"}_${termName || "Term"}.xlsx`
    .replace(/\s+/g, "_")
    .replace(/[:\\/?*\[\]]/g, "");
  XLSX.writeFile(wb, cleanFileName);
}

export interface ParseBroadsheetResult {
  scorePatches: Record<string, { student_id: string; subject_id: string; ca1?: number | null; ca2?: number | null; ca3?: number | null; exam_score?: number | null }>;
  commentPatches: Record<string, { student_id: string; teacher_comment?: string | null; principal_comment?: string | null }>;
  stats: {
    matchedStudents: number;
    updatedScores: number;
    updatedComments: number;
    warnings: string[];
    errors: string[];
  };
}

export interface ParseBroadsheetContext {
  students: StudentExportItem[];
  subjects: SubjectExportItem[];
  componentMax: (code: string) => number;
}

/**
 * Normalizes text for case- and whitespace-insensitive matching.
 */
function clean(str: any): string {
  return String(str ?? "").trim().toLowerCase();
}

/**
 * Parses an uploaded Excel workbook back into broadsheet score & comment patches.
 */
export function parseBroadsheetExcel(
  fileBuffer: ArrayBuffer,
  context: ParseBroadsheetContext
): ParseBroadsheetResult {
  const wb = XLSX.read(fileBuffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("The uploaded Excel workbook contains no sheets.");
  }

  const ws = wb.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (!aoa || aoa.length < 2) {
    throw new Error("The uploaded sheet has insufficient rows. Ensure it contains headers and data.");
  }

  const { students, subjects, componentMax } = context;

  // Student lookup maps
  const studentByAdm = new Map<string, StudentExportItem>();
  const studentByName = new Map<string, StudentExportItem>();
  students.forEach((s) => {
    if (s.admission_no) studentByAdm.set(clean(s.admission_no), s);
    studentByName.set(clean(s.full_name), s);
  });

  // Subject lookup map
  const subjectByName = new Map<string, SubjectExportItem>();
  subjects.forEach((s) => subjectByName.set(clean(s.name), s));

  // Determine header structure:
  // Usually Row 0 is Subject Names / Group Headers, Row 1 is Component Codes (CA1, CA2, ∑CA, Exam, Total).
  // If row 0 has "CA1" or "Exam", it might be a single-row header format.
  let row1 = aoa[0] || [];
  let row2 = aoa[1] || [];
  let dataStartRow = 2;

  const isTwoLevel = row2.some((c) => {
    const s = clean(c);
    return s.includes("ca1") || s.includes("ca2") || s.includes("exam") || s.includes("comment") || s.includes("total");
  });

  if (!isTwoLevel) {
    // Single-level header
    row2 = row1;
    row1 = [];
    dataStartRow = 1;
  }

  // Column descriptors
  interface ColDef {
    colIdx: number;
    type: "adm" | "name" | "score" | "teacher_comment" | "principal_comment";
    subjectId?: string;
    subjectName?: string;
    field?: "ca1" | "ca2" | "ca3" | "exam_score";
  }

  const colDefs: ColDef[] = [];
  let currentSubject: SubjectExportItem | null = null;

  const totalCols = Math.max(row1.length, row2.length);

  for (let colIdx = 0; colIdx < totalCols; colIdx++) {
    const topCell = clean(row1[colIdx]);
    const subCell = clean(row2[colIdx]);

    // Check if top cell switches subject
    if (topCell && topCell !== "comments" && topCell !== "student information" && topCell !== "admission no" && topCell !== "student name") {
      const foundSub = subjectByName.get(topCell) ?? subjects.find((s) => clean(s.name) === topCell);
      if (foundSub) {
        currentSubject = foundSub;
      }
    }

    // Check for Admission No / Student Name columns
    if (subCell.includes("adm") || topCell.includes("adm")) {
      colDefs.push({ colIdx, type: "adm" });
      continue;
    }
    if (subCell === "student name" || subCell === "student" || topCell === "student name" || topCell === "student") {
      colDefs.push({ colIdx, type: "name" });
      continue;
    }

    // Check for Comments
    if (subCell.includes("teacher comment") || subCell === "teacher") {
      colDefs.push({ colIdx, type: "teacher_comment" });
      continue;
    }
    if (subCell.includes("principal comment") || subCell === "principal") {
      colDefs.push({ colIdx, type: "principal_comment" });
      continue;
    }

    // If neither, check if this is a score column
    // Try to resolve subject either from currentSubject or from embedded text like "Mathematics - CA1"
    let targetSubject = currentSubject;
    let targetComponentText = subCell;

    if (!targetSubject) {
      // Maybe header combines subject and component: e.g. "Math CA1" or "English - Exam"
      for (const sb of subjects) {
        const cName = clean(sb.name);
        if (topCell.includes(cName) || subCell.includes(cName)) {
          targetSubject = sb;
          targetComponentText = subCell.replace(cName, "").trim() || topCell.replace(cName, "").trim();
          break;
        }
      }
    }

    if (!targetSubject) continue;

    // Component identification
    if (targetComponentText.includes("ca1")) {
      colDefs.push({ colIdx, type: "score", subjectId: targetSubject.id, subjectName: targetSubject.name, field: "ca1" });
    } else if (targetComponentText.includes("ca2")) {
      colDefs.push({ colIdx, type: "score", subjectId: targetSubject.id, subjectName: targetSubject.name, field: "ca2" });
    } else if (targetComponentText.includes("ca3")) {
      colDefs.push({ colIdx, type: "score", subjectId: targetSubject.id, subjectName: targetSubject.name, field: "ca3" });
    } else if (targetComponentText.includes("exam") && !targetComponentText.includes("sum")) {
      colDefs.push({ colIdx, type: "score", subjectId: targetSubject.id, subjectName: targetSubject.name, field: "exam_score" });
    }
    // ∑CA and Total are calculated auto-columns, so we deliberately do not import them directly
  }

  const scorePatches: Record<string, { student_id: string; subject_id: string; ca1?: number | null; ca2?: number | null; ca3?: number | null; exam_score?: number | null }> = {};
  const commentPatches: Record<string, { student_id: string; teacher_comment?: string | null; principal_comment?: string | null }> = {};

  const warnings: string[] = [];
  const errors: string[] = [];
  const matchedStudentIds = new Set<string>();
  let updatedScoresCount = 0;
  let updatedCommentsCount = 0;

  for (let rIdx = dataStartRow; rIdx < aoa.length; rIdx++) {
    const row = aoa[rIdx];
    if (!row || row.length === 0) continue;

    // Find student in this row
    let admVal = "";
    let nameVal = "";

    for (const c of colDefs) {
      if (c.type === "adm" && row[c.colIdx]) admVal = clean(row[c.colIdx]);
      if (c.type === "name" && row[c.colIdx]) nameVal = clean(row[c.colIdx]);
    }

    // Skip empty lines
    if (!admVal && !nameVal) continue;

    let student: StudentExportItem | undefined;
    if (admVal && studentByAdm.has(admVal)) {
      student = studentByAdm.get(admVal);
    } else if (nameVal && studentByName.has(nameVal)) {
      student = studentByName.get(nameVal);
    }

    if (!student) {
      warnings.push(`Row ${rIdx + 1}: Could not match student "${nameVal || admVal}" in this class.`);
      continue;
    }

    matchedStudentIds.add(student.id);

    // Process scores and comments
    for (const c of colDefs) {
      const rawVal = row[c.colIdx];

      if (c.type === "score" && c.subjectId && c.field) {
        if (rawVal === "" || rawVal === null || rawVal === undefined) continue;

        const num = Number(rawVal);
        if (Number.isNaN(num)) {
          warnings.push(`${student.full_name} · ${c.subjectName} (${c.field.toUpperCase()}): "${rawVal}" is not a valid number.`);
          continue;
        }

        const max = componentMax(c.field === "exam_score" ? "EXAM" : c.field.toUpperCase());
        if (num < 0 || num > max) {
          warnings.push(`${student.full_name} · ${c.subjectName}: ${c.field.toUpperCase()} (${num}) exceeds maximum allowed (${max}).`);
        }

        const key = `${student.id}|${c.subjectId}`;
        if (!scorePatches[key]) {
          scorePatches[key] = { student_id: student.id, subject_id: c.subjectId };
        }
        scorePatches[key][c.field] = num;
        updatedScoresCount++;
      } else if (c.type === "teacher_comment") {
        if (rawVal != null && String(rawVal).trim() !== "") {
          if (!commentPatches[student.id]) {
            commentPatches[student.id] = { student_id: student.id };
          }
          commentPatches[student.id].teacher_comment = String(rawVal).trim();
          updatedCommentsCount++;
        }
      } else if (c.type === "principal_comment") {
        if (rawVal != null && String(rawVal).trim() !== "") {
          if (!commentPatches[student.id]) {
            commentPatches[student.id] = { student_id: student.id };
          }
          commentPatches[student.id].principal_comment = String(rawVal).trim();
          updatedCommentsCount++;
        }
      }
    }
  }

  return {
    scorePatches,
    commentPatches,
    stats: {
      matchedStudents: matchedStudentIds.size,
      updatedScores: updatedScoresCount,
      updatedComments: updatedCommentsCount,
      warnings,
      errors,
    },
  };
}
