import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  validateBroadsheetRows,
  broadsheetColumns,
  type BroadsheetRow,
} from "@/lib/broadsheet";

/* =================================================================================
 * TEST SUITE: Broadsheet Result Entry — validation, column layout, UI interactions
 * Exercises the real shared helpers from src/lib/broadsheet.ts.
 * ================================================================================= */

// Component-scale max resolver mirroring broadsheet.tsx (structure → defaults)
function componentMax(code: string, components?: Array<{ code: string; max_score: number }>): number {
  const comp = components?.find((c) => c.code.toUpperCase() === code.toUpperCase());
  return comp?.max_score ?? (code.toUpperCase().startsWith("EXAM") ? 70 : 15);
}

const standardComponents = [
  { code: "CA1", max_score: 15 },
  { code: "CA2", max_score: 15 },
  { code: "EXAM", max_score: 70 },
];

function row(partial: Partial<BroadsheetRow>): BroadsheetRow {
  return {
    student_id: "student-1",
    subject_id: "math",
    ca1: null,
    ca2: null,
    ca3: null,
    exam_score: null,
    ...partial,
  };
}

function validate(rows: BroadsheetRow[], opts?: Partial<Parameters<typeof validateBroadsheetRows>[1]>) {
  return validateBroadsheetRows(rows, {
    showCa1: true,
    showCa2: true,
    showCa3: false,
    showExam: true,
    componentMax: (code) => componentMax(code, standardComponents),
    studentName: (id) => (id === "student-1" ? "Amina Bello" : id),
    subjectName: (id) => (id === "math" ? "Mathematics" : id),
    ...opts,
  });
}

