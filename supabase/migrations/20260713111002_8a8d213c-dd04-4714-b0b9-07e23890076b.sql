
-- Curriculum: restrict view to staff only (removes broad authenticated read)
DROP POLICY IF EXISTS "All view curriculum" ON public.curriculum;
CREATE POLICY "Staff view curriculum" ON public.curriculum
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Lab groups: scope view to staff or students/parents in the group's class
DROP POLICY IF EXISTS "View lab_groups" ON public.lab_groups;
CREATE POLICY "View lab_groups scoped" ON public.lab_groups
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.class_id = lab_groups.class_id AND s.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE s.class_id = lab_groups.class_id AND p.user_id = auth.uid()
    )
  );

-- Storage: staff-photos - restrict SELECT to staff only
DROP POLICY IF EXISTS "Authenticated read staff photos" ON storage.objects;
CREATE POLICY "Staff read staff photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'staff-photos' AND public.is_staff(auth.uid()));

-- Storage: student-photos - staff, the student themselves, or their parent
DROP POLICY IF EXISTS "Authenticated read student photos" ON storage.objects;
CREATE POLICY "Scoped read student photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (
      public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.photo_url IS NOT NULL
          AND s.photo_url LIKE '%' || storage.objects.name || '%'
          AND (
            s.user_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.parents p
              WHERE p.id = s.parent_id AND p.user_id = auth.uid()
            )
          )
      )
    )
  );

-- Storage: library-files - restrict SELECT to staff only
DROP POLICY IF EXISTS "Authenticated read library-files" ON storage.objects;
CREATE POLICY "Staff read library-files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'library-files' AND public.is_staff(auth.uid()));
