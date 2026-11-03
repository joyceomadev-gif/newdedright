DO $$
DECLARE r record; sig text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    sig := 'public.' || quote_ident(r.proname) || '(' || r.args || ')';
    EXECUTE 'REVOKE ALL ON FUNCTION ' || sig || ' FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION ' || sig || ' FROM anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || sig || ' TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || sig || ' TO service_role';
  END LOOP;
END $$;