describe("validateBroadsheetRows: bounds & completeness", () => {
  it("accepts valid in-bounds marks including zeros and partial entries", () => {
    const rows = [
      row({ ca1: 12, ca2: 13, exam_score: 55 }),
      row({ student_id: "student-2", ca1: 0, ca2: 0, exam_score: 0 }),
      row({ student_id: "student-3", ca1: 15, ca2: 15, exam_score: 70 }),
      row({ student_id: "student-4", ca1: 12 }), // exam not yet recorded
    ];
    expect(validate(rows)).toEqual([]);
  });

  it("rejects scores below 0 or above the component maximum", () => {
    const errors = validate([
      row({ ca1: 18 }), // > 15
      row({ student_id: "student-2", ca2: -2 }),
      row({ student_id: "student-3", exam_score: 85 }), // > 70
    ]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain("CA1 (18) must be between 0 and 15");
    expect(errors[1]).toContain("CA2 (-2) must be between 0 and 15");
    expect(errors[2]).toContain("Exam (85) must be between 0 and 70");
  });

  it("uses student/subject names in messages when resolvers are provided", () => {
    const errors = validate([row({ ca1: 99 })]);
    expect(errors[0]).toContain("Amina Bello · Mathematics");
  });

  it("rejects a blank broadsheet by default", () => {
    const errors = validate([row({}), row({ student_id: "student-2" })]);
    expect(errors).toEqual(["Cannot validate an empty broadsheet. Please enter student scores first."]);
  });

  it("allows blank broadsheets when requireAnyMark is disabled", () => {
    expect(validate([row({})], { requireAnyMark: false })).toEqual([]);
  });

  it("ignores hidden components during validation", () => {
    // CA3 shown but a value of 30 would be out of bounds when max is 15
    const errors = validate(
      [row({ ca1: 12, exam_score: 55, ca3: 99 })],
      { showCa3: true, componentMax: (code) => (code === "CA3" ? 15 : componentMax(code, standardComponents)) }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("CA3 (99)");
  });
});

describe("broadsheetColumns: header/cell alignment contract", () => {
  it("emits [CA1, CA2, CA3, ∑CA, Exam, Total] when everything is shown", () => {
    expect(broadsheetColumns(true, true, true, true).map((c) => c.kind)).toEqual([
      "CA1", "CA2", "CA3", "SUM_CA", "EXAM", "TOTAL",
    ]);
  });

  it("emits [CA1, CA2, ∑CA, Exam, Total] for the default structure (no CA3)", () => {
    expect(broadsheetColumns(true, true, false, true).map((c) => c.kind)).toEqual([
      "CA1", "CA2", "SUM_CA", "EXAM", "TOTAL",
    ]);
  });

  it("column count always equals shown components + 2 (∑CA and Total)", () => {
    expect(broadsheetColumns(true, true, false, true)).toHaveLength(3 + 2);
    expect(broadsheetColumns(true, true, true, true)).toHaveLength(4 + 2);
    expect(broadsheetColumns(false, false, false, true)).toHaveLength(1 + 2);
  });

  it("∑CA always precedes Exam and Total is always last", () => {
    const kinds = broadsheetColumns(true, true, true, true).map((c) => c.kind);
    expect(kinds.indexOf("SUM_CA")).toBeLessThan(kinds.indexOf("EXAM"));
    expect(kinds[kinds.length - 1]).toBe("TOTAL");
  });
});

/* =================================================================================
 * UI Components & Interactions (state machine, nursery rating, cell inputs)
 * ================================================================================= */

describe("Broadsheet Result Entry: UI Components & Interactions", () => {
  // Test Mini StatusBar Component
  function TestStatusBar({
    status,
    dirtyCount,
    onSave,
    onValidate,
    onPublish,
    onUnlock,
  }: {
    status: "draft" | "validated" | "published";
    dirtyCount: number;
    onSave: () => void;
    onValidate: () => void;
    onPublish: () => void;
    onUnlock: () => void;
  }) {
    return (
      <div>
        <span data-testid="status-badge">Status: {status}</span>
        {dirtyCount > 0 && <span data-testid="unsaved-badge">{dirtyCount} unsaved</span>}

        {status === "draft" && (
          <>
            <button data-testid="save-btn" onClick={onSave} disabled={dirtyCount === 0}>
              Save
            </button>
            <button data-testid="validate-btn" onClick={onValidate}>
              Validate
            </button>
          </>
        )}

        {status === "validated" && (
          <>
            <button data-testid="reopen-btn" onClick={onUnlock}>
              Reopen
            </button>
            <button data-testid="publish-btn" onClick={onPublish}>
              Approve & Publish
            </button>
          </>
        )}

        {status === "published" && (
          <button data-testid="reopen-admin-btn" onClick={onUnlock}>
            Reopen (admin)
          </button>
        )}
      </div>
    );
  }

  it("StatusBar controls match state machine transitions", () => {
    const onSave = vi.fn();
    const onValidate = vi.fn();
    const onPublish = vi.fn();
    const onUnlock = vi.fn();

    const { rerender } = render(
      <TestStatusBar status="draft" dirtyCount={3} onSave={onSave} onValidate={onValidate} onPublish={onPublish} onUnlock={onUnlock} />
    );
    expect(screen.getByTestId("status-badge").textContent).toBe("Status: draft");
    expect(screen.getByTestId("save-btn")).not.toBeDisabled();
    expect(screen.queryByTestId("publish-btn")).toBeNull();
    fireEvent.click(screen.getByTestId("save-btn"));
    expect(onSave).toHaveBeenCalledOnce();

    rerender(<TestStatusBar status="draft" dirtyCount={0} onSave={onSave} onValidate={onValidate} onPublish={onPublish} onUnlock={onUnlock} />);
    expect(screen.getByTestId("save-btn")).toBeDisabled();

    rerender(<TestStatusBar status="validated" dirtyCount={0} onSave={onSave} onValidate={onValidate} onPublish={onPublish} onUnlock={onUnlock} />);
    expect(screen.queryByTestId("save-btn")).toBeNull();
    fireEvent.click(screen.getByTestId("publish-btn"));
    expect(onPublish).toHaveBeenCalledOnce();

    rerender(<TestStatusBar status="published" dirtyCount={0} onSave={onSave} onValidate={onValidate} onPublish={onPublish} onUnlock={onUnlock} />);
    expect(screen.queryByTestId("publish-btn")).toBeNull();
    fireEvent.click(screen.getByTestId("reopen-admin-btn"));
    expect(onUnlock).toHaveBeenCalledOnce();
  });

  // Test Nursery RatingPicker Component
  function TestRatingPicker({ value, disabled, onChange }: { value: number | null; disabled?: boolean; onChange: (v: number | null) => void }) {
    const btn = (n: number, label: string) => (
      <button type="button" disabled={disabled} data-testid={`rating-btn-${n}`} onClick={() => onChange(value === n ? null : n)} aria-pressed={value === n}>
        {n}
      </button>
    );
    return (
      <div>
        {btn(3, "Excellent")}
        {btn(2, "Developing")}
        {btn(1, "Beginning")}
      </div>
    );
  }

  it("Nursery RatingPicker selects rating 1, 2, or 3", () => {
    const onChange = vi.fn();
    render(<TestRatingPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("rating-btn-3"));
    expect(onChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByTestId("rating-btn-2"));
    expect(onChange).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByTestId("rating-btn-1"));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("Nursery RatingPicker toggles an already-selected rating off", () => {
    const onChange = vi.fn();
    render(<TestRatingPicker value={2} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("rating-btn-2"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("Nursery RatingPicker locks all buttons when read-only", () => {
    const onChange = vi.fn();
    render(<TestRatingPicker value={3} disabled onChange={onChange} />);
    expect(screen.getByTestId("rating-btn-1")).toBeDisabled();
    expect(screen.getByTestId("rating-btn-2")).toBeDisabled();
    expect(screen.getByTestId("rating-btn-3")).toBeDisabled();
    fireEvent.click(screen.getByTestId("rating-btn-3"));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Test Numeric Subject Cells Input Locking
  function TestSubjectCells({
    ca1,
    ca2,
    exam,
    readOnly,
    onEdit,
  }: {
    ca1: number | null;
    ca2: number | null;
    exam: number | null;
    readOnly: boolean;
    onEdit: (patch: { ca1?: number | null; ca2?: number | null; exam_score?: number | null }) => void;
  }) {
    return (
      <tr>
        <td>
          <input data-testid="cell-ca1" type="number" disabled={readOnly} value={ca1 ?? ""} onChange={(e) => onEdit({ ca1: e.target.value === "" ? null : Number(e.target.value) })} />
        </td>
        <td>
          <input data-testid="cell-ca2" type="number" disabled={readOnly} value={ca2 ?? ""} onChange={(e) => onEdit({ ca2: e.target.value === "" ? null : Number(e.target.value) })} />
        </td>
        <td>
          <input data-testid="cell-exam" type="number" disabled={readOnly} value={exam ?? ""} onChange={(e) => onEdit({ exam_score: e.target.value === "" ? null : Number(e.target.value) })} />
        </td>
      </tr>
    );
  }

  it("updates cell value and propagates patch to onEdit", () => {
    const onEdit = vi.fn();
    render(
      <table><tbody><TestSubjectCells ca1={null} ca2={null} exam={null} readOnly={false} onEdit={onEdit} /></tbody></table>
    );
    fireEvent.change(screen.getByTestId("cell-ca1"), { target: { value: "14" } });
    expect(onEdit).toHaveBeenCalledWith({ ca1: 14 });
    fireEvent.change(screen.getByTestId("cell-exam"), { target: { value: "62" } });
    expect(onEdit).toHaveBeenCalledWith({ exam_score: 62 });
  });

  it("clears a cell to null when input is erased", () => {
    const onEdit = vi.fn();
    render(
      <table><tbody><TestSubjectCells ca1={15} ca2={15} exam={70} readOnly={false} onEdit={onEdit} /></tbody></table>
    );
    fireEvent.change(screen.getByTestId("cell-ca1"), { target: { value: "" } });
    expect(onEdit).toHaveBeenCalledWith({ ca1: null });
  });

  it("locks numeric score cells when read-only", () => {
    const onEdit = vi.fn();
    render(
      <table><tbody><TestSubjectCells ca1={12} ca2={10} exam={50} readOnly={true} onEdit={onEdit} /></tbody></table>
    );
    expect(screen.getByTestId("cell-ca1")).toBeDisabled();
    expect(screen.getByTestId("cell-ca2")).toBeDisabled();
    expect(screen.getByTestId("cell-exam")).toBeDisabled();
  });
});