CREATE OR REPLACE FUNCTION public.rollover_session_dry_run(
  _from_session_id uuid, _to_session_id uuid, _mappings jsonb
)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  from_class_id uuid,
  from_class_name text,
  to_class_id uuid,
  to_class_name text,
  action text,
  recommendation text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb;
  from_cls uuid;
  to_cls uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins may preview rollover';
  END IF;
  IF _from_session_id IS NULL OR _to_session_id IS NULL THEN
    RAISE EXCEPTION 'Both from and to session ids are required';
  END IF;
  IF _from_session_id = _to_session_id THEN
    RAISE EXCEPTION 'From and to sessions must differ';
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(COALESCE(_mappings, '[]'::jsonb)) LOOP
    from_cls := (m->>'from_class_id')::uuid;
    to_cls   := NULLIF(m->>'to_class_id','')::uuid;

    RETURN QUERY
    SELECT
      s.id,
      s.full_name,
      from_cls,
      (SELECT c.name FROM public.classes c WHERE c.id = from_cls),
      to_cls,
      (SELECT c.name FROM public.classes c WHERE c.id = to_cls),
      CASE WHEN to_cls IS NULL THEN 'graduated' ELSE 'promoted' END,
      (
        SELECT pr.recommendation::text
        FROM public.promotion_recommendations pr
        WHERE pr.student_id = s.id
          AND pr.session_id = _from_session_id
          AND pr.status = 'approved'
        ORDER BY pr.updated_at DESC
        LIMIT 1
      )
    FROM public.students s
    WHERE s.class_id = from_cls AND s.status = 'active';
  END LOOP;
END $$;