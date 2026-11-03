# User Guide: Grading, Broadsheet Result Entry & Academic Reports

Welcome to the **Academic Grading, Broadsheet & Reporting System**. This guide provides step-by-step instructions for **Teachers**, **Exam Officers / Academic Directors**, **School Administrators**, and **Students / Parents** on how to enter marks, validate results, process term computations, generate class broadsheets, and print terminal report cards.

---

## 📑 Table of Contents
1. [Overview of Roles & Permissions](#1-overview-of-roles--permissions)
2. [Teacher Workflow: Entering Marks in the Broadsheet](#2-teacher-workflow-entering-marks-in-the-broadsheet)
   - [Numeric Entry Grid (Primary & Secondary)](#numeric-entry-grid-primary--secondary)
   - [Early Years / Nursery Competency Rubrics](#early-years--nursery-competency-rubrics)
   - [Validating Marks](#validating-marks)
3. [Exam Officer & Administrator Workflow](#3-exam-officer--administrator-workflow)
   - [Reviewing & Publishing Broadsheets](#reviewing--publishing-broadsheets)
   - [Reverting to Draft for Corrections](#reverting-to-draft-for-corrections)
   - [Running Batch Result Processing](#running-batch-result-processing)
4. [Reports & Exports](#4-reports--exports)
   - [Class Broadsheet Performance Report](#class-broadsheet-performance-report)
   - [Level-Specific Report Cards](#level-specific-report-cards)
5. [Student & Parent Portal](#5-student--parent-portal)
6. [Grading Rules & Calculation Logic](#6-grading-rules--calculation-logic)
7. [Troubleshooting & FAQs](#7-troubleshooting--faqs)

---

## 1. Overview of Roles & Permissions

| Role | Permitted Actions |
|---|---|
| **Subject Teacher** | View assigned classes, enter marks (CA1, CA2, CA3, Exam), save draft, validate broadsheet. |
| **Form / Class Teacher** | View whole-class marks, enter psychomotor traits, affective remarks, and attendance. |
| **Exam Officer / Academic Admin** | Approve & publish broadsheets, revert published broadsheets, run term result processing, generate master broadsheets and report cards. |
| **Student / Parent** | View published term results, breakdown charts, and download personal report cards. |

---

## 2. Teacher Workflow: Entering Marks in the Broadsheet

Navigate to **Academics** ➔ **Broadsheet Result Entry** (`/broadsheet`).

```
[ Session: 2026/2027 ]  ➔  [ Term: Term 1 ]  ➔  [ Class: Grade 5A ]
```

### Numeric Entry Grid (Primary & Secondary)
For standard academic subjects, the matrix displays each student alongside 6 synchronized columns:

| Column | Description | Input Rule |
|---|---|---|
| **CA1** | Continuous Assessment 1 | Score between `0` and component maximum (e.g. `15`). |
| **CA2** | Continuous Assessment 2 | Score between `0` and component maximum (e.g. `15`). |
| **CA3** | Continuous Assessment 3 *(if configured)* | Score between `0` and component maximum (e.g. `10`). |
| **∑CA** | Total Continuous Assessment | **Auto-calculated** real-time sum of CA marks. Read-only. |
| **Exam** | End of Term Examination | Score between `0` and component maximum (e.g. `70`). |
| **Total** | Grand Subject Total | **Auto-calculated** weighted total (out of `100`). Read-only. |

#### Input Tips:
- **Zero vs Absent**:
  - If a student took the test and scored zero, enter `0` (this grades as Fail/`F`).
  - If a student was absent or exempted, leave the box blank (displays as `—` and does not penalize class averages).
- **Auto-Save & Real-Time Calculation**:
  - Scores update totals immediately upon keystroke or leaving the cell.
  - Exceeding the maximum allowed score (e.g. entering `85` when exam max is `70`) flags an instant red boundary warning.

### Early Years / Nursery Competency Rubrics
For Kindergarten and Nursery levels, numeric percentages are replaced with developmental skill ratings:
1. Select an Early Years class (e.g., *Reception*, *Nursery 1*).
2. The grid automatically renders competency chips (Rating `1` to `5`):
   - `1`: Emerging / Needs Support
   - `2`: Developing
   - `3`: Satisfactory
   - `4`: Proficient
   - `5`: Mastered / Advanced
3. Simply tap or click the rating badge to assign the student's mastery level for each skill domain.

### Validating Marks
Once all scores are entered:
1. Click the green **Validate Broadsheet** button in the header.
2. The system checks:
   - Are there any scores exceeding component maximums?
   - Is the sheet completely empty? (Empty sheets cannot be validated).
3. Once validated, the broadsheet status changes from `Draft` ➔ `Validated`.
4. Inputs are locked to prevent accidental modification while awaiting administrative approval.

---

## 3. Exam Officer & Administrator Workflow

### Reviewing & Publishing Broadsheets
1. Navigate to **Academics** ➔ **Broadsheet Result Entry**.
2. Filter for broadsheets with status `Validated`.
3. Review marks, component totals, and class distribution.
4. Click **Publish to Master Record**:
   - The status updates to `Published`.
   - **Automatic Database Synchronization**: The system immediately writes raw marks and true component maximums to the continuous assessments master record.

### Reverting to Draft for Corrections
If a teacher needs to correct a score after validation or publishing:
1. Click **Revert to Draft**.
2. A confirmation prompt explains that published marks will be temporarily un-synced from master records to prevent inconsistency.
3. The teacher can now edit the marks.
4. Re-validate and re-publish once corrected.

### Running Batch Result Processing
Before generating report cards and final class positions, run the result processor:
1. Navigate to **Academics** ➔ **Process Results** (`/results`).
2. Select the **Session**, **Term**, **Class**, and **Exam Type** (e.g. *Term 1 Final*).
3. Choose the Calculation Mode:
   - **Dynamic Structure** *(Recommended)*: Uses custom level weights (e.g. 15/15/70 or custom components).
   - **School Settings**: Uses school-wide default weights.
4. Click **Process Results**:
   - Computes weighted totals for all enrolled students.
   - Calculates **Subject Position** and **Class Position** using standard competition ranking (`1, 2, 2, 4`).
   - Identifies highest and lowest scores per subject.
   - Automatically writes records to `processed_results` and `result_component_scores`.

---

## 4. Reports & Exports

### Class Broadsheet Performance Report
Navigate to **Reports** ➔ **Class Broadsheet** (`/reports/class-broadsheet`).

- **Matrix View**: Displays the entire class in a single spread: Student Name, Admission Number, every Subject's breakdown (CA, Exam, Total, Grade), Student Total Marks, Class Average, and Class Position.
- **Search & Filter**: Search student names or admission numbers in real time without losing column alignment.
- **Exports**:
  - **Export Excel (`.xlsx`)**: Full high-resolution spreadsheet formatted for board meetings and ministry submissions.
  - **Export PDF (`.pdf`)**: Landscape printable document with repeated headers across multi-page classes.

### Level-Specific Report Cards
Navigate to **Reports** ➔ **Level Report Cards** (`/reports/level-report-cards`).

Select the educational template matched to the student's level:

1. **Early Years / Kindergarten Template**:
   - Focuses on developmental milestones, literacy, numeracy, and fine motor skills.
   - Renders 1–5 competency rating charts and narrative teacher observations.
2. **Primary School Template**:
   - Subject breakdown table (`CA1`, `CA2`, `Exam`, `Total`, `Grade`, `Subject Position`).
   - Term attendance, overall class position, and Headmaster signature block.
3. **Junior Secondary (JSS) Template**:
   - BECE 6-point grading scale (`A` to `F`).
   - Affective & Psychomotor evaluation grids (Punctuality, Honesty, Leadership, Sportsmanship).
4. **Senior Secondary (SSS) Template**:
   - WAEC / NECO 9-point grading scale (`A1`, `B2`, `B3`, `C4`, `C5`, `C6`, `D7`, `E8`, `F9`).
   - Cumulative 3-term average tracking and Academic Director remarks.

#### Printing Instructions:
- Click the **Print Report Card** or **Batch Print Class** button.
- The system automatically triggers the clean print stylesheet—hiding sidebar menus, action buttons, and pagination controls.
- Automatic page-break rules guarantee that each student's card prints on its own clean page.

---

## 5. Student & Parent Portal

Students and parents can log into the portal at `/student`:
- **Current Term Performance**: Real-time access to published subjects, grades, and teacher remarks.
- **Component Breakdown**: View raw marks alongside component maximums (e.g. `12 / 15` in CA1, `58 / 70` in Exam).
- **Cumulative Progress**: Graph displaying academic progression across Term 1, Term 2, and Term 3.
- **Downloadable PDF**: Parents can download official digital report cards directly from their phone or computer.

---

## 6. Grading Rules & Calculation Logic

### Scoring Schemes
1. **Weighted CA + Exam** (Default):
   $$\text{Total} = \frac{(\text{CA}_1 \times w_1) + (\text{CA}_2 \times w_2) + (\text{CA}_3 \times w_3) + (\text{Exam} \times w_e)}{100}$$
   *(Where $w_1 + w_2 + w_3 + w_e = 100$)*
2. **Running Average**:
   $$\text{Total} = \frac{\sum \text{Assessment Scores}}{\text{Count of Taken Assessments}}$$
3. **Display Only**:
   Displays raw component marks as entered (e.g. `14 / 15 / E:62`) without combining into an artificial percentage.

### Cumulative Method
- **Average of Terms**: Averages the student's totals across all completed terms in the session.
- **Sum of Terms**: Adds term totals together (commonly used for 300-point session summaries).

### Competition Tie Ranking
When two students have identical averages, they share the higher position, and subsequent positions skip accordingly:
- Student 1: Average 88.5% ➔ **Position 1**
- Student 2: Average 84.0% ➔ **Position 2**
- Student 3: Average 84.0% ➔ **Position 2**
- Student 4: Average 81.2% ➔ **Position 4** *(Position 3 is skipped)*

---

## 7. Troubleshooting & FAQs

### Q1: Why are inputs disabled/greyed out in the broadsheet?
**Answer**: The broadsheet has been marked as **Validated** or **Published**. Only sheets in **Draft** state can be edited. Contact an Academic Director or Exam Officer to revert the sheet to Draft if changes are required.

### Q2: Why are exam scores missing from the report cards?
**Answer**: Two potential causes:
1. The subject broadsheet has not been **Published**.
2. **Process Results** has not yet been executed for the class and term. Run the result processor in the Process Results panel.

### Q3: An exam score was entered out of 70, but it shows a strange mark on the report card.
**Answer**: The system records raw marks with their true component maximums (e.g. 56 out of 70). Ensure that the class is configured with the correct assessment structure so the max score matches 70 instead of defaulting to 100.

### Q4: How do I handle a student who was absent for an exam?
**Answer**: Leave the Exam box **blank** (empty). Do not enter `0`. Leaving it blank records the assessment as missing/absent (`—`), while entering `0` counts as an examined mark of zero percent.

---

*For technical assistance or system configuration requests, contact your school's IT Administrator.*
