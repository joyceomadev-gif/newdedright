DO $$
DECLARE t text;
  tbls text[] := ARRAY[
    'parents','staff','staff_attendance','staff_leave','staff_evaluations','payroll','leave_requests',
    'subjects','timetable','lesson_plans','trait_categories','trait_items','student_trait_ratings',
    'library_books','library_resources','book_loans',
    'health_observations','health_medications','health_referrals',
    'labs','lab_sessions','lab_groups','equipment','equipment_allocations',
    'expenses'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS academic_session_id uuid REFERENCES public.sessions(id) DEFAULT public.get_current_session_id()', t);
    EXECUTE format('UPDATE public.%I SET academic_session_id = public.get_current_session_id() WHERE academic_session_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (academic_session_id)', 'idx_'||t||'_academic_session_id', t);
  END LOOP;
END $$;

ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS term_id uuid REFERENCES public.terms(id);
UPDATE public.payment_transactions pt SET term_id = f.term_id FROM public.fees f WHERE f.id = pt.fee_id AND pt.term_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_term_id ON public.payment_transactions (term_id);
