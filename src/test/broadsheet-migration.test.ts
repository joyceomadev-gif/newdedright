import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the broadsheet publish → continuous_assessments sync trigger.
 * The trigger previously stored normalized 0-100 values with max_score = 100, which
 * inflated every consumer that re-applies the component max. These assertions pin the
 * raw-mark contract so the normalization bug cannot be reintroduced in the migration.
 *
 * Two migrations define the trigger: 20260907100000 (original raw-mark rewrite) and
 * 20260907110000 (same body + trigger (re)binding). On a fresh database the LATEST
 * definition wins, so both must carry the contract and the guard asserts both.
 */
const MIGRATIONS = [
  "20260907100000_sync_broadsheet_exam_to_continuous_assessments.sql",
  "20260907110000_harden_broadsheet_sync_raw_marks.sql",
].map((name) => ({
  name,
  sql: readFileSync(join(__dirname, `../../supabase/migrations/${name}`), "utf8"),
}));

const latest = MIGRATIONS[MIGRATIONS.length - 1];

describe("sync_broadsheet_to_continuous_assessments migration contract", () => {
  for (const { name, sql } of MIGRATIONS) {
    describe(name, () => {
      it("stores raw marks with their true component maxes", () => {
        expect(sql).toContain("b.ca1,");
        expect(sql).toContain("v_ca1_max,");
        expect(sql).toContain("b.ca2,");
        expect(sql).toContain("v_ca2_max,");
        expect(sql).toContain("b.exam_score,");
        expect(sql).toContain("v_exam_max,");
      });

      it("does NOT normalize CA/exam scores to 0-100 percentages", () => {
        // The earlier buggy implementation used ROUND((b.<comp> / v_<comp>_max) * 100, 2)
        // with max_score = 100. Guard against reintroduction.
        expect(sql).not.toMatch(/ROUND\(\s*b\.(ca1|ca2|ca3|exam_score)\s*\/\s*v_[a-z0-9_]+/) ;
        expect(sql).not.toContain("ROUND((b.ca1");
        expect(sql).not.toContain("ROUND((b.exam_score");
      });

      it("syncs exam scores into continuous_assessments so downstream consumers see them", () => {
        expect(sql).toMatch(/'exam'::ca_type/);
        expect(sql).toContain("'[broadsheet] Exam'");
        expect(sql).toContain("AND b.exam_score IS NOT NULL");
      });

      it("cleans up previously synced rows before re-inserting", () => {
        expect(sql).toMatch(/DELETE FROM public\.continuous_assessments[\s\S]*?term_id = NEW\.term_id/);
        expect(sql).toMatch(/title LIKE '\[broadsheet\]%'/);
        expect(sql).toMatch(/class_id = NEW\.class_id/);
      });

      it("resolves component maxes from the assessment structure with sane defaults", () => {
        expect(sql).toContain("v_ca1_max numeric := 15");
        expect(sql).toContain("v_ca2_max numeric := 15");
        expect(sql).toContain("v_exam_max numeric := 70");
        expect(sql).toMatch(/COALESCE\(c\.max_score, 15\) INTO v_ca1_max/);
        expect(sql).toMatch(/COALESCE\(c\.max_score, 70\) INTO v_exam_max/);
      });

      it("only fires when status transitions TO published", () => {
        expect(sql).toMatch(/IF OLD\.status = 'published' OR NEW\.status <> 'published'/);
      });
    });
  }

  it("binds the trigger in the latest (effective) migration so a fresh DB runs the guarded body", () => {
    expect(latest.sql).toContain("DROP TRIGGER IF EXISTS trg_sync_broadsheet_to_ca");
    expect(latest.sql).toMatch(/CREATE TRIGGER trg_sync_broadsheet_to_ca[\s\S]*?AFTER UPDATE ON public\.broadsheet_headers/);
    expect(latest.sql).toMatch(/WHEN \(OLD\.status IS DISTINCT FROM NEW\.status\)/);
  });
});
