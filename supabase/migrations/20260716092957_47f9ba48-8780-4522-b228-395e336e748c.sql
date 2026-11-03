
-- =========================================================
-- PHASE 1: Soft-delete foundation
-- =========================================================

-- 1) Add deleted_at / deleted_by / delete_reason to all domain tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'announcements','assessment_question_scores','assessment_questions',
    'assignment_submissions','assignments','attendance','book_loans','branches',
    'class_teachers','classes','continuous_assessments','curriculum','equipment',
    'equipment_allocations','exam_attempt_uploads','exam_attempts','exams',
    'expenses','fee_structures','fees','health_medications','health_observations',
    'health_referrals','lab_attendance','lab_group_members','lab_groups',
    'lab_incidents','lab_sessions','labs','leave_requests','lesson_plans',
    'library_books','library_resources','messages','parent_teacher_meetings',
    'parents','payment_transactions','payroll','promotion',
    'promotion_recommendations','question_bank','questions','report_cards',
    'results','staff','staff_attendance','staff_evaluations','staff_leave',
    'student_trait_ratings','students','subject_teachers','subjects','timetable',
    'trait_categories','trait_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I
                    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
                    ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
                    ADD COLUMN IF NOT EXISTS delete_reason text', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (deleted_at) WHERE deleted_at IS NOT NULL',
                   t || '_deleted_at_idx', t);
  END LOOP;
END $$;

-- 2) Recycle bin audit log
CREATE TABLE IF NOT EXISTS public.recycle_bin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('soft_delete','restore','hard_delete')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recycle_bin_audit_table_idx ON public.recycle_bin_audit (table_name, record_id);
CREATE INDEX IF NOT EXISTS recycle_bin_audit_created_idx ON public.recycle_bin_audit (created_at DESC);

GRANT SELECT ON public.recycle_bin_audit TO authenticated;
GRANT ALL ON public.recycle_bin_audit TO service_role;

ALTER TABLE public.recycle_bin_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read audit log" ON public.recycle_bin_audit;
CREATE POLICY "Super admins read audit log" ON public.recycle_bin_audit
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins read own actions" ON public.recycle_bin_audit;
CREATE POLICY "Admins read own actions" ON public.recycle_bin_audit
FOR SELECT TO authenticated
USING (actor_user_id = auth.uid() AND public.is_admin(auth.uid()));

-- 3) Restrictive policy: hide soft-deleted rows from everyone except super_admin
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'announcements','assessment_question_scores','assessment_questions',
    'assignment_submissions','assignments','attendance','book_loans','branches',
    'class_teachers','classes','continuous_assessments','curriculum','equipment',
    'equipment_allocations','exam_attempt_uploads','exam_attempts','exams',
    'expenses','fee_structures','fees','health_medications','health_observations',
    'health_referrals','lab_attendance','lab_group_members','lab_groups',
    'lab_incidents','lab_sessions','labs','leave_requests','lesson_plans',
    'library_books','library_resources','messages','parent_teacher_meetings',
    'parents','payment_transactions','payroll','promotion',
    'promotion_recommendations','question_bank','questions','report_cards',
    'results','staff','staff_attendance','staff_evaluations','staff_leave',
    'student_trait_ratings','students','subject_teachers','subjects','timetable',
    'trait_categories','trait_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "hide_soft_deleted" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "hide_soft_deleted" ON public.%I AS RESTRICTIVE
       FOR SELECT TO authenticated, anon
       USING (deleted_at IS NULL OR public.is_super_admin(auth.uid()))', t);
  END LOOP;
END $$;

-- 4) Core RPCs

-- Soft delete: any admin/staff who currently has UPDATE rights on the row can send it to the bin.
CREATE OR REPLACE FUNCTION public.soft_delete_row(
  _table text,
  _id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  snap jsonb;
  allowed_tables text[] := ARRAY[
    'announcements','assessment_question_scores','assessment_questions',
    'assignment_submissions','assignments','attendance','book_loans','branches',
    'class_teachers','classes','continuous_assessments','curriculum','equipment',
    'equipment_allocations','exam_attempt_uploads','exam_attempts','exams',
    'expenses','fee_structures','fees','health_medications','health_observations',
    'health_referrals','lab_attendance','lab_group_members','lab_groups',
    'lab_incidents','lab_sessions','labs','leave_requests','lesson_plans',
    'library_books','library_resources','messages','parent_teacher_meetings',
    'parents','payment_transactions','payroll','promotion',
    'promotion_recommendations','question_bank','questions','report_cards',
    'results','staff','staff_attendance','staff_evaluations','staff_leave',
    'student_trait_ratings','students','subject_teachers','subjects','timetable',
    'trait_categories','trait_items'
  ];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not eligible for soft delete', _table;
  END IF;
  IF NOT (public.is_admin(uid) OR public.is_staff(uid)) THEN
    RAISE EXCEPTION 'Only staff or administrators may delete records';
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', _table)
    INTO snap USING _id;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'Record % not found in %', _id, _table;
  END IF;
  IF (snap->>'deleted_at') IS NOT NULL THEN
    RAISE EXCEPTION 'Record is already in the recycle bin';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = now(), deleted_by = $1, delete_reason = $2 WHERE id = $3',
    _table
  ) USING uid, _reason, _id;

  INSERT INTO public.recycle_bin_audit (table_name, record_id, action, actor_user_id, reason, snapshot)
  VALUES (_table, _id, 'soft_delete', uid, _reason, snap);

  RETURN jsonb_build_object('ok', true, 'table', _table, 'id', _id);
