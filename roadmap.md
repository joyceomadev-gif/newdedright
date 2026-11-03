# Recycle Bin repair and faulty student import cleanup

# Authorized anonymous-access repair

- [x] Read-only anonymous-key tests: eight tables each returned HTTP 200 with zero visible rows; all carry full anon grants and restrictive hide_soft_deleted policies.
- [x] Applied one migration revoking all anon privileges only on the eight tables; exact rollback saved. Verified zero anon ACL entries and unchanged policy/signed-in-grant hashes. Four boundary tests passed; managed build OK.
- [x] After: all eight public-key reads fail HTTP 401 / PostgreSQL 42501. Real super-admin and designated teacher reads/pages work; login, signup, forgot-password, reset-password and home redirect verified without errors. Reported all 87 other public-table anon grants and 47 restrictive policies unchanged.
- [ ] Owner-level public table defaults remain: Cloud refused ALTER DEFAULT PRIVILEGES (first migration fully rolled back). Defaults do not re-grant existing tables, but can grant anon on future/recreated tables. Requires owner-level Cloud capability.
- [ ] Ordinary-admin and student session checks blocked: user skipped account-selection question; no account selected arbitrarily. Parent check blocked: zero parent-role accounts; no account created.

# Standalone Question Bank — approved discovery

- [x] Complete discovery without application or database changes; user approved findings.
- [x] Database checkpoint: no migration needed for read-only views; use existing RLS-protected count queries and indexes.
- [x] Reviewed newly attached reference source files without copying their code or widening this checkpoint; reference-only publishing/types/imports remain deferred.
- [x] Built read-only page, permission-alias navigation, database filters/counts, class/subject expansion and 50-row paginated lists. Managed build OK; 25 tests passed; new files lint clean. Signed-in admin preview verified class/list/filter/reset and original Exams bank tab; existing CBT editor opened without writes. Other-role sessions and full student CBT taking unverified. Existing shared mobile header overflows; untouched because outside this checkpoint. Existing shared files retain pre-existing formatting lint failures.
- [x] Compared reference and implemented standalone create/edit/duplicate/soft-delete with metadata, canonical MCQ keys, pre-edit revisions and draft-only saves; no migrations, policy changes or Exams route edits. 26 regression tests passed; changed files lint clean; managed build OK. Signed-in admin created, edited, read revision, duplicated and recycled disposable questions; database confirmed C keys and draft copies; test questions then permanently cleaned up. Original Exams bank tab opened unchanged. Teacher/student sessions and full CBT-taking remain unverified. Bulk/export and stimuli stay separately gated.
- [x] Bulk delete and filtered Excel export checkpoint implemented; broader approval/archive/duplicate bulk workflows remain outside this checkpoint.
- [x] Shared stimuli and image checkpoint: approved exact additive migration applied and confirmed; immutable class/subject-scoped passages and labelled private media added only to standalone Question Bank. Signed-in creation/readback, reuse across two questions, duplicate, unlink without affecting others, upload/paste and both views verified; original Exams bank opened unchanged. All disposable records removed; original 11 questions preserved. 42 relevant tests passed across final runs; managed build OK. Teacher/student sessions and student media delivery remain unverified/outside scope.

# Exam grading repair

- [x] Trace saved answer identifiers, all question types, option shuffling and historical submissions: actual stored correct answers are option text, not prefixed labels.
- [x] Fix authoring and server scoring; 24 regression tests pass, including authoritative marks, manual scores, groups, other types, dry run, atomic apply, access rejection and rerun safety.
- [x] Run authenticated read-only preview: 20 keys and 17 answers across 3 attempts would change; projected scores 8/20, 6/20 and 20/20. No historical data changed. Provide correction package and verification instructions.
- [ ] Normalize historical keys and apply regrade only after database export is confirmed.

# Source-of-truth user correction

- [x] Confirm 1,367 rows with email, full_name, phone, roles; no duplicate or invalid emails; reject 40 No role and 13 multiple-role rows.
- [x] Corrected 1,270 matching accounts and invited 44 missing accounts; restored one missing administrator profile. All 53 skipped and 82 unlisted accounts unchanged; no passwords changed or accounts deleted.
- [x] Verified all 1,314 auth/profile names, phone values, and sole requested roles; rerun preflight needs zero new accounts. Final role memberships: super_admin 1, admin 6, teacher 53, student 1,359, other roles 0; one unchanged account unassigned.
- [x] Fixed Administration's capped role read and verified visible roles; 13 tests pass and build OK. Database access helpers verified; student/teacher sessions and invitation delivery not independently tested. Only 3 student accounts and zero teacher accounts have linked active school records; links left unchanged. Full Excel report prepared.

# Corrected student reimport

- [x] Implemented corrected student-only import with ten rule tests passing.
- [x] User chose rejection of recycled admission numbers; processed uploaded workbook in signed-in UI: 0 imported, all 1,235 skipped because numbers already exist in Recycle Bin. No records restored or changed.
- [x] Verified zero active / 1,235 recycled students and downloaded all row results; report includes 57 duplicate-name/DOB rows, 22 demo/test rows, 193 unmatched JSS THREE rows, 12 blank genders, 57 blank DOBs, 5 blank classes and one invalid DOB. File gender: 585 male, 638 female, 12 empty; imported gender all zero.

