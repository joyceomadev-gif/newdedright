
-- Announcements: enforce audience filtering
DROP POLICY IF EXISTS "View published announcements" ON public.announcements;
CREATE POLICY "View published announcements"
ON public.announcements
FOR SELECT
TO authenticated
USING (
  published = true
  AND (expires_at IS NULL OR expires_at > now())
  AND (
    audience IS NULL
    OR audience = 'all'
    OR (audience = 'staff'    AND public.is_staff(auth.uid()))
    OR (audience = 'students' AND public.has_role(auth.uid(), 'student'))
    OR (audience = 'parents'  AND public.has_role(auth.uid(), 'parent'))
    OR public.is_admin(auth.uid())
  )
);

-- user_roles: prevent non-super-admins from assigning super_admin
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  AND role <> 'super_admin'::app_role
);

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND role <> 'super_admin'::app_role
);
