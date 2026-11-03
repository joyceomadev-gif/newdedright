# Shared passages and images — Question Bank

## What you will get
- Create a titled reading passage with rich text, equations and labelled images, then reuse it on questions in the same class and subject.
- Choose or unlink a passage in the standalone question editor; see it above the question in both Question Bank views.
- Upload or paste multiple question images, add labels/captions, preview them and remove attachments before saving.
- Keep the current question types, correct-answer handling, revision history and draft-only saves unchanged.

## Protection boundaries
- No changes to existing Exams, student CBT, grading, results, imports, school-wide exports, authentication or existing access/storage policies.
- No old questions rewritten or automatically linked to passages.
- Shared passages are immutable in this checkpoint: changing one creates a new passage that must be explicitly selected on each question. This prevents changing other linked questions or their approval state silently.
- Removing an image attachment does not delete its stored file; other questions and revision history may still reference it. Failed new uploads are cleaned up only when their files are known to be newly created and unreferenced.
- Passage reuse is restricted to the question's class and subject. Database access remains administrator or creator-with-teaching-assignment access.
- Student delivery of shared passages and private images is a separate checkpoint. Existing exam-copying tools are unchanged and do not automatically carry these new passage links.
- Grouped subquestions, new question types, imports and passive missing-answer/image flags are not part of this task.

## Technical details: exact additive database proposal
The existing `question_bank.media` field and private `question-media` bucket already support image storage. Reusable passages require one new table and one optional link on Question Bank questions. No new structured-question column is needed for this narrowly scoped checkpoint.

The following SQL will be applied only after this plan is approved:

```sql
CREATE TABLE public.question_stimuli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id),
  subject_id uuid NOT NULL REFERENCES public.subjects(id),
  content_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);
GRANT SELECT, INSERT ON public.question_stimuli TO authenticated;
GRANT ALL ON public.question_stimuli TO service_role;
ALTER TABLE public.question_stimuli ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read accessible active stimuli"
ON public.question_stimuli FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.is_admin(auth.uid())
    OR (created_by = auth.uid()
        AND public.teaches_class_subject(auth.uid(), class_id, subject_id))
  )
);
CREATE POLICY "Create own accessible stimuli"
ON public.question_stimuli FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND deleted_at IS NULL
  AND deleted_by IS NULL
  AND delete_reason IS NULL
  AND (
    public.is_admin(auth.uid())
    OR public.teaches_class_subject(auth.uid(), class_id, subject_id)
  )
);
ALTER TABLE public.question_bank
  ADD COLUMN stimulus_id uuid
  REFERENCES public.question_stimuli(id) ON DELETE SET NULL;
CREATE INDEX question_stimuli_class_subject_idx
  ON public.question_stimuli(class_id, subject_id, id)
  WHERE deleted_at IS NULL;
CREATE INDEX question_bank_stimulus_idx
  ON public.question_bank(stimulus_id)
  WHERE stimulus_id IS NOT NULL;
```

- `content_json` holds existing builder-compatible shared-resource entries (`id`, `kind`, `html`, optional `caption`), not answer keys or new question structures.
- Media additions use durable `{bucket, path, label, caption}` references and retain legacy/unknown media entries on edits and copies. Signed image addresses are display-only.
- New bank-only modules handle passage reads/creation, pure validation and upload lifecycle. Existing shared rich editors and storage utilities remain unchanged.
- Question saves verify passage visibility and matching class/subject before any revision/write; duplicates retain the selected passage and attachments. Changing class/subject clears the passage selection.
- Uploads use unique paths and the current signed-in storage access rules, not privileged clients; image formats and file sizes are validated against existing bucket limits.
- Existing Question Bank files change only to expose the new editor controls, save optional links/media and render accessible passages. The route's existing De-Bright metadata remains unchanged.

## Verification
- Add tests for class/subject matching, preserving legacy attachments, passage links during copy/edit, immutable reuse, and upload validation.
- Confirm database additions, grants and access restrictions without altering existing policies.
- Run the Question Bank, answer-key and permission regression tests.
- As a signed-in administrator, create a disposable passage and image, link two test questions, reopen and duplicate a question, then confirm unlinking one does not alter the other. Clean up only disposable test records/files.
- Check both Question Bank views and the unchanged Exams bank tab; disclose teacher/student checks if suitable sessions are unavailable.

## Approval checkpoint
Approval authorizes the exact additive database changes above and the standalone Question Bank passage/image controls. No database changes have been applied yet.