
-- ============== HEADERS (primary/secondary) ==============
CREATE TABLE public.broadsheet_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','published')),
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, term_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadsheet_headers TO authenticated;
GRANT ALL ON public.broadsheet_headers TO service_role;
ALTER TABLE public.broadsheet_headers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bh_read" ON public.broadsheet_headers FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
  OR (status = 'published' AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.class_id = broadsheet_headers.class_id AND s.user_id = auth.uid()
  ))
  OR (status = 'published' AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.parents p ON p.id = s.parent_id
    WHERE s.class_id = broadsheet_headers.class_id AND p.user_id = auth.uid()
  ))
);
CREATE POLICY "bh_write_teacher_draft" ON public.broadsheet_headers FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id));
CREATE POLICY "bh_update_teacher_draft" ON public.broadsheet_headers FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR (public.teaches_class(auth.uid(), class_id) AND status = 'draft'))
WITH CHECK (public.is_admin(auth.uid()) OR (public.teaches_class(auth.uid(), class_id) AND status = 'draft'));
CREATE POLICY "bh_delete_admin" ON public.broadsheet_headers FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER bh_updated BEFORE UPDATE ON public.broadsheet_headers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== BROADSHEET ROWS ==============
CREATE TABLE public.broadsheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id uuid NOT NULL REFERENCES public.broadsheet_headers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  ca1 numeric,
  ca2 numeric,
  ca3 numeric,
  exam_score numeric,
  total_ca numeric GENERATED ALWAYS AS (COALESCE(ca1,0)+COALESCE(ca2,0)+COALESCE(ca3,0)) STORED,
  total_score numeric GENERATED ALWAYS AS (COALESCE(ca1,0)+COALESCE(ca2,0)+COALESCE(ca3,0)+COALESCE(exam_score,0)) STORED,
  teacher_comment text,
  principal_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, term_id, class_id, student_id, subject_id)
);
CREATE INDEX broadsheets_header_idx ON public.broadsheets(header_id);
CREATE INDEX broadsheets_student_idx ON public.broadsheets(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadsheets TO authenticated;
GRANT ALL ON public.broadsheets TO service_role;
ALTER TABLE public.broadsheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "b_read" ON public.broadsheets FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
  OR EXISTS (
    SELECT 1 FROM public.broadsheet_headers h
    WHERE h.id = broadsheets.header_id AND h.status = 'published'
      AND (
        EXISTS (SELECT 1 FROM public.students s WHERE s.id = broadsheets.student_id AND s.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id
                   WHERE s.id = broadsheets.student_id AND p.user_id = auth.uid())
      )
  )
);
CREATE POLICY "b_write_teacher_draft" ON public.broadsheets FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.broadsheet_headers h WHERE h.id = broadsheets.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
);
CREATE POLICY "b_update_teacher_draft" ON public.broadsheets FOR UPDATE TO authenticated
USING (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.broadsheet_headers h WHERE h.id = broadsheets.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
)
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.broadsheet_headers h WHERE h.id = broadsheets.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
);
CREATE POLICY "b_delete_admin" ON public.broadsheets FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER b_updated BEFORE UPDATE ON public.broadsheets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== NURSERY HEADERS ==============
CREATE TABLE public.nursery_broadsheet_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated','published')),
  validated_at timestamptz,
  validated_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, term_id, class_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nursery_broadsheet_headers TO authenticated;
