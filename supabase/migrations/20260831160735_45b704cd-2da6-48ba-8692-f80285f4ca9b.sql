
-- 1. Granular permission tables
CREATE TABLE IF NOT EXISTS public.role_submodule_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_slug text NOT NULL,
  submodule_slug text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module_slug, submodule_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_submodule_permissions TO authenticated;
GRANT ALL ON public.role_submodule_permissions TO service_role;
ALTER TABLE public.role_submodule_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rsp_read" ON public.role_submodule_permissions;
CREATE POLICY "rsp_read" ON public.role_submodule_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rsp_admin_write" ON public.role_submodule_permissions;
CREATE POLICY "rsp_admin_write" ON public.role_submodule_permissions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS rsp_set_updated_at ON public.role_submodule_permissions;
CREATE TRIGGER rsp_set_updated_at BEFORE UPDATE ON public.role_submodule_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.role_function_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  module_slug text NOT NULL,
  function_code text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module_slug, function_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_function_permissions TO authenticated;
GRANT ALL ON public.role_function_permissions TO service_role;
ALTER TABLE public.role_function_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rfp_read" ON public.role_function_permissions;
CREATE POLICY "rfp_read" ON public.role_function_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rfp_admin_write" ON public.role_function_permissions;
CREATE POLICY "rfp_admin_write" ON public.role_function_permissions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP TRIGGER IF EXISTS rfp_set_updated_at ON public.role_function_permissions;
CREATE TRIGGER rfp_set_updated_at BEFORE UPDATE ON public.role_function_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Exam review history
CREATE TABLE IF NOT EXISTS public.exam_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  action text NOT NULL,
  feedback text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_review_history_exam_idx ON public.exam_review_history(exam_id);
GRANT SELECT ON public.exam_review_history TO authenticated;
GRANT ALL ON public.exam_review_history TO service_role;
ALTER TABLE public.exam_review_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erh_staff_read" ON public.exam_review_history;
CREATE POLICY "erh_staff_read" ON public.exam_review_history FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR public.is_admin(auth.uid()));

