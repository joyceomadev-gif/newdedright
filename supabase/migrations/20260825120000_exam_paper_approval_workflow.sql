-- Migration: Teacher Exam Paper Submission & Academic Admin Approval Workflow (Enhancements 3.1 & 3.2)
-- Description: Extends exams table with review tracking, creates exam_review_history table, and adds secure RPC functions.

-- 1. Extend exams table with workflow columns
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_feedback text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Indexes for status & review lookups
CREATE INDEX IF NOT EXISTS idx_exams_status ON public.exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_submitted_by ON public.exams(submitted_by);
CREATE INDEX IF NOT EXISTS idx_exams_reviewed_by ON public.exams(reviewed_by);

-- 2. Audit Trail Table: exam_review_history
CREATE TABLE IF NOT EXISTS public.exam_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, -- 'submitted', 'approved_published', 'sent_back'
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_review_history_exam ON public.exam_review_history(exam_id);

-- Enable RLS & Grants on history
ALTER TABLE public.exam_review_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.exam_review_history TO authenticated;
GRANT ALL ON public.exam_review_history TO service_role;

DROP POLICY IF EXISTS "Staff view exam review history" ON public.exam_review_history;
CREATE POLICY "Staff view exam review history" ON public.exam_review_history
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) OR
    has_role(auth.uid(), 'head_of_section'::app_role) OR
    EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR e.submitted_by = auth.uid()))
  );

-- 3. Security Definer RPC: submit_exam_for_review
CREATE OR REPLACE FUNCTION public.submit_exam_for_review(_exam_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
  q_count integer := 0;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam paper not found.';
  END IF;

  -- Verify user permissions: must be creator or assigned teacher/admin
  IF NOT (is_admin(auth.uid()) OR e.created_by = auth.uid() OR is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to submit this exam paper.';
  END IF;

  IF e.status = 'published' THEN
    RAISE EXCEPTION 'Published exams cannot be resubmitted.';
  END IF;

  -- Verify question count (attached or in bank)
  SELECT (
    (SELECT COUNT(*)::int FROM public.questions WHERE exam_id = _exam_id) +
    (SELECT COUNT(*)::int FROM public.question_bank WHERE class_id = e.class_id AND subject_id = e.subject_id AND purpose = COALESCE(e.purpose, 'exam'))
  ) INTO q_count;

  IF q_count = 0 THEN
    RAISE EXCEPTION 'Cannot submit an empty exam paper. Please add questions before submitting.';
  END IF;

  -- Update exam status
  UPDATE public.exams
  SET
    status = 'pending_review',
    submitted_by = auth.uid(),
    submitted_at = now(),
    updated_at = now()
  WHERE id = _exam_id;

  -- Insert Audit Log
  INSERT INTO public.exam_review_history (exam_id, actor_id, action)
  VALUES (_exam_id, auth.uid(), 'submitted');

  RETURN true;
END;
$$;

-- 4. Security Definer RPC: send_exam_back
CREATE OR REPLACE FUNCTION public.send_exam_back(_exam_id uuid, _feedback text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam paper not found.';
  END IF;

  -- Admin/HOS Check
  IF NOT (is_admin(auth.uid()) OR has_role(auth.uid(), 'head_of_section'::app_role)) THEN
    RAISE EXCEPTION 'Only Academic Admins and Heads of Section can return exams for revision.';
  END IF;

  IF _feedback IS NULL OR trim(_feedback) = '' THEN
    RAISE EXCEPTION 'Please provide a feedback reason explaining what the teacher needs to correct.';
  END IF;

  -- Update exam status to draft
  UPDATE public.exams
  SET
    status = 'draft',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_feedback = trim(_feedback),
    updated_at = now()
  WHERE id = _exam_id;

  -- Insert Audit Log
  INSERT INTO public.exam_review_history (exam_id, actor_id, action, feedback)
  VALUES (_exam_id, auth.uid(), 'sent_back', trim(_feedback));

  RETURN true;
END;
$$;

-- 5. Security Definer RPC: approve_and_publish_exam
CREATE OR REPLACE FUNCTION public.approve_and_publish_exam(_exam_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.exams%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam paper not found.';
  END IF;

  -- Admin/HOS Check
  IF NOT (is_admin(auth.uid()) OR has_role(auth.uid(), 'head_of_section'::app_role)) THEN
    RAISE EXCEPTION 'Only Academic Admins and Heads of Section can approve and publish exams.';
  END IF;

  -- Update exam status to published
  UPDATE public.exams
  SET
    status = 'published',
    published = true,
    published_by = auth.uid(),
    published_at = now(),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = _exam_id;

  -- Insert Audit Log
  INSERT INTO public.exam_review_history (exam_id, actor_id, action)
  VALUES (_exam_id, auth.uid(), 'approved_published');

  RETURN true;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.submit_exam_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_exam_back(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_publish_exam(uuid) TO authenticated;
