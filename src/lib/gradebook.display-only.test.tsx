/**
 * UI test: in display_only mode, ALL computed columns (per-term totals,
 * cumulative totals, and grade) must stay hidden — even when every term
 * has complete CA + Exam data that would otherwise compute cleanly under
 * weighted_ca_exam.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  computeTermTotal,
  computeCumulative,
  gradeFor,
  formatRawTermParts,
  pct,
  DEFAULT_SETTINGS,
  type SchoolSettings,
} from "./scoring";

interface Inputs { caScoresPct: number[]; examScorePct: number | null }

function MiniGradebook({
  settings,
  termInputs,
}: {
  settings: SchoolSettings;
  termInputs: Inputs[];
}) {
  const showComputed = settings.scoring_scheme !== "display_only";
  const totals = termInputs.map((t) => computeTermTotal(settings, t));
  const cum = computeCumulative(settings, totals);
  const gb = gradeFor(settings, cum);
  return (
    <table>
      <thead>
        <tr>
          <th>Student</th>
          {termInputs.map((_, i) => <th key={i}>Term {i + 1}</th>)}
          {showComputed && <th data-testid="header-cumulative">Cumulative</th>}
          {showComputed && <th data-testid="header-grade">Grade</th>}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ada</td>
          {termInputs.map((t, i) =>
            showComputed ? (
              <td key={i} data-testid={`total-${i}`}>
                {totals[i] != null ? totals[i]!.toFixed(2) : "—"}
              </td>
            ) : (
              <td key={i} data-testid={`raw-${i}`}>{formatRawTermParts(t)}</td>
            ),
          )}
          {showComputed && <td data-testid="cumulative">{cum != null ? cum.toFixed(2) : "—"}</td>}
          {showComputed && <td data-testid="grade">{gb?.grade ?? "—"}</td>}
        </tr>
      </tbody>
    </table>
  );
}

const fullTerms: Inputs[] = [
  { caScoresPct: [pct(8, 10), pct(9, 10)], examScorePct: pct(70, 100) },
  { caScoresPct: [pct(7, 10), pct(8, 10)], examScorePct: pct(65, 100) },
  { caScoresPct: [pct(9, 10), pct(9, 10)], examScorePct: pct(80, 100) },
];

describe("Gradebook display_only — hides ALL computed columns even with full data", () => {
  const settings: SchoolSettings = { ...DEFAULT_SETTINGS, scoring_scheme: "display_only" };

  it("does not render per-term total cells", () => {
    const { container } = render(<MiniGradebook settings={settings} termInputs={fullTerms} />);
    expect(container.querySelectorAll('[data-testid^="total-"]').length).toBe(0);
  });

  it("does not render the cumulative cell or its header", () => {
    const { queryByTestId } = render(
      <MiniGradebook settings={settings} termInputs={fullTerms} />,
    );
    expect(queryByTestId("cumulative")).toBeNull();
    expect(queryByTestId("header-cumulative")).toBeNull();
  });

  it("does not render the grade cell or its header", () => {
    const { queryByTestId } = render(
      <MiniGradebook settings={settings} termInputs={fullTerms} />,
    );
    expect(queryByTestId("grade")).toBeNull();
    expect(queryByTestId("header-grade")).toBeNull();
  });

  it("does not leak the words 'Cumulative' or 'Grade' anywhere in the output", () => {
    const { container } = render(<MiniGradebook settings={settings} termInputs={fullTerms} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Cumulative/);
    expect(text).not.toMatch(/Grade/);
  });

  it("renders the raw CA / Exam string for each term instead", () => {
    const { getByTestId } = render(
      <MiniGradebook settings={settings} termInputs={fullTerms} />,
    );
    expect(getByTestId("raw-0").textContent).toBe("80 / 90 / E:70");
    expect(getByTestId("raw-1").textContent).toBe("70 / 80 / E:65");
    expect(getByTestId("raw-2").textContent).toBe("90 / 90 / E:80");
  });

  it("flipping back to weighted_ca_exam re-introduces the computed columns", () => {
    const computed: SchoolSettings = { ...DEFAULT_SETTINGS, scoring_scheme: "weighted_ca_exam" };
    const { getByTestId, queryByTestId } = render(
      <MiniGradebook settings={computed} termInputs={fullTerms} />,
    );
    expect(getByTestId("cumulative")).not.toBeNull();
    expect(getByTestId("grade")).not.toBeNull();
    expect(getByTestId("total-0")).not.toBeNull();
    expect(queryByTestId("raw-0")).toBeNull();
  });
});