-- 3. Exam workflow RPCs
DROP FUNCTION IF EXISTS public.submit_exam_for_review(uuid);
CREATE OR REPLACE FUNCTION public.submit_exam_for_review(_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_staff(auth.uid()) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.exams
     SET status = 'pending_review'::exam_status,
         submitted_for_review_at = now(),
         submitted_by = auth.uid()
   WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  INSERT INTO public.exam_review_history(exam_id, action, actor_id)
  VALUES (_exam_id, 'submitted_for_review', auth.uid());
  RETURN jsonb_build_object('ok', true);
END; $$;

DROP FUNCTION IF EXISTS public.send_exam_back(uuid, text);
CREATE OR REPLACE FUNCTION public.send_exam_back(_exam_id uuid, _feedback text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) AND NOT public.is_principal(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.exams
     SET status = 'draft'::exam_status, published = false
   WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  INSERT INTO public.exam_review_history(exam_id, action, feedback, actor_id)
  VALUES (_exam_id, 'sent_back', _feedback, auth.uid());
  RETURN jsonb_build_object('ok', true);
END; $$;

DROP FUNCTION IF EXISTS public.approve_and_publish_exam(uuid);
CREATE OR REPLACE FUNCTION public.approve_and_publish_exam(_exam_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) AND NOT public.is_principal(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.exams
     SET status = 'published'::exam_status,
         published = true,
         published_at = now(),
         published_by = auth.uid()
   WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  INSERT INTO public.exam_review_history(exam_id, action, actor_id)
  VALUES (_exam_id, 'approved_and_published', auth.uid());
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 4. Server-side CBT scoring
DROP FUNCTION IF EXISTS public.submit_exam_attempt(uuid, uuid, timestamptz, timestamptz, integer, jsonb);
CREATE OR REPLACE FUNCTION public.submit_exam_attempt(
  _exam_id uuid,
  _student_id uuid,
  _started_at timestamptz,
  _submitted_at timestamptz,
  _duration_seconds integer,
  _answers jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _raw numeric := 0;
  _total numeric := 0;
  _pct numeric := 0;
  _graded jsonb := '[]'::jsonb;
  _attempt_id uuid;
  _ans jsonb;
  _q record;
  _student_answer text;
  _is_correct boolean;
  _needs_grading boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR _q IN
    SELECT id, correct_answer, marks, question_type
      FROM public.questions
     WHERE exam_id = _exam_id AND deleted_at IS NULL
  LOOP
    _total := _total + COALESCE(_q.marks, 1);
    SELECT elem INTO _ans
      FROM jsonb_array_elements(COALESCE(_answers, '[]'::jsonb)) elem
     WHERE elem->>'question_id' = _q.id::text
     LIMIT 1;
    _student_answer := _ans->>'student_answer';
    _needs_grading := COALESCE(_q.question_type, 'mcq') NOT IN ('mcq', 'multiple_choice', 'objective', 'true_false');
    _is_correct := (NOT _needs_grading)
      AND _student_answer IS NOT NULL
      AND _q.correct_answer IS NOT NULL
      AND lower(btrim(_student_answer)) = lower(btrim(_q.correct_answer));
    IF _is_correct THEN _raw := _raw + COALESCE(_q.marks, 1); END IF;
    _graded := _graded || jsonb_build_object(
      'question_id', _q.id,
      'student_answer', _student_answer,
      'marks', COALESCE(_q.marks, 1),
      'is_correct', _is_correct,
      'needs_grading', _needs_grading
    );
  END LOOP;

  _pct := CASE WHEN _total > 0 THEN round((_raw / _total) * 100, 2) ELSE 0 END;

  INSERT INTO public.exam_attempts(
    exam_id, student_id, started_at, submitted_at, duration_seconds,
    raw_score, total_marks, percentage, answers, status
  ) VALUES (
    _exam_id, _student_id, _started_at, _submitted_at, _duration_seconds,
    _raw, _total, _pct, _graded, 'submitted'
  )
  RETURNING id INTO _attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', _attempt_id,
    'raw_score', _raw,
    'total_marks', _total,
    'percentage', _pct
  );
END; $$;

-- 5. Permission lookups
DROP FUNCTION IF EXISTS public.get_user_effective_permissions(uuid);
CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'is_super_admin', public.is_super_admin(_user_id),
    'modules', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'module_slug', m.module_slug, 'can_read', m.can_read, 'can_write', m.can_write,
        'can_edit', m.can_edit, 'can_delete', m.can_delete))
      FROM public.role_module_permissions m
      JOIN public.user_roles ur ON ur.user_id = _user_id AND ur.role::text = m.role
    ), '[]'::jsonb),
    'submodules', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'module_slug', s.module_slug, 'submodule_slug', s.submodule_slug,
        'can_read', s.can_read, 'can_write', s.can_write,
        'can_edit', s.can_edit, 'can_delete', s.can_delete))
      FROM public.role_submodule_permissions s
      JOIN public.user_roles ur ON ur.user_id = _user_id AND ur.role::text = s.role
    ), '[]'::jsonb),
    'functions', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'module_slug', f.module_slug, 'function_code', f.function_code, 'is_allowed', f.is_allowed))
      FROM public.role_function_permissions f
      JOIN public.user_roles ur ON ur.user_id = _user_id AND ur.role::text = f.role
    ), '[]'::jsonb)
  );
$$;

DROP FUNCTION IF EXISTS public.check_user_function_permission(uuid, text, text);
CREATE OR REPLACE FUNCTION public.check_user_function_permission(_user_id uuid, _module_slug text, _function_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_admin(_user_id) THEN true
    ELSE COALESCE((
      SELECT bool_or(f.is_allowed)
        FROM public.role_function_permissions f
        JOIN public.user_roles ur ON ur.user_id = _user_id AND ur.role::text = f.role
       WHERE f.module_slug = _module_slug AND f.function_code = _function_code
    ), COALESCE((
      SELECT bool_or(m.can_write)
        FROM public.role_module_permissions m
        JOIN public.user_roles ur ON ur.user_id = _user_id AND ur.role::text = m.role
       WHERE m.module_slug = _module_slug
    ), false))
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_exam_for_review(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_exam_back(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_and_publish_exam(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_exam_attempt(uuid, uuid, timestamptz, timestamptz, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_effective_permissions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_user_function_permission(uuid, text, text) FROM anon;