END $$;

-- Restore: super_admin only
CREATE OR REPLACE FUNCTION public.restore_row(
  _table text,
  _id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  snap jsonb;
  allowed_tables text[] := ARRAY[
    'announcements','assessment_question_scores','assessment_questions',
    'assignment_submissions','assignments','attendance','book_loans','branches',
    'class_teachers','classes','continuous_assessments','curriculum','equipment',
    'equipment_allocations','exam_attempt_uploads','exam_attempts','exams',
    'expenses','fee_structures','fees','health_medications','health_observations',
    'health_referrals','lab_attendance','lab_group_members','lab_groups',
    'lab_incidents','lab_sessions','labs','leave_requests','lesson_plans',
    'library_books','library_resources','messages','parent_teacher_meetings',
    'parents','payment_transactions','payroll','promotion',
    'promotion_recommendations','question_bank','questions','report_cards',
    'results','staff','staff_attendance','staff_evaluations','staff_leave',
    'student_trait_ratings','students','subject_teachers','subjects','timetable',
    'trait_categories','trait_items'
  ];
BEGIN
  IF NOT public.is_super_admin(uid) THEN
    RAISE EXCEPTION 'Only super administrators may restore records';
  END IF;
  IF NOT (_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not eligible for restore', _table;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', _table)
    INTO snap USING _id;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'Record not found';
  END IF;
  IF (snap->>'deleted_at') IS NULL THEN
    RAISE EXCEPTION 'Record is not in the recycle bin';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL WHERE id = $1',
    _table
  ) USING _id;

  INSERT INTO public.recycle_bin_audit (table_name, record_id, action, actor_user_id, reason, snapshot)
  VALUES (_table, _id, 'restore', uid, NULL, snap);

  RETURN jsonb_build_object('ok', true);
END $$;

-- Hard delete: super_admin only
CREATE OR REPLACE FUNCTION public.hard_delete_row(
  _table text,
  _id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  snap jsonb;
  allowed_tables text[] := ARRAY[
    'announcements','assessment_question_scores','assessment_questions',
    'assignment_submissions','assignments','attendance','book_loans','branches',
    'class_teachers','classes','continuous_assessments','curriculum','equipment',
    'equipment_allocations','exam_attempt_uploads','exam_attempts','exams',
    'expenses','fee_structures','fees','health_medications','health_observations',
    'health_referrals','lab_attendance','lab_group_members','lab_groups',
    'lab_incidents','lab_sessions','labs','leave_requests','lesson_plans',
    'library_books','library_resources','messages','parent_teacher_meetings',
    'parents','payment_transactions','payroll','promotion',
    'promotion_recommendations','question_bank','questions','report_cards',
    'results','staff','staff_attendance','staff_evaluations','staff_leave',
    'student_trait_ratings','students','subject_teachers','subjects','timetable',
    'trait_categories','trait_items'
  ];
BEGIN
  IF NOT public.is_super_admin(uid) THEN
    RAISE EXCEPTION 'Only super administrators may permanently delete records';
  END IF;
  IF NOT (_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'Table % not eligible', _table;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', _table)
    INTO snap USING _id;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'Record not found';
  END IF;

  INSERT INTO public.recycle_bin_audit (table_name, record_id, action, actor_user_id, reason, snapshot)
  VALUES (_table, _id, 'hard_delete', uid, _reason, snap);

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _table) USING _id;

  RETURN jsonb_build_object('ok', true);
END $$;

-- List recycle bin (super admin)
CREATE OR REPLACE FUNCTION public.list_recycle_bin(_table text DEFAULT NULL)
RETURNS TABLE(
  table_name text,
  record_id uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  snapshot jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'announcements','assessment_question_scores','assessment_questions',
    'assignment_submissions','assignments','attendance','book_loans','branches',
    'class_teachers','classes','continuous_assessments','curriculum','equipment',
    'equipment_allocations','exam_attempt_uploads','exam_attempts','exams',
    'expenses','fee_structures','fees','health_medications','health_observations',
    'health_referrals','lab_attendance','lab_group_members','lab_groups',
    'lab_incidents','lab_sessions','labs','leave_requests','lesson_plans',
    'library_books','library_resources','messages','parent_teacher_meetings',
    'parents','payment_transactions','payroll','promotion',
    'promotion_recommendations','question_bank','questions','report_cards',
    'results','staff','staff_attendance','staff_evaluations','staff_leave',
    'student_trait_ratings','students','subject_teachers','subjects','timetable',
    'trait_categories','trait_items'
  ];
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super administrators may view the recycle bin';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF _table IS NOT NULL AND _table <> t THEN CONTINUE; END IF;
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      RETURN QUERY EXECUTE format(
        'SELECT %L::text, id, deleted_at, deleted_by, delete_reason, to_jsonb(x)
         FROM public.%I x
         WHERE deleted_at IS NOT NULL', t, t);
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_row(text,uuid,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_row(text,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.hard_delete_row(text,uuid,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_recycle_bin(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.soft_delete_row(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_row(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_row(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_recycle_bin(text) TO authenticated;
