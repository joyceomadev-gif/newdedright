-- 20260903120500_backfill_and_verification.sql
-- Reconstructs past-session class history for students who were already
-- promoted before this migration existed, using the `promotion` table
-- (which has been logging from_class_id/to_class_id/session_id all along)
-- plus each class's own session_id. Also fixes graduated students, whose
-- class_id was never updated by rollover_session() (only status was),
-- so the trigger in migration 2 wouldn't have fired a fresh row for them.

-- 1) Reconstruct the "before" side of every past promotion.
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT p.student_id, c.session_id, p.from_class_id, 'historical'
FROM public.promotion p
JOIN public.classes c ON c.id = p.from_class_id
WHERE p.from_class_id IS NOT NULL AND c.session_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO NOTHING;

-- 2) Reconstruct the "after" side of every past promotion (to_class_id).
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT p.student_id, c.session_id, p.to_class_id,
       CASE WHEN p.status = 'graduated' THEN 'graduated' ELSE 'promoted' END
FROM public.promotion p
JOIN public.classes c ON c.id = p.to_class_id
WHERE p.to_class_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO NOTHING;

-- 3) Students who graduated: class_id in `students` stays on their last
--    class (rollover_session never clears it), so also record it against
--    that class's own session explicitly with status='graduated'.
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT s.id, c.session_id, s.class_id, 'graduated'
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
WHERE s.status = 'graduated' AND c.session_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO UPDATE
  SET status = 'graduated';

-- 4) Every student's CURRENT class/session, guaranteed correct last
--    (overwrites anything stale from steps 1-3 for the current session only).
INSERT INTO public.student_enrollments (student_id, session_id, class_id, status)
SELECT s.id, c.session_id, s.class_id,
       CASE WHEN s.status = 'graduated' THEN 'graduated'
            WHEN s.status = 'withdrawn' THEN 'withdrawn'
            ELSE 'active' END
FROM public.students s
JOIN public.classes c ON c.id = s.class_id
WHERE c.session_id IS NOT NULL
ON CONFLICT (student_id, session_id) DO UPDATE
  SET class_id = EXCLUDED.class_id, status = EXCLUDED.status, recorded_at = now();

-- ===================== VERIFICATION — run these before considering the migration done =====================

-- Any active student with NO enrollment history row at all?
-- (would indicate a class with no session_id — fix that class first)
-- SELECT s.id, s.full_name, s.admission_no, s.class_id
-- FROM public.students s
-- LEFT JOIN public.student_enrollments se ON se.student_id = s.id
-- WHERE se.id IS NULL AND s.status = 'active';

-- Spot-check: does a promoted student now show BOTH their old and new
-- session in history? Replace the id with a real student who was promoted.
-- SELECT * FROM public.student_academic_history WHERE student_id = '<uuid>';

-- Any first_name/last_name splits that look wrong (compound or single-word names)?
-- SELECT id, full_name, first_name, middle_name, last_name
-- FROM public.students WHERE last_name IS NULL;

-- Any transaction rows that still ended up without a session
-- (should all return 0 once this file has run)?
-- SELECT 'continuous_assessments', count(*) FROM public.continuous_assessments WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'exams', count(*) FROM public.exams WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'results', count(*) FROM public.results WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'report_cards', count(*) FROM public.report_cards WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'fees', count(*) FROM public.fees WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'payment_transactions', count(*) FROM public.payment_transactions WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'assignments', count(*) FROM public.assignments WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'assignment_submissions', count(*) FROM public.assignment_submissions WHERE academic_session_id IS NULL
-- UNION ALL SELECT 'attendance', count(*) FROM public.attendance WHERE academic_session_id IS NULL;
