# Architecture rules

- Anonymous-grant repairs keep a narrowly scoped SQL boundary, an exact pre-change rollback and regression tests; existing RLS and signed-in grants remain independent of anonymous access.

- Student imports use a dedicated dialog and shared pure batch validation before any writes; preflight reads include recycled admission numbers, and every result retains its source row for review.

- Recycle Bin functions discover original primary keys through PostgreSQL catalogs, preserve UUID action compatibility, and store named keys in audit snapshots; composite and non-id keys must work without changing source schemas.

- The combined school Excel export uses browser-side SheetJS with explicit field allowlists and uncapped, stable-order paginated reads through the existing authenticated client; this preserves access rules and prevents secret fields from entering workbooks.
- User-role imports use a dedicated authenticated server function with server-side administrator checks, validated role allowlists, additive role assignment, and actual invitations; existing profiles and credentials are never overwritten and privileged clients are loaded only after authorization.
- Administration role listings use stable-order paginated reads, so accounts beyond the Data API page limit never appear falsely unassigned.
- Exam scoring is authoritative in database routines, resolves MCQ options to original keys, and preserves teacher scores; shuffled clients transport selected option text, while historical maintenance defaults to an admin-only audited dry run to avoid guessing lost option order.
- The standalone Question Bank uses isolated queries and authenticated mutations under existing RLS and an exams/question-bank navigation alias; its separate editor records pre-edit revisions, resets edited/copied content to draft, checks optimistic timestamps, and preserves unedited fields to protect existing Exams workflows without new grants. Build class/subject counts from stable-order paginated grouping-key reads, not per-combination queries, so applying filters remains fast as the catalog grows.
- Question Bank shared passages are immutable, class/subject-scoped resources linked by optional stimulus_id; bank-only adapters preserve legacy media and durable private storage paths. Never delete previously saved attachments or uncertain-write uploads, because other questions and revisions may reference them; student/exam delivery stays separately gated.