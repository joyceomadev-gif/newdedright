
-- 1. Extend exam_status with 'pending_review' (must be committed before use).
ALTER TYPE public.exam_status ADD VALUE IF NOT EXISTS 'pending_review';

-- 2. New columns to track submission for review.
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid;

-- 3. Helper: does the exam already have any student attempts?
CREATE OR REPLACE FUNCTION public.exam_has_attempts(_exam_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.exam_attempts WHERE exam_id = _exam_id)
$$;

REVOKE EXECUTE ON FUNCTION public.exam_has_attempts(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.exam_has_attempts(uuid) TO authenticated, service_role;

-- 4. Trigger: enforce exam publish workflow + lock after attempts.
CREATE OR REPLACE FUNCTION public.enforce_exam_publish_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  admin boolean := public.is_admin(uid);
  locked boolean := public.exam_has_attempts(OLD.id);
  new_status text := NEW.status::text;
  old_status text := OLD.status::text;
BEGIN
  -- Lock: once any attempt exists, block edits to teaching-material fields
  -- and block unpublishing / re-publishing.
  IF locked THEN
    IF NEW.title            IS DISTINCT FROM OLD.title
    OR NEW.type             IS DISTINCT FROM OLD.type
    OR NEW.subject_id       IS DISTINCT FROM OLD.subject_id
    OR NEW.class_id         IS DISTINCT FROM OLD.class_id
    OR NEW.term_id          IS DISTINCT FROM OLD.term_id
    OR NEW.max_score        IS DISTINCT FROM OLD.max_score
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.num_questions    IS DISTINCT FROM OLD.num_questions
    OR NEW.question_source  IS DISTINCT FROM OLD.question_source
    OR NEW.randomize_options IS DISTINCT FROM OLD.randomize_options
    OR NEW.randomize_questions IS DISTINCT FROM OLD.randomize_questions
    OR NEW.pass_mark        IS DISTINCT FROM OLD.pass_mark
    OR NEW.opens_at         IS DISTINCT FROM OLD.opens_at
    OR NEW.closes_at        IS DISTINCT FROM OLD.closes_at
    OR NEW.instructions     IS DISTINCT FROM OLD.instructions
    OR NEW.purpose          IS DISTINCT FROM OLD.purpose THEN
      RAISE EXCEPTION 'Exam is locked: students have already started or completed it';
    END IF;
    IF NEW.published IS DISTINCT FROM OLD.published
       OR new_status IS DISTINCT FROM old_status THEN
      -- allow only 'closed' transition (admins may close a taken exam)
      IF NOT (admin AND new_status = 'closed') THEN
        RAISE EXCEPTION 'Exam is locked: publish/status cannot change after students have taken it';
      END IF;
    END IF;
  END IF;

  -- Publishing: only admins may publish.
  IF (NEW.published = true AND OLD.published = false)
     OR (new_status = 'published' AND old_status <> 'published') THEN
    IF NOT admin THEN
      RAISE EXCEPTION 'Only administrators may publish exams';
    END IF;
    NEW.published    := true;
    NEW.status       := 'published'::public.exam_status;
    NEW.published_at := COALESCE(NEW.published_at, now());
    NEW.published_by := COALESCE(NEW.published_by, uid);
  END IF;

  -- Unpublish / status leaves 'published': clear stamps, keep flags in sync.
  IF (OLD.published = true AND NEW.published = false)
     OR (old_status = 'published' AND new_status <> 'published') THEN
    IF NOT admin THEN
      RAISE EXCEPTION 'Only administrators may unpublish exams';
    END IF;
    NEW.published    := false;
    NEW.published_at := NULL;
    NEW.published_by := NULL;
    IF new_status = 'published' THEN
      NEW.status := 'draft'::public.exam_status;
    END IF;
  END IF;

  -- Teacher submit for review: draft -> pending_review.
  IF new_status = 'pending_review' AND old_status <> 'pending_review' THEN
    NEW.submitted_for_review_at := now();
    NEW.submitted_by := uid;
  END IF;

  -- Any move away from pending_review clears submission stamps.
  IF old_status = 'pending_review' AND new_status <> 'pending_review' THEN
    NEW.submitted_for_review_at := NULL;
    NEW.submitted_by := NULL;
  END IF;

  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_exam_publish_rules() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_exam_publish_rules ON public.exams;
CREATE TRIGGER trg_enforce_exam_publish_rules
BEFORE UPDATE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_publish_rules();

-- Also stamp publish info on INSERT when a row is created straight into published.
CREATE OR REPLACE FUNCTION public.enforce_exam_publish_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NEW.published = true OR NEW.status = 'published'::public.exam_status THEN
    IF NOT public.is_admin(uid) THEN
      RAISE EXCEPTION 'Only administrators may publish exams';
    END IF;
    NEW.published := true;
    NEW.status := 'published'::public.exam_status;
    NEW.published_at := COALESCE(NEW.published_at, now());
    NEW.published_by := COALESCE(NEW.published_by, uid);
  END IF;
  IF NEW.status = 'pending_review'::public.exam_status THEN
    NEW.submitted_for_review_at := COALESCE(NEW.submitted_for_review_at, now());
    NEW.submitted_by := COALESCE(NEW.submitted_by, uid);
  END IF;
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_exam_publish_insert() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_exam_publish_insert ON public.exams;
CREATE TRIGGER trg_enforce_exam_publish_insert
BEFORE INSERT ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.enforce_exam_publish_insert();

-- 5. Trigger on questions: block writes when parent exam has attempts.
CREATE OR REPLACE FUNCTION public.enforce_questions_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_exam uuid := COALESCE(NEW.exam_id, OLD.exam_id);
BEGIN
  IF target_exam IS NOT NULL AND public.exam_has_attempts(target_exam) THEN
    RAISE EXCEPTION 'Exam is locked: students have already started or completed it';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_questions_locked() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_questions_locked ON public.questions;
CREATE TRIGGER trg_enforce_questions_locked
BEFORE INSERT OR UPDATE OR DELETE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.enforce_questions_locked();

-- 6. Widen questions SELECT so a class teacher (not just the subject teacher)
--    can see questions for exams in their class. Admins & students unchanged.
DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions" ON public.questions
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = questions.exam_id
        AND public.class_matches_user_scope(e.class_id, auth.uid())
        AND (
          public.teaches_class(auth.uid(), e.class_id)
          OR (e.subject_id IS NOT NULL
              AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.students s ON s.class_id = e.class_id
      WHERE e.id = questions.exam_id
        AND s.user_id = auth.uid()
        AND e.published = true
    )
  );
