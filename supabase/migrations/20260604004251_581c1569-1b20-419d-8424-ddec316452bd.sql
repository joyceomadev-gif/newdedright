
-- 1) Restrict students from reading exam questions before exam day; staff unchanged
DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions"
  ON public.questions
  FOR SELECT
  TO authenticated
  USING (
    is_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.exams e
      JOIN public.students s ON s.class_id = e.class_id
      WHERE e.id = questions.exam_id
        AND s.user_id = auth.uid()
        AND e.published = true
        AND e.exam_date = CURRENT_DATE
    )
  );

-- 2) Restrict school_subscription SELECT (incl. license_key) to admins only
DROP POLICY IF EXISTS "All view subscription" ON public.school_subscription;
CREATE POLICY "Admin view subscription"
  ON public.school_subscription
  FOR SELECT
  TO authenticated
  USING (is_admin(auth.uid()));

-- 3) Allow recording staff to read attendance entries they recorded
CREATE POLICY "Recorder view staff_attendance"
  ON public.staff_attendance
  FOR SELECT
  TO authenticated
  USING (
    recorded_by IN (
      SELECT staff.id FROM public.staff WHERE staff.user_id = auth.uid()
    )
  );
