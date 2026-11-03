
-- Enums
DO $$ BEGIN
  CREATE TYPE public.staff_status AS ENUM ('active','on_leave','suspended','terminated','retired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.employment_type AS ENUM ('full_time','part_time','contract','volunteer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.staff_attendance_status AS ENUM ('present','absent','late','half_day','leave');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_type AS ENUM ('annual','sick','maternity','paternity','study','unpaid','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payroll_status AS ENUM ('draft','approved','paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS qualification text,
  ADD COLUMN IF NOT EXISTS nin text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS employment_type public.employment_type NOT NULL DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS status public.staff_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS date_terminated date,
  ADD COLUMN IF NOT EXISTS notes text;

-- Storage bucket for staff photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-photos', 'staff-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read staff photos" ON storage.objects;
CREATE POLICY "Public read staff photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-photos');

DROP POLICY IF EXISTS "Admins manage staff photos" ON storage.objects;
CREATE POLICY "Admins manage staff photos" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'staff-photos' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'staff-photos' AND public.is_admin(auth.uid()));

-- Staff attendance
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  date date NOT NULL,
  status public.staff_attendance_status NOT NULL DEFAULT 'present',
  check_in time,
  check_out time,
  remark text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, date)
);
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage staff_attendance" ON public.staff_attendance;
CREATE POLICY "Admin manage staff_attendance" ON public.staff_attendance FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "View own staff_attendance" ON public.staff_attendance;
CREATE POLICY "View own staff_attendance" ON public.staff_attendance FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_date ON public.staff_attendance(staff_id, date);

-- Leave
CREATE TABLE IF NOT EXISTS public.staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  leave_type public.leave_type NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_leave ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage staff_leave" ON public.staff_leave;
CREATE POLICY "Admin manage staff_leave" ON public.staff_leave FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff request leave" ON public.staff_leave;
CREATE POLICY "Staff request leave" ON public.staff_leave FOR INSERT TO authenticated
  WITH CHECK (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "View own leave" ON public.staff_leave;
CREATE POLICY "View own leave" ON public.staff_leave FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

-- Payroll
CREATE TABLE IF NOT EXISTS public.payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  basic_salary numeric NOT NULL DEFAULT 0,
  allowances numeric NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  status public.payroll_status NOT NULL DEFAULT 'draft',
  paid_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, period_year, period_month)
);
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage payroll" ON public.payroll;
CREATE POLICY "Admin manage payroll" ON public.payroll FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "View own payroll" ON public.payroll;
CREATE POLICY "View own payroll" ON public.payroll FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );

-- Evaluations
CREATE TABLE IF NOT EXISTS public.staff_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  period text NOT NULL,
  evaluator_id uuid,
  punctuality int CHECK (punctuality BETWEEN 0 AND 10),
  performance int CHECK (performance BETWEEN 0 AND 10),
  teamwork int CHECK (teamwork BETWEEN 0 AND 10),
  conduct int CHECK (conduct BETWEEN 0 AND 10),
  overall_score numeric,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage staff_evaluations" ON public.staff_evaluations;
CREATE POLICY "Admin manage staff_evaluations" ON public.staff_evaluations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "View own evaluations" ON public.staff_evaluations;
CREATE POLICY "View own evaluations" ON public.staff_evaluations FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid())
  );
