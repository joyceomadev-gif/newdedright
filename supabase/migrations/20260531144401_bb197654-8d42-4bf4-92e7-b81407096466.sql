
-- Health module tables
CREATE TABLE public.health_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  temperature_c numeric,
  pulse_bpm integer,
  bp_systolic integer,
  bp_diastolic integer,
  respiratory_rate integer,
  weight_kg numeric,
  height_cm numeric,
  symptoms text,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_observations TO authenticated;
GRANT ALL ON public.health_observations TO service_role;
ALTER TABLE public.health_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage health_observations" ON public.health_observations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "View own health_observations" ON public.health_observations FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  OR student_id IN (SELECT s.id FROM public.students s JOIN public.parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
);
CREATE INDEX idx_health_obs_student ON public.health_observations(student_id, recorded_at DESC);

CREATE TABLE public.health_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'medication',
  name text NOT NULL,
  dose text,
  route text,
  result text,
  ordered_at timestamptz,
  administered_at timestamptz DEFAULT now(),
  notes text,
  attachment_url text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_medications_type_chk CHECK (type IN ('medication','test'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_medications TO authenticated;
GRANT ALL ON public.health_medications TO service_role;
ALTER TABLE public.health_medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage health_medications" ON public.health_medications FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "View own health_medications" ON public.health_medications FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  OR student_id IN (SELECT s.id FROM public.students s JOIN public.parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
);
CREATE INDEX idx_health_meds_student ON public.health_medications(student_id, administered_at DESC);

CREATE TABLE public.health_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'referral',
  facility text,
  reason text,
  outcome text,
  referred_at timestamptz DEFAULT now(),
  follow_up_date date,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_referrals_kind_chk CHECK (kind IN ('referral','discharge'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_referrals TO authenticated;
GRANT ALL ON public.health_referrals TO service_role;
ALTER TABLE public.health_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage health_referrals" ON public.health_referrals FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "View own health_referrals" ON public.health_referrals FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  OR student_id IN (SELECT s.id FROM public.students s JOIN public.parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
);
CREATE INDEX idx_health_ref_student ON public.health_referrals(student_id, referred_at DESC);

-- Question-level scoring for CAs and Exams (manual, non-CBT)
CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  purpose text NOT NULL,
  term_id uuid,
  session_id uuid,
  title text,
  question_text text,
  max_score numeric NOT NULL DEFAULT 1,
  position integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_purpose_chk CHECK (purpose IN ('ca1','ca2','ca3','exam'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_questions TO authenticated;
GRANT ALL ON public.assessment_questions TO service_role;
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage assessment_questions" ON public.assessment_questions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "View assessment_questions" ON public.assessment_questions FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR class_id IN (SELECT class_id FROM public.students WHERE user_id = auth.uid())
  OR class_id IN (SELECT s.class_id FROM public.students s JOIN public.parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
);
CREATE INDEX idx_aq_class_subject_purpose ON public.assessment_questions(class_id, subject_id, purpose);

CREATE TABLE public.assessment_question_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  assessment_question_id uuid NOT NULL REFERENCES public.assessment_questions(id) ON DELETE CASCADE,
  ca_id uuid,
  exam_id uuid,
  score numeric NOT NULL DEFAULT 0,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, assessment_question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_question_scores TO authenticated;
GRANT ALL ON public.assessment_question_scores TO service_role;
ALTER TABLE public.assessment_question_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff manage aq_scores" ON public.assessment_question_scores FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "View own aq_scores" ON public.assessment_question_scores FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR student_id IN (SELECT id FROM public.students WHERE user_id = auth.uid())
  OR student_id IN (SELECT s.id FROM public.students s JOIN public.parents p ON s.parent_id = p.id WHERE p.user_id = auth.uid())
);
CREATE INDEX idx_aqs_question ON public.assessment_question_scores(assessment_question_id);
CREATE INDEX idx_aqs_student ON public.assessment_question_scores(student_id);
