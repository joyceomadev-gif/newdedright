-- ============ Extend equipment ============
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS lab_id uuid,
  ADD COLUMN IF NOT EXISTS min_quantity integer NOT NULL DEFAULT 0;

-- ============ labs ============
CREATE TABLE IF NOT EXISTS public.labs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  location text,
  capacity integer,
  safety_rules text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labs TO authenticated;
GRANT ALL ON public.labs TO service_role;
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view labs" ON public.labs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage labs" ON public.labs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_labs_updated_at BEFORE UPDATE ON public.labs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add FK from equipment.lab_id now that labs exists
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_lab_id_fkey FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE SET NULL;

-- ============ lab_sessions ============
CREATE TABLE IF NOT EXISTS public.lab_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  subject_id uuid,
  teacher_id uuid,
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_sessions TO authenticated;
GRANT ALL ON public.lab_sessions TO service_role;
ALTER TABLE public.lab_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View lab_sessions" ON public.lab_sessions FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR class_id IN (SELECT class_id FROM public.students WHERE user_id = auth.uid())
    OR class_id IN (
      SELECT s.class_id FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
CREATE POLICY "Staff manage lab_sessions" ON public.lab_sessions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_lab_sessions_updated_at BEFORE UPDATE ON public.lab_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Conflict trigger: same lab cannot overlap; same class cannot overlap
CREATE OR REPLACE FUNCTION public.validate_lab_session_conflict()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Session end must be after start';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lab_sessions s
    WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.lab_id = NEW.lab_id
      AND s.start_at < NEW.end_at
      AND s.end_at   > NEW.start_at
  ) THEN
    RAISE EXCEPTION 'Lab already booked for an overlapping time window';
  END IF;
  IF NEW.class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.lab_sessions s
    WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.class_id = NEW.class_id
      AND s.start_at < NEW.end_at
      AND s.end_at   > NEW.start_at
  ) THEN
    RAISE EXCEPTION 'Class already booked in a lab for an overlapping time window';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lab_session_conflict
  BEFORE INSERT OR UPDATE ON public.lab_sessions
  FOR EACH ROW EXECUTE FUNCTION public.validate_lab_session_conflict();

-- ============ lab_incidents ============
CREATE TABLE IF NOT EXISTS public.lab_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.lab_sessions(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'minor',
  description text NOT NULL,
  actions_taken text,
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_incidents TO authenticated;
GRANT ALL ON public.lab_incidents TO service_role;
ALTER TABLE public.lab_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view lab_incidents" ON public.lab_incidents FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff manage lab_incidents" ON public.lab_incidents FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ lab_groups & members ============
CREATE TABLE IF NOT EXISTS public.lab_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id uuid REFERENCES public.labs(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_groups TO authenticated;
GRANT ALL ON public.lab_groups TO service_role;
ALTER TABLE public.lab_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View lab_groups" ON public.lab_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage lab_groups" ON public.lab_groups FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.lab_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.lab_groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_group_members TO authenticated;
GRANT ALL ON public.lab_group_members TO service_role;
ALTER TABLE public.lab_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View lab_group_members" ON public.lab_group_members FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
CREATE POLICY "Staff manage lab_group_members" ON public.lab_group_members FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ lab_attendance ============
CREATE TABLE IF NOT EXISTS public.lab_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.lab_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'present',
  remark text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_attendance TO authenticated;
GRANT ALL ON public.lab_attendance TO service_role;
ALTER TABLE public.lab_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View lab_attendance" ON public.lab_attendance FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE p.user_id = auth.uid()
    )
  );
CREATE POLICY "Staff manage lab_attendance" ON public.lab_attendance FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lab_sessions_lab_time ON public.lab_sessions(lab_id, start_at);
CREATE INDEX IF NOT EXISTS idx_lab_sessions_class_time ON public.lab_sessions(class_id, start_at);
CREATE INDEX IF NOT EXISTS idx_lab_incidents_lab ON public.lab_incidents(lab_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_attendance_session ON public.lab_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_equipment_lab ON public.equipment(lab_id);