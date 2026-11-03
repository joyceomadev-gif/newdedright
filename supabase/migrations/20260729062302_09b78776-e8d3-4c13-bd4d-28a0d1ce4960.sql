CREATE TABLE public.broadsheet_student_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id UUID NOT NULL REFERENCES public.broadsheet_headers(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_comment TEXT,
  principal_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (session_id, term_id, class_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadsheet_student_comments TO authenticated;
GRANT ALL ON public.broadsheet_student_comments TO service_role;

ALTER TABLE public.broadsheet_student_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage comments for their class drafts" ON public.broadsheet_student_comments
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.broadsheet_headers h
    WHERE h.id = broadsheet_student_comments.header_id
      AND h.status = 'draft'
      AND (public.is_class_teacher_of(auth.uid(), h.class_id) OR public.teaches_class(auth.uid(), h.class_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.broadsheet_headers h
    WHERE h.id = broadsheet_student_comments.header_id
      AND h.status = 'draft'
      AND (public.is_class_teacher_of(auth.uid(), h.class_id) OR public.teaches_class(auth.uid(), h.class_id))
  )
);

CREATE POLICY "Admins and principals can manage all comments" ON public.broadsheet_student_comments
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'principal'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'principal'));

CREATE POLICY "Students can read own published comments" ON public.broadsheet_student_comments
FOR SELECT TO authenticated
USING (
  student_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.broadsheet_headers h
    WHERE h.id = broadsheet_student_comments.header_id
      AND h.status = 'published'
  )
);

CREATE POLICY "Parents can read published comments for their children" ON public.broadsheet_student_comments
FOR SELECT TO authenticated
USING (
  public.is_parent_of_student(auth.uid(), broadsheet_student_comments.student_id)
  AND EXISTS (
    SELECT 1 FROM public.broadsheet_headers h
    WHERE h.id = broadsheet_student_comments.header_id
      AND h.status = 'published'
  )
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_broadsheet_student_comments_updated_at
BEFORE UPDATE ON public.broadsheet_student_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();