GRANT ALL ON public.nursery_broadsheet_headers TO service_role;
ALTER TABLE public.nursery_broadsheet_headers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbh_read" ON public.nursery_broadsheet_headers FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
  OR (status = 'published' AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.class_id = nursery_broadsheet_headers.class_id AND s.user_id = auth.uid()
  ))
  OR (status = 'published' AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.parents p ON p.id = s.parent_id
    WHERE s.class_id = nursery_broadsheet_headers.class_id AND p.user_id = auth.uid()
  ))
);
CREATE POLICY "nbh_write" ON public.nursery_broadsheet_headers FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id));
CREATE POLICY "nbh_update" ON public.nursery_broadsheet_headers FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR (public.teaches_class(auth.uid(), class_id) AND status = 'draft'))
WITH CHECK (public.is_admin(auth.uid()) OR (public.teaches_class(auth.uid(), class_id) AND status = 'draft'));
CREATE POLICY "nbh_delete" ON public.nursery_broadsheet_headers FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER nbh_updated BEFORE UPDATE ON public.nursery_broadsheet_headers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== NURSERY ROWS ==============
CREATE TABLE public.nursery_broadsheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id uuid NOT NULL REFERENCES public.nursery_broadsheet_headers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  area_title text NOT NULL,
  item_key text NOT NULL,
  item_text text,
  rating smallint CHECK (rating IN (1,2,3)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (header_id, student_id, area_title, item_key)
);
CREATE INDEX nb_header_idx ON public.nursery_broadsheets(header_id);
CREATE INDEX nb_student_idx ON public.nursery_broadsheets(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nursery_broadsheets TO authenticated;
GRANT ALL ON public.nursery_broadsheets TO service_role;
ALTER TABLE public.nursery_broadsheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nb_read" ON public.nursery_broadsheets FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
  OR EXISTS (
    SELECT 1 FROM public.nursery_broadsheet_headers h
    WHERE h.id = nursery_broadsheets.header_id AND h.status = 'published'
      AND (
        EXISTS (SELECT 1 FROM public.students s WHERE s.id = nursery_broadsheets.student_id AND s.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id
                   WHERE s.id = nursery_broadsheets.student_id AND p.user_id = auth.uid())
      )
  )
);
CREATE POLICY "nb_write" ON public.nursery_broadsheets FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.nursery_broadsheet_headers h WHERE h.id = nursery_broadsheets.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
);
CREATE POLICY "nb_update" ON public.nursery_broadsheets FOR UPDATE TO authenticated
USING (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.nursery_broadsheet_headers h WHERE h.id = nursery_broadsheets.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
)
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.nursery_broadsheet_headers h WHERE h.id = nursery_broadsheets.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
);
CREATE POLICY "nb_delete" ON public.nursery_broadsheets FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER nb_updated BEFORE UPDATE ON public.nursery_broadsheets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== NURSERY PER-STUDENT COMMENTS ==============
CREATE TABLE public.nursery_broadsheet_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  header_id uuid NOT NULL REFERENCES public.nursery_broadsheet_headers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (header_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nursery_broadsheet_comments TO authenticated;
GRANT ALL ON public.nursery_broadsheet_comments TO service_role;
ALTER TABLE public.nursery_broadsheet_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nbc_read" ON public.nursery_broadsheet_comments FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.teaches_class(auth.uid(), class_id)
  OR EXISTS (
    SELECT 1 FROM public.nursery_broadsheet_headers h
    WHERE h.id = nursery_broadsheet_comments.header_id AND h.status = 'published'
      AND (
        EXISTS (SELECT 1 FROM public.students s WHERE s.id = nursery_broadsheet_comments.student_id AND s.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.students s JOIN public.parents p ON p.id = s.parent_id
                   WHERE s.id = nursery_broadsheet_comments.student_id AND p.user_id = auth.uid())
      )
  )
);
CREATE POLICY "nbc_write" ON public.nursery_broadsheet_comments FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.nursery_broadsheet_headers h WHERE h.id = nursery_broadsheet_comments.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
);
CREATE POLICY "nbc_update" ON public.nursery_broadsheet_comments FOR UPDATE TO authenticated
USING (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.nursery_broadsheet_headers h WHERE h.id = nursery_broadsheet_comments.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
)
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.teaches_class(auth.uid(), class_id))
  AND EXISTS (SELECT 1 FROM public.nursery_broadsheet_headers h WHERE h.id = nursery_broadsheet_comments.header_id AND (h.status = 'draft' OR public.is_admin(auth.uid())))
);
CREATE POLICY "nbc_delete" ON public.nursery_broadsheet_comments FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER nbc_updated BEFORE UPDATE ON public.nursery_broadsheet_comments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
