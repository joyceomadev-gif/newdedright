/**
 * UnifiedReportCard — pure presentation component.
 *
 * Renders a single A4-portrait report card for any educational level (Nursery,
 * Primary, Secondary) from a `TemplateLayout` + optional live data.
 * Nothing in this file talks to the database. Callers supply the layout and
 * (optionally) student/academic data; missing data is rendered as a blank
 * cell so the same component works for both live report cards and template
 * previews.
 *
 * Two display modes are supported for academics:
 *   - Expanded  → every competency item shown with its rating
 *                 (Nursery / Learning Areas)
 *   - Summary   → one row per subject with CA / Exam / Total / Grade
 *                 (Primary / Secondary)
 * A "hybrid" template can render both.
 *
 * Additional dynamic assessment sections (Conduct, Handwriting, Library,
 * Enrichment, Psychomotor, Affective, etc.) render below academics using
 * the same "item + rating" grid — the section titles and items are pulled
 * from `layout.assessmentSections`, never hardcoded.
 */

import type { TemplateLayout } from "@/lib/report-templates-defaults";
import { DEFAULT_GRADE_SCALE, NURSERY_RATING } from "@/lib/report-templates-defaults";
import logo from "@/assets/de-bright-logo.png.asset.json";

export interface StudentInfo {
  name?: string;
  admissionNumber?: string;
  className?: string;
  age?: string | number;
  photoUrl?: string;
  attendance?: string;   // e.g. "100/100"
  daysOpen?: number | string;
  daysAbsent?: number | string;
  classTeacher?: string;
  numberInClass?: number | string;
  overallPosition?: string;
  classAverage?: number | string;
}

export interface SubjectScore {
  subject: string;
  ca1?: number | null;
  ca2?: number | null;
  ca3?: number | null;
  exam?: number | null;
  classAverage?: number | null;
  remark?: string;
}

export interface CompetencyRating {
  areaId: string;      // matches CompetencyArea.id or AssessmentSection.id
  itemIndex: number;   // 0-based index within items[]
  rating: string;      // matches RatingLevel.code OR numeric score
}

export interface UnifiedReportCardProps {
  layout: TemplateLayout;
  student?: StudentInfo;
  /** For Summary mode. If omitted, `layout.subjectsPlaceholder` is used. */
  subjects?: SubjectScore[];
  /** Marks for competency areas (Expanded mode). Optional. */
  competencyRatings?: CompetencyRating[];
  /** Marks for extra sections. Optional. */
  sectionRatings?: CompetencyRating[];
  teacherComment?: string;
  directorComment?: string;
  principalComment?: string;
  vacationDate?: string;
  resumptionDate?: string;
  caMax?: { ca1: number; ca2: number; ca3: number };
  examMax?: number;
  totalMax?: number;
  /** Wrapper id — kept default so global print styles pick it up. */
  id?: string;
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}

