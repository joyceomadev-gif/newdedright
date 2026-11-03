# Exam grading repair — De-Bright Group of Schools

## Root cause

The pictured `C. 8` dropdown label is not the saved value. Inspection found `questions.correct_answer = "8"` and builder `content_json.question.correctAnswer = "8"`. The student view saves `"C"`. The old `submit_exam_attempt` compared the letter directly with the option text, so even correct choices failed. All 10 existing questions and 10 question-bank records used text keys. There are 3 submitted attempts, all scored zero.

There was a second issue: legacy questions shuffle displayed options, but the server did not receive the displayed-to-original mapping. Builder questions use their own unshuffled option list. New submissions now send the chosen option text and the database resolves it to the original key. Grading never trusts client `is_correct`, marks or answer keys.

## Changes and exact file inventory

- `src/lib/exam-answer.ts` — canonical option matching, legacy prefixes, case/whitespace and numeric equivalence; blank options retain identity until compaction.
- `src/lib/exam-answer.test.ts` — 9 pure matching regression tests.
- `src/test/exam-grading.test.ts` — 15 database regression tests, including manual marks, groups, other types, permissions, dry run, audited apply and rerun safety.
- `src/components/question-builder/QuestionBuilder.tsx` — standalone and group dropdown values are keys; labels still show `C. 8`.
- `src/components/question-builder/QuestionBuilderDialog.tsx` — canonical row and nested builder payloads; correct reopening of a stored builder item.
- `src/components/question-builder/StudentQuestionView.tsx` — legacy-compatible key resolution.
- `src/components/exams/useCBTRunner.ts` — transport selected option text for reliable server scoring; respect exam shuffle settings.
- `src/components/exams/ExamReviewDialog.tsx` — recognize canonical keys when highlighting the correct option.
- `src/routes/_authenticated/exams.tsx` — exam and question-bank editors/imports save keys, previews recognize keys, manual-grading denominator no longer adds manual marks twice, examination metadata.
- `src/lib/ai-questions.functions.ts` — generated MCQ keys normalized at output.
- `drizzle/migrations/0003_repair_exam_answer_identity_and_safe_regrading.sql` — installed scoring helpers, authoring triggers and guarded historical maintenance. **No historical data update runs during migration installation.**
- `drizzle/migrations/0004_resolve_grading_maintenance_record_alias.sql` — resolves a record/table alias collision found by tests and the first dry run.
- `drizzle/migrations/0005_preserve_offline_submission_eligibility.sql` — eligibility verifies ownership and class without rejecting a valid queued submission merely because the exam closed before reconnection.
- Generated migration journal/snapshots and `src/integrations/supabase/types.ts` — tool-managed updates.
- `scripts/exam-grading/grading-functions.sql` — readable source of the schema routines; the three applied migration files are the authoritative installed version.
- `scripts/exam-grading/regrade.mjs` — dry-run-first wrapper; applying requires explicit backup confirmation.
- `docs/EXAM_GRADING_REPAIR.md`, `AGENTS.md`, `roadmap.md` — documentation and tracking.

## Tables affected when the historical correction is applied

| Table | Change |
| --- | --- |
| `questions` | Equivalent MCQ keys in `correct_answer` and nested `content_json`; options and wording unchanged. |
| `question_bank` | Equivalent MCQ keys in `correct_answer`. |
| `exam_attempts` | Per-unit correctness and awarded marks, raw score, total marks, percentage; original answer content retained or represented by its original option key. Teacher scores retained. |
| `results` | Scaled exam score, grade, regrading remark. |
| `continuous_assessments` | Only matching existing automatically generated CA score rows; no new CA rows or teacher entries. No CA attempts exist in the inspected data. |
| `exam_audit_log` | Before/after snapshots for each changed attempt. |

No users, roles, students, exam content, report publications or manually recorded marks are deleted. Existing processed reports are not silently republished: regenerate them after reviewing repaired examination results.

## Backup before applying