- [x] Fixed hard-coded id assumptions in class_teachers and subject_teachers, completed missing deletion metadata, and removed the 1,000-row listing cap.
- [x] Verified full CSV backup: 1,235 rows and 43 columns, including gender; explained and preserved 1,230 enrollment links.
- [x] Zero active students; all 1,235 retained for restoration. Signed-in Restore succeeded; permanent deletion verified on a disposable student only; actions audit-logged. Five regression tests pass.

# Excel export

- [x] Add an Administration export button and five-sheet browser workbook with friendly headers and no passwords or tokens.
- [x] Verify pagination and secret exclusions with tests, plus the authenticated download (all five live lists are currently empty; populated live export remains unverified).

# Imported student cleanup

- [x] User broadened the scope to all 297 students.
- [x] Check linked records and explain impact: 297 enrollment links and class assignments; no other linked activity found. Permanent deletion cascades enrollment links, so preserve them using Recycle Bin removal.
- [x] Moved all 297 students to Recycle Bin; verified zero active students and unchanged teachers, admin roles, settings, parents, classes, and enrollment links.

# User and role import

- [x] Add Administration import with Excel/CSV template, validated roles, invitation delivery, and row-by-row error results.
- [x] Passed 15 validation/server/export tests; verified signed-in template download, invalid-row reporting, and server rejection of a protected account without changing data. New-account creation and invitation delivery tested with mocks only; no live test account was created.
# Question Bank bulk tools

- [x] Excel export of the filtered questions (allowlisted columns, no row cap) and multi-select delete to Recycle Bin; 2 export tests pass.
- [x] Reduced filter refresh requests to paginated grouping-key reads; signed-in search applied in 0.96 seconds, status filtering worked, and Reset restored all 11 questions and cleared controls. 17 Question Bank tests passed; managed build OK; no browser errors.
- [x] Shared passages and images complete; old Exams/CBT delivery deliberately unchanged. Fixed empty dropdown refresh events clearing newly selected passages; added regression coverage.

# Post-backup sequence (user confirmed backup 2026-10-24)
- [x] 1. Applied historical grading correction: 20 keys, 3 attempts (20/20, 8/20, 6/20); re-preview shows 0 further changes
- [x] 2. Student verified (Question Bank denied; 0 bank questions, passages, images readable; portal loads). Teacher Fidelis (zgilsolutions1@gmail.com, teacher role, confirmed) verified in a real session: Question Bank opens with correct RLS view (0 rows — he owns no questions and teaches no class), filters/Reset work, Exams/CBT opens, no page errors. The New-question editor shows an empty class dropdown because class reads are scoped to assigned classes; teachers can only author questions for classes they teach. No data changed.
- Deferred by user: 3. Bulk approval/archive/duplicate in Question Bank; do not execute.
- Deferred by user: publishing controls; Stage 3 import discovery does not authorize them.

# Database Backup & Restore (super admin + DBA)

- [x] Step 0 discovery (no code): verified Settings Backup tab limits (11 tables, 1,000-row cap already truncating 1,166-row students, client-side-only admin check, preview-only restore), 99 public tables (~7,100 rows), composite/non-id PKs, auth.users FK insert risk, restore-dangerous triggers (notify/auto-grade/enrollment/session-stampers), 5 private buckets, service-role pattern. Delivered database-backup-restore-discovery.md. No app/database/RLS changes.
- User decisions received (2026-10-24): Option A permission `database.backup_restore` via user_permission_overrides with audited grant/revoke; exclusion list confirmed + server-enforced privilege-diff confirmation token; messages/health flagged sensitive in manifest; AES-GCM + PBKDF2 600k SHA-256 encryption offered with lost-passphrase warning; trigger suppression design deferred to checkpoint (d) with no schema changes before written approval.
- Approved for planning: immediate fix 1 (snapshot keyset paging, PK from catalog, 500/page, loud count-mismatch failure, >1,000-row vitest) and immediate fix 2 (snapshot reads into createServerFn with requireSupabaseAuth + server is_admin/is_super_admin, supabaseAdmin in-handler, 403 test for student/parent/teacher). RLS audit of the 11 exported tables delivered; no RLS/DB changes without approval.
- Awaiting separate approval: (a) access + append-only backup_audit_log; (b) backup page with paged reads, ZIP+manifest+checksums, optional encryption, storage manifest; (c) zero-write validation dry run; (d) restore — DISABLED until design approved in writing; (e) history + optional private retention bucket.

# Stage 3 — AI & Word import

- [x] Step 0: reviewed the brief, four real DOCX structures and selected rendered pages, existing Word/AI building blocks, and live storage/access constraints; delivered stage-3-ai-word-import-discovery.md. 33 existing targeted tests passed; managed build OK. No application/database/RLS changes, imports or AI calls; fresh Exams/CBT browser checks unperformed. Stopped for checkpoint (a) approval.
- Awaiting separate approval: (a) two-tab dialog; (b) reviewed Word-to-bank import; (c) reviewed AI drafts (maximum 15); (d) optional teacher-confirmed answer suggestions.
- No application, database, existing RLS, Exams or CBT changes during discovery; show all required additive SQL before applying any migration.
