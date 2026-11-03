ALTER TABLE public.assessment_structures ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.assessment_structures ADD COLUMN IF NOT EXISTS delete_reason text;
CREATE OR REPLACE FUNCTION public.list_recycle_bin(_table text DEFAULT NULL) RETURNS TABLE(table_name text,record_id uuid,deleted_at timestamptz,deleted_by uuid,delete_reason text,snapshot jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
 IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Only super administrators may view the recycle bin'; END IF;
 FOREACH t IN ARRAY public.recycle_bin_tables() LOOP
 IF _table IS NOT NULL AND _table <> t THEN CONTINUE; END IF;
 RETURN QUERY EXECUTE format('SELECT %L::text,public.recycle_bin_record_id(%L,to_jsonb(x)),x.deleted_at,(to_jsonb(x)->>''deleted_by'')::uuid,to_jsonb(x)->>''delete_reason'',to_jsonb(x) || jsonb_build_object(''__recycle_bin_primary_key'',public.recycle_bin_primary_key(%L,to_jsonb(x))) FROM public.%I x WHERE x.deleted_at IS NOT NULL',t,t,t,t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.list_recycle_bin(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_recycle_bin(text) TO authenticated,service_role;