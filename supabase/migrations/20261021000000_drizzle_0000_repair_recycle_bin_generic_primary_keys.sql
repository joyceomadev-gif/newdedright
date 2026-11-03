ALTER TABLE public.recycle_bin_audit ADD COLUMN IF NOT EXISTS original_primary_key jsonb;
COMMENT ON COLUMN public.recycle_bin_audit.original_primary_key IS 'Original primary key column names and values, including composite keys; table_name identifies the source table.';
CREATE OR REPLACE FUNCTION public.recycle_bin_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT ARRAY['announcements','assessment_question_scores','assessment_questions','assignment_submissions','assignments','attendance','book_loans','branches','class_teachers','classes','continuous_assessments','curriculum','equipment','equipment_allocations','exam_attempt_uploads','exam_attempts','exams','expenses','fee_structures','fees','health_medications','health_observations','health_referrals','lab_attendance','lab_group_members','lab_groups','lab_incidents','lab_sessions','labs','leave_requests','lesson_plans','library_books','library_resources','messages','parent_teacher_meetings','parents','payment_transactions','payroll','promotion','promotion_recommendations','question_bank','questions','report_cards','results','staff','staff_attendance','staff_evaluations','staff_leave','student_trait_ratings','students','subject_teachers','subjects','timetable','trait_categories','trait_items','assessment_structures','exam_sections','report_templates']::text[] $$;
CREATE OR REPLACE FUNCTION public.recycle_bin_primary_key(_table text, _snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE key_value jsonb;
BEGIN
 SELECT jsonb_object_agg(a.attname, _snapshot -> a.attname ORDER BY u.ord) INTO key_value FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY u(attnum,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum WHERE n.nspname='public' AND c.relname=_table AND i.indisprimary;
 IF key_value IS NULL OR EXISTS (SELECT 1 FROM jsonb_each(key_value) WHERE value = 'null'::jsonb) THEN RAISE EXCEPTION 'Missing original primary key for table %', _table; END IF;
 RETURN key_value;
END $$;
CREATE OR REPLACE FUNCTION public.recycle_bin_record_id(_table text, _snapshot jsonb) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE key_value jsonb := public.recycle_bin_primary_key(_table,_snapshot); single_value text;
BEGIN
 IF (SELECT count(*) FROM jsonb_object_keys(key_value)) = 1 THEN
 SELECT value INTO single_value FROM jsonb_each_text(key_value);
 IF single_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN single_value::uuid; END IF;
 END IF;
 RETURN md5(_table || ':' || key_value::text)::uuid;
END $$;
CREATE OR REPLACE FUNCTION public.list_recycle_bin(_table text DEFAULT NULL) RETURNS TABLE(table_name text,record_id uuid,deleted_at timestamptz,deleted_by uuid,delete_reason text,snapshot jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Only super administrators may view the recycle bin'; END IF;
 FOREACH t IN ARRAY public.recycle_bin_tables() LOOP
 IF _table IS NOT NULL AND _table <> t THEN CONTINUE; END IF;
 RETURN QUERY EXECUTE format('SELECT %L::text,public.recycle_bin_record_id(%L,to_jsonb(x)),x.deleted_at,x.deleted_by,x.delete_reason,to_jsonb(x) || jsonb_build_object(''__recycle_bin_primary_key'',public.recycle_bin_primary_key(%L,to_jsonb(x))) FROM public.%I x WHERE x.deleted_at IS NOT NULL',t,t,t,t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.soft_delete_row(_table text,_id uuid,_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); snap jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT (_table = ANY(public.recycle_bin_tables())) THEN RAISE EXCEPTION 'Table % not eligible for soft delete',_table; END IF;
 IF NOT (public.is_admin(uid) OR public.is_staff(uid)) THEN RAISE EXCEPTION 'Only staff or administrators may delete records'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE public.recycle_bin_record_id(%L,to_jsonb(t)) = $1 FOR UPDATE',_table,_table) INTO snap USING _id;
 IF snap IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
 IF (snap->>'deleted_at') IS NOT NULL THEN RAISE EXCEPTION 'Record is already in the recycle bin'; END IF;
 EXECUTE format('UPDATE public.%I t SET deleted_at=now(),deleted_by=$1,delete_reason=$2 WHERE public.recycle_bin_record_id(%L,to_jsonb(t))=$3',_table,_table) USING uid,_reason,_id;
 INSERT INTO public.recycle_bin_audit(table_name,record_id,action,actor_user_id,reason,snapshot,original_primary_key) VALUES(_table,_id,'soft_delete',uid,_reason,snap,public.recycle_bin_primary_key(_table,snap));
 RETURN jsonb_build_object('ok',true,'table',_table,'id',_id);
END $$;
CREATE OR REPLACE FUNCTION public.restore_row(_table text,_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); snap jsonb;
BEGIN
 IF NOT public.is_super_admin(uid) THEN RAISE EXCEPTION 'Only super administrators may restore records'; END IF;
 IF NOT (_table = ANY(public.recycle_bin_tables())) THEN RAISE EXCEPTION 'Table % not eligible for restore',_table; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE public.recycle_bin_record_id(%L,to_jsonb(t))=$1 FOR UPDATE',_table,_table) INTO snap USING _id;
 IF snap IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
 IF (snap->>'deleted_at') IS NULL THEN RAISE EXCEPTION 'Record is not in the recycle bin'; END IF;
 EXECUTE format('UPDATE public.%I t SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL WHERE public.recycle_bin_record_id(%L,to_jsonb(t))=$1',_table,_table) USING _id;
 INSERT INTO public.recycle_bin_audit(table_name,record_id,action,actor_user_id,reason,snapshot,original_primary_key) VALUES(_table,_id,'restore',uid,NULL,snap,public.recycle_bin_primary_key(_table,snap));
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.hard_delete_row(_table text,_id uuid,_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); snap jsonb;
BEGIN
 IF NOT public.is_super_admin(uid) THEN RAISE EXCEPTION 'Only super administrators may permanently delete records'; END IF;
 IF NOT (_table = ANY(public.recycle_bin_tables())) THEN RAISE EXCEPTION 'Table % not eligible',_table; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE public.recycle_bin_record_id(%L,to_jsonb(t))=$1 FOR UPDATE',_table,_table) INTO snap USING _id;
 IF snap IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
 IF (snap->>'deleted_at') IS NULL THEN RAISE EXCEPTION 'Record is not in the recycle bin'; END IF;
 INSERT INTO public.recycle_bin_audit(table_name,record_id,action,actor_user_id,reason,snapshot,original_primary_key) VALUES(_table,_id,'hard_delete',uid,_reason,snap,public.recycle_bin_primary_key(_table,snap));
 EXECUTE format('DELETE FROM public.%I t WHERE public.recycle_bin_record_id(%L,to_jsonb(t))=$1',_table,_table) USING _id;
 RETURN jsonb_build_object('ok',true);
END $$;
UPDATE public.recycle_bin_audit a SET original_primary_key=public.recycle_bin_primary_key(a.table_name,a.snapshot) WHERE a.original_primary_key IS NULL;
REVOKE ALL ON FUNCTION public.recycle_bin_tables(),public.recycle_bin_primary_key(text,jsonb),public.recycle_bin_record_id(text,jsonb),public.list_recycle_bin(text),public.soft_delete_row(text,uuid,text),public.restore_row(text,uuid),public.hard_delete_row(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recycle_bin_tables(),public.recycle_bin_primary_key(text,jsonb),public.recycle_bin_record_id(text,jsonb),public.list_recycle_bin(text),public.soft_delete_row(text,uuid,text),public.restore_row(text,uuid),public.hard_delete_row(text,uuid,text) TO authenticated,service_role;