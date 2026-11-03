
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_teacher_id_fkey;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.staff(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON public.subjects(teacher_id);

DROP TYPE IF EXISTS public.leave_status CASCADE;
DROP TYPE IF EXISTS public.leave_type CASCADE;
CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE public.leave_type AS ENUM ('annual','sick','personal','maternity','paternity','study','other');

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL DEFAULT 'personal',
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON public.leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage leave_requests" ON public.leave_requests;
CREATE POLICY "Admin manage leave_requests"
  ON public.leave_requests FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff view own leave" ON public.leave_requests;
CREATE POLICY "Staff view own leave"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Staff create own leave" ON public.leave_requests;
CREATE POLICY "Staff create own leave"
  ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Staff update own pending leave" ON public.leave_requests;
CREATE POLICY "Staff update own pending leave"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
    AND status = 'pending'
  )
  WITH CHECK (
    staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS set_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER set_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
