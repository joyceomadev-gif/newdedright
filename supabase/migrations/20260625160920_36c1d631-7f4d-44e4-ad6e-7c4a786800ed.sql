
-- 1) Backfill staff.user_id by matching email to auth.users (case-insensitive),
--    only where exactly one auth user matches and the staff row is unlinked.
UPDATE public.staff s
SET user_id = u.id
FROM auth.users u
WHERE s.user_id IS NULL
  AND s.email IS NOT NULL
  AND lower(u.email) = lower(s.email)
  AND (SELECT count(*) FROM auth.users u2 WHERE lower(u2.email) = lower(s.email)) = 1;

-- 2) Restrict question visibility:
--    - admins/super_admins: all
--    - teachers: only questions for exams in classes they are the class teacher of
--    - students: only questions for published exams in their class (unchanged)
DROP POLICY IF EXISTS "View questions" ON public.questions;
CREATE POLICY "View questions" ON public.questions
FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.is_class_teacher_of(auth.uid(), e.class_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.exams e
    JOIN public.students s ON s.class_id = e.class_id
    WHERE e.id = questions.exam_id
      AND s.user_id = auth.uid()
      AND e.published = true
  )
);

-- Tighten the manage policy too: teachers may only manage their own class
-- questions (admins keep full access via the separate admin policy).
DROP POLICY IF EXISTS "Class teacher manage own class questions" ON public.questions;
CREATE POLICY "Teacher manage own class questions" ON public.questions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.is_class_teacher_of(auth.uid(), e.class_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = questions.exam_id
      AND public.is_class_teacher_of(auth.uid(), e.class_id)
  )
);

-- 3) Restrict question_bank: admins see all; teachers see only their own bank
--    rows (those they authored). Students never see the bank.
DROP POLICY IF EXISTS "Staff view question bank" ON public.question_bank;
DROP POLICY IF EXISTS "Staff manage question bank" ON public.question_bank;

CREATE POLICY "Admin manage question bank" ON public.question_bank
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Teacher view own question bank" ON public.question_bank
FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR created_by = auth.uid()
);

CREATE POLICY "Teacher manage own question bank" ON public.question_bank
FOR ALL
USING (
  public.is_admin(auth.uid())
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR created_by = auth.uid()
);
