import { describe, it, expect } from "vitest";
import {
  bankPageRange,
  bankGroupCounts,
  bankReadAllowed,
  bankSearchPattern,
  parseBankSearch,
} from "./question-bank";
describe("read-only Question Bank", () => {
  it("counts only matching rows by class and subject without losing unassigned subjects", () => {
    const counts = bankGroupCounts([
      { class_id: "class-a", subject_id: "math" },
      { class_id: "class-a", subject_id: "math" },
      { class_id: "class-a", subject_id: null },
      { class_id: "class-b", subject_id: "math" },
      { class_id: null, subject_id: "math" },
    ]);
    expect(counts.get("class-a")?.count).toBe(3);
    expect(counts.get("class-a")?.subjects.get("math")).toBe(2);
    expect(counts.get("class-b")?.count).toBe(1);
    expect(counts.size).toBe(2);
    expect(bankGroupCounts([]).size).toBe(0);
  });
  it("uses exactly 50 records per page", () => {
    expect(bankPageRange(1)).toEqual({ from: 0, to: 49 });
    expect(bankPageRange(2)).toEqual({ from: 50, to: 99 });
  });
  it("does not grant students access through exam permissions", () => {
    expect(bankReadAllowed(false, true, true)).toBe(false);
  });
  it("requires existing parent and submodule access for staff", () => {
    expect(bankReadAllowed(true, false, true)).toBe(false);
    expect(bankReadAllowed(true, true, false)).toBe(false);
    expect(bankReadAllowed(true, true, true)).toBe(true);
  });
  it("rejects invalid filters and page numbers", () => {
    expect(
      parseBankSearch({ classId: "bad", difficulty: "extreme", status: "published", page: -1 }),
    ).toMatchObject({ classId: "", difficulty: "", status: "", page: 1 });
  });
  it("retains valid applied filters", () => {
    expect(
      parseBankSearch({
        search: " planets ",
        classId: "12345678-1234-1234-1234-123456789012",
        status: "approved",
        difficulty: "hard",
        view: "list",
        page: 2,
      }),
    ).toMatchObject({
      search: "planets",
      status: "approved",
      difficulty: "hard",
      page: 2,
      view: "list",
      classId: "12345678-1234-1234-1234-123456789012",
    });
  });
  it("searches literal percent and underscore characters", () => {
    expect(bankSearchPattern("50%_x")).toBe("%50\\%\\_x%");
  });
});
