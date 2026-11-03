import { describe, it, expect } from "vitest";
import { planStudentImport, splitStudentName, normalizeGender, executeStudentImport } from "@/lib/student-import";
const row = (extra = {}) => ({ admission_no: "001", full_name: "JANE DOE", gender: "F", date_of_birth: "2013-04-05", class_name: "JSS ONE", ...extra });
const classes = [{ id: "class-one", name: "JSS ONE" }];
describe("student import requirements", () => {
  it("normalizes male/female/M/F in any case and never defaults blank to male", () => {
    expect(["male", "MALE", "m", "M", "female", "FEMALE", "f", "F", ""].map(normalizeGender)).toEqual(["male", "male", "male", "male", "female", "female", "female", "female", null]);
    expect(planStudentImport([row({ gender: "" })], classes, [])[0]?.entry.flags).toContain("Blank gender");
  });
  it("uses full_name not supplied parts, with comma surname first and title case cleanup", () => {
    expect(splitStudentName("  ODiAKA,  JOY   ANN.,  ")).toEqual({ first_name: "Joy Ann", last_name: "Odiaka", full_name: "Joy Ann Odiaka" });
    expect(splitStudentName(" JOHN   DOE SMITH., ")).toEqual({ first_name: "John", last_name: "Doe Smith", full_name: "John Doe Smith" });
    expect(planStudentImport([row({ first_name: "Wrong", last_name: "Wrong" })], classes, [])[0]?.payload.full_name).toBe("Jane Doe");
  });
  it("splits non-comma names on first word and remaining words", () => {
    expect(splitStudentName(" JOHN   DOE SMITH. ")).toEqual({ first_name: "John", last_name: "Doe Smith", full_name: "John Doe Smith" });
  });
  it("skips demo names and test/demo classes regardless of case", () => {
    for (const r of [row({ class_name: "TEST class" }), row({ class_name: "Demo Class" }), row({ full_name: "Demonstration Student" })]) {
      expect(planStudentImport([r], classes, [])[0]?.entry.reasons).toContain("Test/demo record");
    }
  });
  it("trims admission numbers but preserves case and zeros; rejects exact duplicates", () => {
    const p = planStudentImport([row({ admission_no: " 00Ab " }), row({ admission_no: "00ab", full_name: "Other Student" })], classes, []);
    expect(p.map((r) => r.payload.admission_no)).toEqual(["00Ab", "00ab"]);
    expect(p.every((r) => !r.entry.reasons.length)).toBe(true);
    expect(planStudentImport([row(), row({ full_name: "Other Student" })], classes, []).every((r) => r.entry.reasons.includes("Exact duplicate admission number in file"))).toBe(true);
  });
  it("imports neither row with the same normalized full name and DOB", async () => {
    let saves = 0;
    const result = await executeStudentImport([row(), row({ admission_no: "002", full_name: " Jane   Doe. " })], classes, [], async () => { saves++; });
    expect(saves).toBe(0);
    expect(result.every((r) => r.reasons.includes("Duplicate full name and date of birth — manual decision required"))).toBe(true);
  });
  it("blank DOB and class remain importable with flags", () => {
    const p = planStudentImport([row({ date_of_birth: "", class_name: "" })], classes, [])[0];
    expect(p?.entry.reasons).toEqual([]); expect(p?.entry.flags).toEqual(["Blank date of birth", "Blank class; unassigned"]);
    expect(p?.payload.date_of_birth).toBeNull(); expect(p?.payload.class_id).toBeNull();
  });
  it("requires exact existing class names and never creates unmatched classes", () => {
    const p = planStudentImport([row({ class_name: "jss one" })], classes, [])[0];
    expect(p?.entry.reasons).toEqual(["Unmatched or ambiguous active class: jss one"]);
    expect(p?.payload.class_id).toBeNull();
  });
  it("rejects admission numbers held in Recycle Bin without saving or restoring", async () => {
    let saves = 0;
    const result = await executeStudentImport([row()], classes, [{ id: "s0", admission_no: "001", full_name: "Old Name", date_of_birth: null, deleted_at: "2026-10-21" }], async () => { saves++; });
    expect(saves).toBe(0); expect(result[0]?.reasons).toContain("Admission number exists in Recycle Bin");
  });
  it("updates the existing student when admission number and full name both match", async () => {
    const saved: Record<string, unknown>[] = [];
    const result = await executeStudentImport([row()], classes, [{ id: "s1", admission_no: "001", full_name: "Jane Doe", date_of_birth: "2013-04-05", deleted_at: null }], async (p) => { saved.push(p); });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe("s1");
    expect(result[0]?.status).toBe("Updated");
    expect(result[0]?.reasons).toEqual([]);
  });
  it("flags admission number matches with a different full name instead of overwriting", async () => {
    let saves = 0;
    const result = await executeStudentImport([row()], classes, [{ id: "s1", admission_no: "001", full_name: "Different Person", date_of_birth: null, deleted_at: null }], async () => { saves++; });
    expect(saves).toBe(0);
    expect(result[0]?.status).toBe("Skipped");
    expect(result[0]?.reasons).toContain("Admission number belongs to a different student (name mismatch) — not overwritten");
  });
  it("maps place_of_birth from the import file", () => {
    const p = planStudentImport([row({ place_of_birth: "Lagos" })], classes, [])[0];
    expect(p?.payload.place_of_birth).toBe("Lagos");
  });
  it("reports actual successes, errors and gender without losing rows", async () => {
    const result = await executeStudentImport([row(), row({ admission_no: "002", full_name: "Other Student", gender: "" })], classes, [], async (p) => { if (p.admission_no === "002") throw new Error("Write failed"); });
    expect(result.map((r) => [r.status, r.gender, r.reasons])).toEqual([["Imported", "Female", []], ["Skipped", "Empty", ["Write failed"]]]);
  });
});
