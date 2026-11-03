
CREATE TYPE trait_rating AS ENUM ('M','SP','P','NA');

CREATE TABLE public.student_trait_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  trait_item_id uuid NOT NULL REFERENCES public.trait_items(id) ON DELETE CASCADE,
  rating trait_rating NOT NULL,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id, trait_item_id)
);

CREATE INDEX idx_str_student_term ON public.student_trait_ratings(student_id, term_id);
CREATE INDEX idx_str_term_item ON public.student_trait_ratings(term_id, trait_item_id);

ALTER TABLE public.student_trait_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage trait ratings" ON public.student_trait_ratings
  FOR ALL TO authenticated
  USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "View own trait ratings" ON public.student_trait_ratings
  FOR SELECT TO authenticated
  USING (
    is_staff(auth.uid())
    OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
    OR student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.parents p ON p.id = s.parent_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_str_updated_at
  BEFORE UPDATE ON public.student_trait_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
