/**
 * Snapshot tests for the Gradebook rendering contract:
 * - display_only: hides cumulative + grade columns, shows raw "ca / ca / E:exam" parts
 * - computed schemes: shows term totals, cumulative, and grade
 *
 * We render a minimal mirror of GradebookTable that uses the SAME shared
 * scoring lib, so any regression in computeTermTotal / computeCumulative /
 * gradeFor or the "showComputed" gating breaks the snapshot.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  computeTermTotal,
  computeCumulative,
  gradeFor,
  pct,
  DEFAULT_SETTINGS,
  type SchoolSettings,
} from "./scoring";

interface Inputs { caScoresPct: number[]; examScorePct: number | null }

function MiniGradebook({
  settings,
  studentName,
  termInputs,
}: {
  settings: SchoolSettings;
  studentName: string;
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
          {showComputed && <th>Cumulative</th>}
          {showComputed && <th>Grade</th>}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{studentName}</td>
          {termInputs.map((t, i) => {
            if (!showComputed) {
              const parts = t.caScoresPct.map((p) => p.toFixed(0));
              if (t.examScorePct != null) parts.push(`E:${t.examScorePct.toFixed(0)}`);
              return <td key={i} data-testid={`raw-${i}`}>{parts.length ? parts.join(" / ") : "—"}</td>;
            }
            return <td key={i} data-testid={`total-${i}`}>{totals[i] != null ? totals[i]!.toFixed(2) : "—"}</td>;
          })}
          {showComputed && <td data-testid="cumulative">{cum != null ? cum.toFixed(2) : "—"}</td>}
          {showComputed && <td data-testid="grade">{gb?.grade ?? "—"}</td>}
        </tr>
      </tbody>
    </table>
  );
}

const sampleTerms: Inputs[] = [
  { caScoresPct: [pct(8, 10), pct(9, 10)], examScorePct: pct(70, 100) }, // 80, 90, 70
  { caScoresPct: [pct(7, 10), pct(8, 10)], examScorePct: pct(65, 100) }, // 70, 80, 65
  { caScoresPct: [pct(9, 10), pct(9, 10)], examScorePct: pct(80, 100) }, // 90, 90, 80
];

describe("Gradebook render — display_only", () => {
  const settings: SchoolSettings = { ...DEFAULT_SETTINGS, scoring_scheme: "display_only" };

  it("hides cumulative/grade and renders raw CA/Exam parts", () => {
    const { container, queryByTestId, getByTestId } = render(
      <MiniGradebook settings={settings} studentName="Ada" termInputs={sampleTerms} />,
    );
    expect(queryByTestId("cumulative")).toBeNull();
    expect(queryByTestId("grade")).toBeNull();
    expect(getByTestId("raw-0").textContent).toBe("80 / 90 / E:70");
    expect(getByTestId("raw-1").textContent).toBe("70 / 80 / E:65");
    expect(getByTestId("raw-2").textContent).toBe("90 / 90 / E:80");
    // No computed-total cells
    expect(container.querySelector('[data-testid^="total-"]')).toBeNull();
    expect(container).toMatchSnapshot();
  });

  it("shows '—' for an empty term", () => {
    const { getByTestId } = render(
      <MiniGradebook settings={settings} studentName="Ada" termInputs={[{ caScoresPct: [], examScorePct: null }]} />,
    );
    expect(getByTestId("raw-0").textContent).toBe("—");
  });

  it("renders raw parts when the exam score is missing (CA-only)", () => {
    const { container, queryByTestId, getByTestId } = render(
      <MiniGradebook
        settings={settings}
        studentName="Bola"
        termInputs={[{ caScoresPct: [pct(8, 10), pct(9, 10)], examScorePct: null }]}
      />,
    );
    expect(getByTestId("raw-0").textContent).toBe("80 / 90");
    expect(queryByTestId("cumulative")).toBeNull();
    expect(queryByTestId("grade")).toBeNull();
    expect(container).toMatchSnapshot();
  });

  it("renders raw parts when only one CA was recorded (partial CAs)", () => {
    const { container, queryByTestId, getByTestId } = render(
      <MiniGradebook
        settings={settings}
        studentName="Chinwe"
        termInputs={[{ caScoresPct: [pct(7, 10)], examScorePct: pct(60, 100) }]}
      />,
    );
    expect(getByTestId("raw-0").textContent).toBe("70 / E:60");
    expect(queryByTestId("cumulative")).toBeNull();
    expect(queryByTestId("grade")).toBeNull();
    expect(container).toMatchSnapshot();
  });

  it("mixes empty, partial, and full terms without leaking computed columns", () => {
    const mixed: Inputs[] = [
      { caScoresPct: [], examScorePct: null },                              // empty
      { caScoresPct: [pct(6, 10)], examScorePct: null },                    // partial CAs, no exam
      { caScoresPct: [pct(8, 10), pct(9, 10)], examScorePct: pct(70, 100) },// full
    ];
    const { container, queryByTestId, getByTestId } = render(
      <MiniGradebook settings={settings} studentName="Dapo" termInputs={mixed} />,
    );
    expect(getByTestId("raw-0").textContent).toBe("—");
    expect(getByTestId("raw-1").textContent).toBe("60");
    expect(getByTestId("raw-2").textContent).toBe("80 / 90 / E:70");
    expect(queryByTestId("cumulative")).toBeNull();
    expect(queryByTestId("grade")).toBeNull();
    expect(container.querySelector('[data-testid^="total-"]')).toBeNull();
    expect(container).toMatchSnapshot();
  });
});

describe("Gradebook render — weighted_ca_exam", () => {
  const settings: SchoolSettings = { ...DEFAULT_SETTINGS };

  it("shows term totals, cumulative average, and grade", () => {
    const { getByTestId, container } = render(
      <MiniGradebook settings={settings} studentName="Ada" termInputs={sampleTerms} />,
    );
    // term1: 80*15 + 90*15 + 70*70 = 7450/100 = 74.5
    expect(getByTestId("total-0").textContent).toBe("74.50");
    // term2: 70*15 + 80*15 + 65*70 = 6800/100 = 68
    expect(getByTestId("total-1").textContent).toBe("68.00");
    // term3: 90*15 + 90*15 + 80*70 = 8300/100 = 83
    expect(getByTestId("total-2").textContent).toBe("83.00");
    // average_of_terms => (74.5+68+83)/3 = 75.1666... => 75.17
    expect(getByTestId("cumulative").textContent).toBe("75.17");
    expect(getByTestId("grade").textContent).toBe("A");
    expect(container).toMatchSnapshot();
  });
});

describe("Gradebook render — running_average + sum_of_terms", () => {
  const settings: SchoolSettings = {
    ...DEFAULT_SETTINGS,
    scoring_scheme: "running_average",
    cumulative_method: "sum_of_terms",
  };
  it("averages each term and sums across terms", () => {
    const { getByTestId } = render(
      <MiniGradebook settings={settings} studentName="Ada" termInputs={sampleTerms} />,
    );
    // term1 avg(80,90,70)=80; term2 avg(70,80,65)=71.67; term3 avg(90,90,80)=86.67
    expect(getByTestId("total-0").textContent).toBe("80.00");
    expect(getByTestId("total-1").textContent).toBe("71.67");
    expect(getByTestId("total-2").textContent).toBe("86.67");
    // sum = 238.34
    expect(getByTestId("cumulative").textContent).toBe("238.34");
  });
});
