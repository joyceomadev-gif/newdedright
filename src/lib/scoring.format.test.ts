/**
 * Unit tests for the display_only raw formatter (formatRawTermParts):
 *   - rounds CA / Exam to integers
 *   - separates parts with " / "
 *   - prefixes the exam score with "E:"
 *   - skips missing CAs (null/undefined/NaN) instead of rendering "0"
 *   - returns "—" when nothing is recorded
 */
import { describe, it, expect } from "vitest";
import { formatRawTermParts } from "./scoring";

describe("formatRawTermParts — display_only formatting", () => {
  it("formats two CAs and an exam with ' / ' separators and 'E:' prefix", () => {
    expect(formatRawTermParts({ caScoresPct: [80, 90], examScorePct: 70 })).toBe(
      "80 / 90 / E:70",
    );
  });

  it("rounds fractional CA and exam scores to the nearest integer", () => {
    expect(formatRawTermParts({ caScoresPct: [80.4, 89.6], examScorePct: 70.5 })).toBe(
      "80 / 90 / E:71",
    );
    expect(formatRawTermParts({ caScoresPct: [49.49], examScorePct: 49.5 })).toBe(
      "49 / E:50",
    );
  });

  it("renders the exam-only case with just the 'E:' prefix", () => {
    expect(formatRawTermParts({ caScoresPct: [], examScorePct: 60 })).toBe("E:60");
  });

  it("renders the CA-only case (no exam) without a trailing separator", () => {
    expect(formatRawTermParts({ caScoresPct: [80, 90], examScorePct: null })).toBe(
      "80 / 90",
    );
  });

  it("renders a single CA without any separator", () => {
    expect(formatRawTermParts({ caScoresPct: [70], examScorePct: null })).toBe("70");
  });

  it("returns '—' when nothing is recorded", () => {
    expect(formatRawTermParts({ caScoresPct: [], examScorePct: null })).toBe("—");
  });

  it("skips missing CA entries (null / undefined / NaN) instead of rendering '0'", () => {
    const cas = [80, null as unknown as number, undefined as unknown as number, Number.NaN, 90];
    expect(formatRawTermParts({ caScoresPct: cas, examScorePct: null })).toBe("80 / 90");
  });

  it("treats NaN exam scores as missing", () => {
    expect(formatRawTermParts({ caScoresPct: [70], examScorePct: Number.NaN })).toBe("70");
  });

  it("supports more than two CAs, preserving order", () => {
    expect(
      formatRawTermParts({ caScoresPct: [60, 70, 80, 90], examScorePct: 55 }),
    ).toBe("60 / 70 / 80 / 90 / E:55");
  });

  it("rounds boundary half-values consistently with Math.round", () => {
    // Math.round(0.5) === 1, Math.round(-0.5) === 0 in JS
    expect(formatRawTermParts({ caScoresPct: [0.5], examScorePct: null })).toBe("1");
  });
});