Use **More → Database → Manage → Settings → Export data → Database → Export → Start export**. Download the emailed export before confirming the apply. The export covers database structure, data and user accounts; it does not include storage files. Download those separately from **More → Storage** if required.

Historical keys and scores have **not** been changed. Schema fixes and future authoring/scoring are installed. The correction is waiting for export confirmation.

## Real dry-run result

Authenticated administrator dry run completed on 23 October 2026:

| Student | Before | After | Percentage | Grade | Correctness changes |
| --- | ---: | ---: | ---: | --- | ---: |
| Demo Student 1 | 0/20 | 20/20 | 100% | A | 10 |
| Demo Student 2 | 0/20 | 8/20 | 40% | E | 4 |
| Demo Student 3 | 0/20 | 6/20 | 30% | F | 3 |

20 stored question keys would normalize (10 exam + 10 bank), 17 response correctness values would change, 3 attempts would be updated, 0 blocked attempts. `pass_mark` is unset for this exam, so pass/fail is not invented. Grades retain the existing server thresholds A≥70, B≥60, C≥50, D≥45, E≥40, else F.

The three current papers use builder content, whose answer choices were not shuffled in the student view; those letters can be recovered from the builder's original option order. Historical legacy shuffled letters without retained order are deliberately blocked instead of guessed. Do not override that safeguard: recover the original order from retained offline attempt records first, if available.

## Running the correction

Use the existing signed-in administrator browser client (never place privileged keys in this script):

```js
import { regradeExams } from './scripts/exam-grading/regrade.mjs';
await regradeExams(supabase); // default: preview only
// Only after downloading the database export and reviewing the preview:
await regradeExams(supabase, { dryRun: false, backupConfirmed: true });
```

The database entry points are `exam_grading_maintenance(true)` for preview and `exam_grading_maintenance(false)` for apply. Only an authenticated administrator may call either. Applying happens in one transaction; failures roll back that call. After applying, repeat the preview: unchanged attempts should report zero further updates.

## Selected diffs

```diff
- <SelectItem value={o}>C. 8</SelectItem>
+ <SelectItem value={key}>C. 8</SelectItem>

- correctVal = correct.trim(); // option text
+ correctVal = compactMcq(opts, correct).correct; // original key

- lower(btrim(student_answer)) = lower(btrim(correct_answer))
+ exam_mcq_key(student_answer, authoritative_options)
+   = exam_mcq_key(correct_answer, authoritative_options)

- student_answer: displayedLetter
+ student_answer: selectedOptionText // server resolves original identity

- totalMarks = attempt.total_marks + manualMarks
+ totalMarks = attempt.total_marks // already includes all units
```

## Verification with real submissions

1. Download the database export and confirm it is available.
2. In **Examinations**, open **Basic Science 101** and its saved attempt review. Record each current score.
3. Review the dry-run summary above, especially Demo Student 1's 10 correct answers.
4. Apply the correction only after backup confirmation. Refresh the attempt review: expect 20/20, 8/20 and 6/20 with matching per-question awards.
5. Check the planet question: original options A=5, B=9, C=8, D=11; an answer of C must earn 2 marks.
6. Check a wrong answer and an unanswered answer: each earns zero.
7. Re-run preview; expect zero further attempt changes.
8. On a new draft paper, save the correct option using the dropdown and reopen it; the selected label should remain `C. 8`. Test a new submission with option randomization enabled and disabled.
9. For papers with theory, verify the teacher's existing partial scores remain unchanged and total possible marks are counted once.
10. Regenerate downstream processed reports only after checking repaired scores; publication is a separate deliberate action.

## Verified and unverified

- All 24 focused unit/database tests pass; local apply tests verify results, audit snapshots and idempotency without writing to the school database.
- Authenticated administrator maintenance preview was exercised against all three actual submissions.
- Preview build diagnostics report `build OK`.
- The signed-in examination list rendered successfully; offline submission was tested with isolated database fixtures.
- A new live student submission and historical apply are not performed, to avoid writing school data before export confirmation.