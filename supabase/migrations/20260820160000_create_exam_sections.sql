-- 1. Create public.exam_sections table
CREATE TABLE IF NOT EXISTS public.exam_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  title text NOT NULL,
  instruction text,
  section_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_sections_exam ON public.exam_sections(exam_id, section_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_sections TO authenticated;
GRANT ALL ON public.exam_sections TO service_role;
ALTER TABLE public.exam_sections ENABLE ROW LEVEL SECURITY;

-- 2. Add section_id FK column to public.questions
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.exam_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_section ON public.questions(section_id);

-- 3. Data Migration: Backfill exam_sections from legacy questions.section_label
DO $$
DECLARE
  rec RECORD;
  sec_id uuid;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      q.exam_id,
      COALESCE(NULLIF(TRIM(q.section_label), ''), 'SECTION A') AS section_title,
      q.section_instruction,
      COALESCE(q.section_order, 1) AS s_order
    FROM public.questions q
    WHERE q.section_label IS NOT NULL AND TRIM(q.section_label) <> '' AND q.section_id IS NULL
    ORDER BY q.exam_id, COALESCE(q.section_order, 1)
  LOOP
    -- Check if section already created for this exam & title
    SELECT id INTO sec_id
    FROM public.exam_sections
    WHERE exam_id = rec.exam_id AND lower(trim(title)) = lower(trim(rec.section_title));

    IF sec_id IS NULL THEN
      INSERT INTO public.exam_sections (exam_id, title, instruction, section_order)
      VALUES (rec.exam_id, rec.section_title, rec.section_instruction, rec.s_order)
      RETURNING id INTO sec_id;
    END IF;

    -- Update matching questions with section_id
    UPDATE public.questions
    SET section_id = sec_id
    WHERE exam_id = rec.exam_id
      AND lower(trim(COALESCE(section_label, ''))) = lower(trim(rec.section_title))
      AND section_id IS NULL;
  END LOOP;
END $$;

-- 4. RLS Policies for public.exam_sections
DROP POLICY IF EXISTS "Staff manage exam_sections" ON public.exam_sections;
CREATE POLICY "Staff manage exam_sections" ON public.exam_sections
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sections.exam_id
        AND public.is_staff(auth.uid())
        AND public.class_matches_user_scope(e.class_id, auth.uid())
        AND (
          public.is_admin(auth.uid())
          OR public.teaches_class(auth.uid(), e.class_id)
          OR (e.subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sections.exam_id
        AND public.is_staff(auth.uid())
        AND public.class_matches_user_scope(e.class_id, auth.uid())
        AND (
          public.is_admin(auth.uid())
          OR public.teaches_class(auth.uid(), e.class_id)
          OR (e.subject_id IS NOT NULL AND public.teaches_class_subject(auth.uid(), e.class_id, e.subject_id))
        )
    )
  );

DROP POLICY IF EXISTS "Students view exam_sections" ON public.exam_sections;
CREATE POLICY "Students view exam_sections" ON public.exam_sections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.students s ON s.class_id = e.class_id
      WHERE e.id = exam_sections.exam_id
        AND s.user_id = auth.uid()
        AND e.published = true
    )
  );

DROP POLICY IF EXISTS "Parents view exam_sections" ON public.exam_sections;
CREATE POLICY "Parents view exam_sections" ON public.exam_sections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      JOIN public.students s ON s.class_id = e.class_id
      JOIN public.parents p ON p.id = s.parent_id
      WHERE e.id = exam_sections.exam_id
        AND p.user_id = auth.uid()
        AND e.published = true
    )
  );

-- 5. Update student_get_exam_questions RPC to return section_id and section details
DROP FUNCTION IF EXISTS public.student_get_exam_questions(uuid);

CREATE OR REPLACE FUNCTION public.student_get_exam_questions(_exam_id uuid)
 RETURNS TABLE(
   id uuid,
   question_text text,
   options jsonb,
   correct_answer text,
   marks numeric,
   "position" integer,
   media jsonb,
   question_type text,
   content_json jsonb,
   section_id uuid,
   section_title text,
   section_instruction text,
   section_order integer
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.exams%ROWTYPE;
  entitled boolean;
  src text;
BEGIN
  SELECT * INTO e FROM public.exams WHERE public.exams.id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;
  IF e.published IS NOT TRUE THEN RAISE EXCEPTION 'Exam is not published'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.user_id = auth.uid() AND s.class_id = e.class_id
  ) INTO entitled;
  IF NOT entitled THEN RAISE EXCEPTION 'Not entitled to this exam'; END IF;

  src := COALESCE(e.question_source, 'manual');

  IF src = 'random' THEN
    RETURN QUERY
    WITH pool AS (
      SELECT qb.id, qb.question_text, qb.options, qb.correct_answer,
             qb.marks, NULL::integer AS "position", qb.media, qb.question_type,
             NULL::jsonb AS content_json,
             NULL::uuid AS section_id,
             qb.section_label AS section_title,
             qb.section_instruction,
             COALESCE(qb.section_order, 1) AS section_order
      FROM public.question_bank qb
      WHERE qb.class_id = e.class_id
        AND qb.subject_id = e.subject_id
        AND qb.purpose = COALESCE(e.purpose, 'exam')
      UNION ALL
      SELECT q.id, q.question_text, q.options, q.correct_answer,
             q.marks, q."position", q.media, q.question_type,
             q.content_json,
             q.section_id,
             COALESCE(es.title, q.section_label) AS section_title,
             COALESCE(es.instruction, q.section_instruction) AS section_instruction,
             COALESCE(es.section_order, q.section_order, 1) AS section_order
      FROM public.questions q
      JOIN public.exams e2 ON e2.id = q.exam_id
      LEFT JOIN public.exam_sections es ON es.id = q.section_id
      WHERE e2.class_id = e.class_id
        AND e2.subject_id = e.subject_id
        AND COALESCE(e2.purpose, 'exam') = COALESCE(e.purpose, 'exam')
        AND e2.id <> e.id
    ),
    dedup AS (
      SELECT DISTINCT ON (lower(regexp_replace(pool.question_text, '\s+', ' ', 'g'))) pool.*
      FROM pool
      WHERE pool.question_text IS NOT NULL AND length(trim(pool.question_text)) > 0
    )
    SELECT d.id, d.question_text, d.options, d.correct_answer,
           d.marks, d."position", d.media, d.question_type, d.content_json,
           d.section_id, d.section_title, d.section_instruction, d.section_order
    FROM dedup d
    ORDER BY random()
    LIMIT COALESCE(NULLIF(e.num_questions, 0), 1000);
  ELSE
    RETURN QUERY
    SELECT q.id, q.question_text, q.options, q.correct_answer,
           q.marks, q."position", q.media, q.question_type, q.content_json,
           q.section_id,
           COALESCE(es.title, q.section_label) AS section_title,
           COALESCE(es.instruction, q.section_instruction) AS section_instruction,
           COALESCE(es.section_order, q.section_order, 1) AS section_order
    FROM public.questions q
    LEFT JOIN public.exam_sections es ON es.id = q.section_id
    WHERE q.exam_id = e.id
    ORDER BY COALESCE(es.section_order, q.section_order, 1) ASC, q."position" NULLS LAST, q.question_number NULLS LAST;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.student_get_exam_questions(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.student_get_exam_questions(uuid) TO authenticated;
