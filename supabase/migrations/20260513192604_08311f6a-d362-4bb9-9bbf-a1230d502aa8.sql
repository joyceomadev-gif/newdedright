
CREATE TYPE meeting_status AS ENUM ('requested','confirmed','completed','cancelled');
CREATE TYPE notification_channel AS ENUM ('in_app','email','sms');
CREATE TYPE notification_status AS ENUM ('queued','sent','failed','read');

CREATE TABLE public.parent_teacher_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  student_id uuid,
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  location text,
  agenda text,
  status meeting_status NOT NULL DEFAULT 'requested',
  requested_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptm_parent ON public.parent_teacher_meetings(parent_id);
CREATE INDEX idx_ptm_teacher ON public.parent_teacher_meetings(teacher_id);
CREATE INDEX idx_ptm_scheduled ON public.parent_teacher_meetings(scheduled_at);

CREATE TRIGGER trg_ptm_updated_at BEFORE UPDATE ON public.parent_teacher_meetings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.parent_teacher_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage meetings" ON public.parent_teacher_meetings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Teacher view own meetings" ON public.parent_teacher_meetings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    teacher_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()) OR
    parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid())
  );

CREATE POLICY "Teacher update own meetings" ON public.parent_teacher_meetings
  FOR UPDATE TO authenticated
  USING (teacher_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()))
  WITH CHECK (teacher_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Parent create meetings" ON public.parent_teacher_meetings
  FOR INSERT TO authenticated
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

CREATE POLICY "Parent update own meetings" ON public.parent_teacher_meetings
  FOR UPDATE TO authenticated
  USING (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()))
  WITH CHECK (parent_id IN (SELECT id FROM public.parents WHERE user_id = auth.uid()));

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  subject text,
  body text NOT NULL,
  status notification_status NOT NULL DEFAULT 'queued',
  related_type text,
  related_id uuid,
  created_by uuid,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_recipient ON public.notifications(recipient_user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Recipient view own" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Recipient mark read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE POLICY "Staff send notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());
