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