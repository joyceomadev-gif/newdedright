
-- 1. Extend exams with scheduling & release controls
ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS release_offset_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN IF NOT EXISTS is_mandatory boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_late_entry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_resume boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS arm text;

-- 2. Helper: computed timestamps for an exam row
CREATE OR REPLACE FUNCTION public.exam_release_at(_exam_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT opens_at - make_interval(mins => release_offset_minutes)
  FROM public.exams WHERE id = _exam_id
$$;

CREATE OR REPLACE FUNCTION public.exam_end_at(_exam_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(closes_at, opens_at + make_interval(mins => COALESCE(duration_minutes, 60)))
  FROM public.exams WHERE id = _exam_id
$$;

-- 3. Visibility check: is this exam visible to this student right now?
CREATE OR REPLACE FUNCTION public.student_can_view_exam(_exam_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exams e
    JOIN public.students s ON s.class_id = e.class_id
    WHERE e.id = _exam_id
      AND s.user_id = _user_id
      AND e.published = true
      AND e.opens_at IS NOT NULL
      AND now() >= (e.opens_at - make_interval(mins => e.release_offset_minutes))
      AND now() <= COALESCE(e.closes_at, e.opens_at + make_interval(mins => COALESCE(e.duration_minutes, 60)))
  )
$$;

-- 4. Start eligibility check
CREATE OR REPLACE FUNCTION public.student_can_start_exam(_exam_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.exams%ROWTYPE;
  student_row public.students%ROWTYPE;
  now_ts timestamptz := now();
  release_ts timestamptz;
  end_ts timestamptz;
  existing_attempt public.exam_attempts%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND OR NOT e.published OR e.opens_at IS NULL THEN RETURN false; END IF;

  SELECT * INTO student_row FROM public.students WHERE user_id = auth.uid() AND class_id = e.class_id;
  IF NOT FOUND THEN RETURN false; END IF;

  release_ts := e.opens_at - make_interval(mins => e.release_offset_minutes);
  end_ts := COALESCE(e.closes_at, e.opens_at + make_interval(mins => COALESCE(e.duration_minutes, 60)));

  IF now_ts < release_ts THEN RETURN false; END IF;
  IF now_ts > end_ts THEN RETURN false; END IF;
  -- late entry: after start_time (opens_at) requires allow_late_entry
  IF now_ts > e.opens_at AND NOT e.allow_late_entry THEN
    -- allow resume if a previous attempt exists and resume is permitted
    SELECT * INTO existing_attempt FROM public.exam_attempts
      WHERE exam_id = _exam_id AND student_id = student_row.id;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;

  -- Cannot restart if already submitted
  SELECT * INTO existing_attempt FROM public.exam_attempts
    WHERE exam_id = _exam_id AND student_id = student_row.id;
  IF FOUND AND existing_attempt.status IN ('submitted','completed','auto_submitted') THEN
    RETURN false;
  END IF;

  RETURN true;
END $$;

-- 5. Student-visible exams RPC (used by student portal list)
CREATE OR REPLACE FUNCTION public.student_visible_exams()
RETURNS TABLE (
  id uuid, title text, type exam_type, purpose text,
  subject_id uuid, subject_name text, class_id uuid,
  opens_at timestamptz, closes_at timestamptz, release_at timestamptz,
  duration_minutes integer, max_score numeric,
  time_zone text, is_mandatory boolean, allow_late_entry boolean, allow_resume boolean,
  instructions text, attempt_status text, attempt_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id, e.title, e.type, e.purpose,
    e.subject_id, sub.name AS subject_name, e.class_id,
    e.opens_at, COALESCE(e.closes_at, e.opens_at + make_interval(mins => COALESCE(e.duration_minutes,60))) AS closes_at,
    e.opens_at - make_interval(mins => e.release_offset_minutes) AS release_at,
    e.duration_minutes, e.max_score,
    e.time_zone, e.is_mandatory, e.allow_late_entry, e.allow_resume,
    e.instructions,
    a.status AS attempt_status, a.id AS attempt_id
  FROM public.exams e
  JOIN public.students s ON s.class_id = e.class_id AND s.user_id = auth.uid()
  LEFT JOIN public.subjects sub ON sub.id = e.subject_id
  LEFT JOIN public.exam_attempts a ON a.exam_id = e.id AND a.student_id = s.id
  WHERE e.published = true
    AND e.opens_at IS NOT NULL
    AND now() >= (e.opens_at - make_interval(mins => e.release_offset_minutes))
    AND now() <= COALESCE(e.closes_at, e.opens_at + make_interval(mins => COALESCE(e.duration_minutes,60)))
  ORDER BY e.opens_at ASC
$$;

GRANT EXECUTE ON FUNCTION public.student_visible_exams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_can_start_exam(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_can_view_exam(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_release_at(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exam_end_at(uuid) TO authenticated;

-- 6. Tighten student SELECT on exams: only visible within the release window
DROP POLICY IF EXISTS "View exams" ON public.exams;
CREATE POLICY "View exams" ON public.exams
FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'head_of_section'::app_role)
  OR (
    is_staff(auth.uid()) AND class_matches_user_scope(class_id, auth.uid())
    AND (teaches_class(auth.uid(), class_id)
      OR (subject_id IS NOT NULL AND teaches_class_subject(auth.uid(), class_id, subject_id)))
  )
  OR (
    -- Student can only see the exam within the release window
    published = true
    AND opens_at IS NOT NULL
    AND now() >= (opens_at - make_interval(mins => release_offset_minutes))
    AND now() <= COALESCE(closes_at, opens_at + make_interval(mins => COALESCE(duration_minutes,60)))
    AND class_id IN (SELECT class_id FROM public.students WHERE user_id = auth.uid())
  )
  OR (
    -- Parents view published exams for their child's class (unchanged behavior)
    published = true
    AND EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.parents p ON s.parent_id = p.id
      WHERE p.user_id = auth.uid() AND s.class_id = exams.class_id
    )
  )
);

-- 7. Tighten student INSERT on exam_attempts: server-verified start window
DROP POLICY IF EXISTS "Student insert own exam_attempts" ON public.exam_attempts;
CREATE POLICY "Student insert own exam_attempts" ON public.exam_attempts
FOR INSERT TO authenticated
WITH CHECK (
  student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  AND public.student_can_start_exam(exam_id)
);

-- 8. Practical exam uploads table
CREATE TABLE IF NOT EXISTS public.exam_attempt_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  original_filename text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.exam_attempt_uploads TO authenticated;
GRANT ALL ON public.exam_attempt_uploads TO service_role;
ALTER TABLE public.exam_attempt_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own upload rows" ON public.exam_attempt_uploads
FOR ALL TO authenticated
USING (
  attempt_id IN (
    SELECT a.id FROM public.exam_attempts a
    JOIN public.students s ON s.id = a.student_id
    WHERE s.user_id = auth.uid()
  )
  OR is_staff(auth.uid())
)
WITH CHECK (
  attempt_id IN (
    SELECT a.id FROM public.exam_attempts a
    JOIN public.students s ON s.id = a.student_id
    WHERE s.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_exam_attempt_uploads_attempt ON public.exam_attempt_uploads(attempt_id);

-- 9. Live monitor summary for staff
CREATE OR REPLACE FUNCTION public.exam_live_stats(_exam_id uuid)
RETURNS TABLE (
  eligible integer, started integer, in_progress integer,
  submitted integer, absent integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (SELECT * FROM public.exams WHERE id = _exam_id),
  roster AS (
    SELECT s.id FROM public.students s, e WHERE s.class_id = e.class_id AND s.status = 'active'
  ),
  atts AS (
    SELECT * FROM public.exam_attempts WHERE exam_id = _exam_id
  )
  SELECT
    (SELECT COUNT(*)::int FROM roster),
    (SELECT COUNT(*)::int FROM atts),
    (SELECT COUNT(*)::int FROM atts WHERE status = 'in_progress'),
    (SELECT COUNT(*)::int FROM atts WHERE status IN ('submitted','completed','auto_submitted')),
    (SELECT COUNT(*)::int FROM roster) - (SELECT COUNT(*)::int FROM atts)
$$;
GRANT EXECUTE ON FUNCTION public.exam_live_stats(uuid) TO authenticated;

-- 10. Notify students when an exam is published
CREATE OR REPLACE FUNCTION public.notify_students_on_publish()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  subj text;
  body_text text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.published = false AND NEW.published = true)
     OR (TG_OP = 'INSERT' AND NEW.published = true) THEN
    subj := 'New examination published: ' || NEW.title;
    body_text := 'A ' || NEW.type::text || ' exam has been scheduled for ' ||
                 to_char(NEW.opens_at AT TIME ZONE COALESCE(NEW.time_zone,'Africa/Lagos'), 'DD Mon YYYY HH24:MI') ||
                 '. It will appear on your dashboard ' || NEW.release_offset_minutes ||
                 ' minutes before start.';
    INSERT INTO public.notifications (recipient_user_id, channel, status, subject, body, related_id, related_type)
    SELECT s.user_id, 'in_app', 'sent', subj, body_text, NEW.id, 'exam'
    FROM public.students s
    WHERE s.class_id = NEW.class_id AND s.user_id IS NOT NULL AND s.status = 'active';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_students_on_publish ON public.exams;
CREATE TRIGGER trg_notify_students_on_publish
AFTER INSERT OR UPDATE OF published ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.notify_students_on_publish();