export function UnifiedReportCard({
  layout,
  student = {},
  subjects,
  competencyRatings = [],
  sectionRatings = [],
  teacherComment,
  directorComment,
  principalComment,
  vacationDate,
  resumptionDate,
  caMax = { ca1: 15, ca2: 15, ca3: 0 },
  examMax = 70,
  totalMax = 100,
  id = "report-card-printable",
}: UnifiedReportCardProps) {
  const CA_MAX = caMax;
  const EXAM_MAX = examMax;
  const TOTAL_MAX = totalMax;
  const h = layout.header ?? {};
  const rating = layout.ratingScale ?? NURSERY_RATING;
  const grades = layout.gradeScale ?? DEFAULT_GRADE_SCALE;

  // Build subject rows: prefer live scores; fall back to placeholder names
  // with blank cells.
  const scoreRows: SubjectScore[] =
    subjects && subjects.length > 0
      ? subjects
      : (layout.subjectsPlaceholder ?? []).map((s) => ({ subject: s }));

  // Rating lookup helpers.
  const ratingFor = (list: CompetencyRating[], areaId: string, i: number) =>
    list.find((r) => r.areaId === areaId && r.itemIndex === i)?.rating ?? "";

  // Academic summary aggregation.
  const totals = scoreRows.map((r) => num(r.ca1) + num(r.ca2) + num(r.ca3) + num(r.exam));
  const totalObtained = totals.reduce((a, b) => a + b, 0);
  const totalObtainable = scoreRows.length * TOTAL_MAX;
  const studentAverage = scoreRows.length
    ? (totalObtained / scoreRows.length).toFixed(2)
    : "—";

  const showAcademicSummary =
    layout.kind !== "competency" &&
    !!layout.summary &&
    Object.values(layout.summary).some(Boolean);

  return (
    <div
      id={id}
      className="report-card mx-auto bg-white text-black font-sans text-[11px] leading-tight"
      style={{ width: "210mm", minHeight: "297mm", padding: "10mm" }}
    >
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="rc-header flex items-stretch gap-3 border-b-2 border-primary pb-2 mb-3">
        {h.showLogo !== false && (
          <img src={logo.url} alt="School logo" className="h-16 w-auto object-contain" />
        )}
        <div className="flex-1 text-center flex flex-col justify-center">
          <div className="text-lg font-bold uppercase tracking-wide">
            {h.schoolName || "De-Bright Group of Schools"}
          </div>
          {h.address && <div className="text-[10px] italic">{h.address}</div>}
          {h.tagline && (
            <div className="text-xs font-semibold mt-0.5">{h.tagline}</div>
          )}
        </div>
        {h.showPhoto !== false && (
          <div className="w-20 h-24 border border-gray-400 flex items-center justify-center overflow-hidden bg-gray-50">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt="Student" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[9px] text-gray-400">Photo</span>
            )}
          </div>
        )}
      </header>

      {/* ─── Student / Session bio-data ─────────────────────────────── */}
      <section className="rc-bio grid grid-cols-3 gap-x-4 gap-y-1 border border-gray-300 p-2 mb-3">
        <Field label="Student Name" value={student.name} />
        <Field label="Class" value={student.className} />
        <Field label="Session" value={h.session} />
        {h.showAdmissionNumber !== false && (
          <Field label="Admission No." value={student.admissionNumber} />
        )}
        <Field label="Term" value={h.term} />
        {h.showAge && <Field label="Age" value={student.age} />}
        {h.showClassTeacher && (
          <Field label="Class Teacher" value={student.classTeacher} />
        )}
        {h.showAttendance && <Field label="Attendance" value={student.attendance} />}
        {h.showDaysOpen && <Field label="Days School Open" value={student.daysOpen} />}
        {h.showDaysAbsent && <Field label="Days Absent" value={student.daysAbsent} />}
        {h.theme && <Field label="Theme for the Term" value={h.theme} />}
      </section>

      {/* ─── Rating key (used across expanded + additional sections) ── */}
      {(layout.kind === "competency" || layout.kind === "hybrid" ||
        (layout.assessmentSections?.length ?? 0) > 0) && (
        <section className="rc-key flex flex-wrap items-center gap-3 text-[10px] mb-2">
          <span className="font-semibold uppercase">Key:</span>
          {rating.map((r) => (
            <span key={r.code} className="inline-flex items-center gap-1">
              <span className="font-bold">{r.code}</span>
              <span>– {r.label}</span>
            </span>
          ))}
        </section>
      )}

      {/* ─── Mode 1: Expanded / Competency ──────────────────────────── */}
      {(layout.kind === "competency" || layout.kind === "hybrid") &&
        (layout.competencyAreas ?? []).map((area) => (
          <ItemRatingTable
            key={area.id}
            title={area.title}
            items={area.items}
            ratingScale={rating}
            getRating={(i) => ratingFor(competencyRatings, area.id, i)}
          />
        ))}

      {/* ─── Mode 2: Summary / Score ────────────────────────────────── */}
      {(layout.kind === "score" || layout.kind === "hybrid") && (
        <>
          <SectionTitle>Academic Performance</SectionTitle>
          <table className="w-full border-collapse text-[10px] mb-2">
            <thead>
              <tr className="bg-primary/10">
                <th className="border border-gray-400 p-1 text-left">Subject</th>
                <th className="border border-gray-400 p-1 w-10 text-center">CA1<br/>({CA_MAX.ca1})</th>
                <th className="border border-gray-400 p-1 w-10 text-center">CA2<br/>({CA_MAX.ca2})</th>
                <th className="border border-gray-400 p-1 w-10 text-center">CA3<br/>({CA_MAX.ca3})</th>
                <th className="border border-gray-400 p-1 w-12 text-center">Exam<br/>({EXAM_MAX})</th>
                <th className="border border-gray-400 p-1 w-12 text-center">Total<br/>({TOTAL_MAX})</th>
                <th className="border border-gray-400 p-1 w-14 text-center">Class Avg</th>
                <th className="border border-gray-400 p-1 w-10 text-center">Grade</th>
                <th className="border border-gray-400 p-1 text-left">Remark</th>
              </tr>
            </thead>
            <tbody>
              {scoreRows.length === 0 ? (
                <tr>
                  <td className="border border-gray-400 p-2 text-center text-gray-500" colSpan={9}>
                    No subjects configured for this class.
                  </td>
                </tr>
              ) : scoreRows.map((r, i) => {
                const total = totals[i];
                const filled =
                  r.ca1 != null || r.ca2 != null || r.ca3 != null || r.exam != null;
                const band = filled
                  ? grades.find((g) => total >= g.min && total <= g.max)
                  : null;
                return (
                  <tr key={i} className="odd:bg-gray-50">
                    <td className="border border-gray-400 p-1">{r.subject}</td>
                    <Cell v={r.ca1} />
                    <Cell v={r.ca2} />
                    <Cell v={r.ca3} />
                    <Cell v={r.exam} />
                    <td className="border border-gray-400 p-1 text-center font-semibold">
                      {filled ? total : ""}
                    </td>
                    <Cell v={r.classAverage} />
                    <td className="border border-gray-400 p-1 text-center font-semibold">
                      {band?.grade ?? ""}
                    </td>
                    <td className="border border-gray-400 p-1">{r.remark ?? band?.remark ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Academic summary */}
          {showAcademicSummary && (
            <section className="rc-summary grid grid-cols-3 gap-x-4 gap-y-1 border border-gray-300 p-2 mb-3 text-[10px]">
              {layout.summary?.showTotalSubjects && (
                <Field label="Total Subjects Offered" value={scoreRows.length} />
              )}
              {layout.summary?.showObtainable && (
                <Field label="Marks Obtainable" value={totalObtainable || ""} />
              )}
              {layout.summary?.showObtained && (
                <Field label="Marks Obtained" value={totalObtained || ""} />
              )}
              {layout.summary?.showAverage && (
                <Field label="Student's Average" value={totalObtained ? studentAverage : ""} />
              )}
              {layout.summary?.showClassAverage && (
                <Field label="Overall Class Average" value={student.classAverage} />
              )}
              {layout.summary?.showPosition && (
                <Field label="Overall Position" value={student.overallPosition} />
              )}
            </section>
          )}

          {/* Grade scale reference */}
          <div className="text-[9px] mb-3">
            <span className="font-semibold uppercase mr-2">Grade scale:</span>
            {grades.map((g, i) => (
              <span key={i} className="inline-block mr-3">
                {g.grade} = {g.min}–{g.max} ({g.remark})
              </span>
            ))}
          </div>
        </>
      )}

      {/* ─── Additional dynamic assessment sections ─────────────────── */}
      {(layout.assessmentSections?.length ?? 0) > 0 && (
        <SectionTitle>Additional Assessments</SectionTitle>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(layout.assessmentSections ?? []).map((sec) => (
          <ItemRatingTable
            key={sec.id}
            title={sec.title}
            items={sec.items}
            ratingScale={rating}
            getRating={(i) => ratingFor(sectionRatings, sec.id, i)}
            dense
          />
        ))}
      </div>

      {/* ─── Remarks ────────────────────────────────────────────────── */}
      <section className="rc-remarks mt-3 space-y-2">
        {layout.comments?.teacherPrompt !== undefined && (
          <RemarkBlock
            label={layout.comments?.teacherPrompt || "Teacher's Remark"}
            value={teacherComment}
          />
        )}
        {layout.comments?.directorPrompt !== undefined && (
          <RemarkBlock
            label={layout.comments?.directorPrompt || "Director of Studies' Remark"}
            value={directorComment}
          />
        )}
        {layout.comments?.principalPrompt !== undefined && (
          <RemarkBlock
            label={layout.comments?.principalPrompt || "Principal's Remark"}
            value={principalComment}
          />
        )}
      </section>

      {/* ─── Signatures + dates ─────────────────────────────────────── */}
      {layout.signatures && (
        <section className="rc-sign mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[10px]">
          {layout.signatures.showTeacherSignature && (
            <SignatureLine
              label="Teacher's Signature"
              subLabel={layout.signatures.teacherName || student.classTeacher}
            />
          )}
          {layout.signatures.showDirectorSignature && (
            <SignatureLine label="Director's Signature" />
          )}
          {layout.signatures.showPrincipalSignature && (
            <SignatureLine label="Principal's Signature" />
          )}
          {layout.signatures.showVacationDate && (
            <Field label="Vacation Date" value={vacationDate} />
          )}
          {layout.signatures.showResumptionDate && (
            <Field label="Resumption Date" value={resumptionDate} />
          )}
        </section>
      )}

      {layout.footerNote && (
        <footer className="mt-4 pt-2 border-t text-center text-[10px] italic text-gray-600">
          {layout.footerNote}
        </footer>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function Field({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="flex gap-1 min-w-0">
      <span className="font-semibold uppercase text-[9px] tracking-wide text-gray-700 whitespace-nowrap">
        {label}:
      </span>
      <span className="truncate border-b border-dotted border-gray-400 flex-1 min-w-[40px]">
        {value ?? ""}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="rc-section-title bg-primary text-primary-foreground px-2 py-1 text-[11px] font-bold uppercase tracking-wide mt-3 mb-1">
      {children}
    </div>
  );
}

function Cell({ v }: { v?: number | null }) {
  return (
    <td className="border border-gray-400 p-1 text-center">
      {v ?? ""}
    </td>
  );
}

function ItemRatingTable({
  title,
  items,
  ratingScale,
  getRating,
  dense = false,
}: {
  title: string;
  items: string[];
  ratingScale: { code: string; label: string }[];
  getRating: (index: number) => string;
  dense?: boolean;
}) {
  return (
    <div className="rc-area mb-2 avoid-break">
      <div className="bg-primary/10 border border-primary/40 px-2 py-0.5 text-[10px] font-bold uppercase">
        {title}
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 p-1 text-left">
              Assessment Item
            </th>
            {ratingScale.map((r) => (
              <th
                key={r.code}
                className={`border border-gray-400 p-1 text-center ${dense ? "w-6" : "w-8"}`}
              >
                {r.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td
                className="border border-gray-400 p-2 text-center text-gray-500"
                colSpan={ratingScale.length + 1}
              >
                No assessment items configured.
              </td>
            </tr>
          ) : items.map((it, i) => {
            const current = getRating(i);
            return (
              <tr key={i} className="odd:bg-gray-50">
                <td className="border border-gray-400 p-1">{it}</td>
                {ratingScale.map((r) => (
                  <td
                    key={r.code}
                    className="border border-gray-400 p-1 text-center"
                  >
                    {current === r.code ? "✓" : ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RemarkBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
        {label}
      </div>
      <div className="border border-gray-400 rounded-sm min-h-[42px] p-1 text-[10px] whitespace-pre-wrap">
        {value ?? ""}
      </div>
    </div>
  );
}

function SignatureLine({ label, subLabel }: { label: string; subLabel?: string }) {
  return (
    <div>
      <div className="border-b border-gray-500 h-8" />
      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-700">
        {label}
      </div>
      {subLabel && <div className="text-[10px]">{subLabel}</div>}
    </div>
  );
}
