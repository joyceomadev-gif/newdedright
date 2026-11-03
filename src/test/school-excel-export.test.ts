import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildSchoolWorkbook, EXPORT_SHEETS } from "@/lib/school-excel-export";

describe("school Excel export", () => {
  it("exports all records beyond the first page into exactly five sheets", async () => {
    const workbook = await buildSchoolWorkbook(async (table, _fields, from, to) => ({
      data: Array.from({ length: table === "students" ? 1051 : 1 }, (_, index) => ({ id: String(index), full_name: `Person ${index}` })).slice(from, to + 1),
      error: null,
    }));
    const roundTrip = XLSX.read(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), { type: "array" });
    expect(roundTrip.SheetNames).toEqual(["Students", "Teachers", "Parents", "Exams", "Question Bank"]);
    expect(XLSX.utils.sheet_to_json(roundTrip.Sheets.Students)).toHaveLength(1051);
  });

  it("excludes passwords and tokens even if returned with the records", async () => {
    const workbook = await buildSchoolWorkbook(async () => ({ data: [{ id: "1", full_name: "Test", password: "secret-password", access_token: "secret-token" }], error: null }));
    for (const sheet of EXPORT_SHEETS) {
      const cells = JSON.stringify(XLSX.utils.sheet_to_json(workbook.Sheets[sheet.name], { header: 1 }));
      expect(cells).not.toContain("secret-password");
      expect(cells).not.toContain("secret-token");
      expect(sheet.fields).not.toMatch(/password|token/);
    }
  });

  it("retains headers for empty lists and aborts on any failed list", async () => {
    const workbook = await buildSchoolWorkbook(async () => ({ data: [], error: null }));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Students, { header: 1 })).toHaveLength(1);
    await expect(buildSchoolWorkbook(async () => ({ data: null, error: { message: "Access denied" } }))).rejects.toThrow("Access denied");
  });
});