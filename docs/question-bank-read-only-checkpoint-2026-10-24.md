# Question Bank — read-only checkpoint

## Database checkpoint outcome

No migration is required for the read-only page. Reuse the existing question bank, columns, indexes and access rules. Use permission-protected count queries rather than adding a database function. No rows, policies, roles or storage settings will change.

## Next checkpoint: read-only page

- Add a standalone **Question Bank** page with the school's existing green styling.
- Add a navigation link beside Exams / CBT, retaining the existing Question Bank access permissions; do not give students or parents access to answer keys.
- Show the accessible question count and **By class / List** views.
- Group class accordions by subject; load question lists on demand. Paginate the list at 50 questions per page.
- Add search, class, subject, difficulty and status filters, with **Apply filters** and **Reset**. Apply filters and calculate counts in the database, not against a capped browser list.
- Render existing rich text, equations and media through the project's current renderers.
- Show loading, empty and visible error states, with retry where appropriate.
- Leave create/edit/delete, bulk actions, Excel export, imports, publishing flags, stimuli and uploads for their separately approved checkpoints. No nonfunctional action placeholders are needed.

## Protected existing behavior

Do not extract or change the Exams bank tab at this checkpoint. Leave Save to Bank, exam creation, CBT, grading, results, reports and school-wide export unchanged. No historical answer or score corrections are authorized by this approval.

## Technical scope

New files: authenticated `/question-bank` route, focused view/filter components, query utilities and their behavioral tests.

Existing-file edits: minimal navigation metadata in `modules.ts` and, only as necessary, a sidebar/read-guard mapping in `AppShell.tsx` to reuse `exams/question-bank` permissions rather than introduce independent grants. Record the approved boundary in `AGENTS.md` and progress in `roadmap.md`.

Use existing authenticated database access under RLS. Explicitly exclude soft-deleted records, use stable ordering and range pagination, and avoid privileged clients. Reuse the existing indexes and exact counts; class/subject summary queries may require more round trips but do not require schema changes. Add unique De-Bright page metadata. Do not manually edit generated clients, types or route-tree files.

## Verification and stop

- Test filter/pagination and access decisions against concrete cases.
- Check the managed compilation results and run applicable tests and lint checks without manually invoking managed builds or type-checks.
- Exercise the new page with actual accessible data; verify the original Exams bank tab, existing question rendering and an existing CBT opening where sessions and permissions allow.
- Identify any role or flow that cannot be tested rather than claiming verification.

Stop after delivering the read-only checkpoint for review. No write actions or later migrations will begin without another approval.