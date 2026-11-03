
-- Resource type enum
CREATE TYPE public.resource_type AS ENUM ('pdf','ebook','journal','video','article','other');
CREATE TYPE public.equipment_condition AS ENUM ('new','good','fair','poor','out_of_service');
CREATE TYPE public.allocation_status AS ENUM ('allocated','returned','overdue','lost');

-- Digital library resources
CREATE TABLE public.library_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type resource_type NOT NULL DEFAULT 'pdf',
  category text,
  author text,
  publisher text,
  description text,
  file_url text,
  external_url text,
  thumbnail_url text,
  duration_minutes integer,
  view_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.library_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view resources" ON public.library_resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage resources" ON public.library_resources FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE TRIGGER trg_library_resources_updated BEFORE UPDATE ON public.library_resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Equipment
CREATE TABLE public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  serial_number text,
  location text,
  condition equipment_condition NOT NULL DEFAULT 'good',
  total_quantity integer NOT NULL DEFAULT 1,
  available_quantity integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view equipment" ON public.equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage equipment" ON public.equipment FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE TRIGGER trg_equipment_updated BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Equipment allocations
CREATE TABLE public.equipment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  allocated_to uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  allocated_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  returned_date date,
  status allocation_status NOT NULL DEFAULT 'allocated',
  purpose text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view allocations" ON public.equipment_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage allocations" ON public.equipment_allocations FOR ALL TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('library-files','library-files', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read library-files" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'library-files');
CREATE POLICY "Authenticated upload library-files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'library-files');
CREATE POLICY "Staff update library-files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'library-files' AND is_staff(auth.uid()));
CREATE POLICY "Staff delete library-files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'library-files' AND is_staff(auth.uid()));
