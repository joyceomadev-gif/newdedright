CREATE OR REPLACE FUNCTION public.class_matches_user_scope(_class_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_super_admin(_user_id)
    OR (
      public.is_admin(_user_id)
      AND public.get_user_level_scope(_user_id) IS NULL
    )
    OR (
      public.get_user_level_scope(_user_id) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = _class_id
          AND public.class_level_bucket(c.level::text) = public.get_user_level_scope(_user_id)
      )
    )
$function$;