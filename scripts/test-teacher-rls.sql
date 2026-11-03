-- End-to-end RLS test for class-teacher restrictions.
-- Run with:   psql -f scripts/test-teacher-rls.sql
-- The test runs in a transaction and ROLLs BACK at the end so no data is kept.

\set ON_ERROR_STOP on
\set QUIET on
SET client_min_messages = warning;

BEGIN;

-- Synthetic user ids representing two teachers and one admin.
-- We never insert into auth.users (managed schema). Instead we spoof
-- request.jwt.claims so that auth.uid() returns these ids inside RLS.
DO $$
DECLARE
  teacher_a_user uuid := '11111111-1111-1111-1111-111111111111';
  teacher_b_user uuid := '22222222-2222-2222-2222-222222222222';
  admin_user     uuid := '33333333-3333-3333-3333-333333333333';
  staff_a_id     uuid;
  staff_b_id     uuid;
  class_a_id     uuid;
  class_b_id     uuid;
  exam_a_id      uuid;
  exam_b_id      uuid;
  term_id        uuid;
  subj_id        uuid;
  student_unassigned uuid;
  student_in_a   uuid;
  question_a_id  uuid;
  passed integer := 0;
  failed integer := 0;
  err_msg text;
BEGIN
  -- Seed roles
  INSERT INTO public.user_roles (user_id, role) VALUES
    (teacher_a_user, 'teacher'),
    (teacher_b_user, 'teacher'),
    (admin_user, 'admin');

  -- Seed staff linked to teacher users
  INSERT INTO public.staff (full_name, staff_no, position, user_id)
  VALUES ('Teacher A', 'T-A-RLS', 'Teacher', teacher_a_user)
  RETURNING id INTO staff_a_id;

  INSERT INTO public.staff (full_name, staff_no, position, user_id)
  VALUES ('Teacher B', 'T-B-RLS', 'Teacher', teacher_b_user)
  RETURNING id INTO staff_b_id;

  -- Seed classes with class_teacher_id assignments
  INSERT INTO public.classes (name, level, class_teacher_id)
  VALUES ('RLS Class A', 'jss1', staff_a_id) RETURNING id INTO class_a_id;

  INSERT INTO public.classes (name, level, class_teacher_id)
  VALUES ('RLS Class B', 'jss1', staff_b_id) RETURNING id INTO class_b_id;

  -- Pick any term + subject (or create minimal fixtures)
  SELECT id INTO term_id FROM public.terms LIMIT 1;
  IF term_id IS NULL THEN
    RAISE EXCEPTION 'No term in DB; create one before running this test.';
  END IF;

  INSERT INTO public.subjects (name, code) VALUES ('RLS Subject', 'RLS-X')
  RETURNING id INTO subj_id;

  -- Seed exams, one per class
  INSERT INTO public.exams (title, type, class_id, subject_id, term_id, max_score)
  VALUES ('Exam A', 'cbt', class_a_id, subj_id, term_id, 100)
  RETURNING id INTO exam_a_id;

  INSERT INTO public.exams (title, type, class_id, subject_id, term_id, max_score)
  VALUES ('Exam B', 'cbt', class_b_id, subj_id, term_id, 100)
  RETURNING id INTO exam_b_id;

  -- Seed students
  INSERT INTO public.students (full_name, admission_no, class_id)
  VALUES ('RLS Unassigned', 'RLS-U-1', NULL) RETURNING id INTO student_unassigned;

  INSERT INTO public.students (full_name, admission_no, class_id)
  VALUES ('RLS In Class A', 'RLS-A-1', class_a_id) RETURNING id INTO student_in_a;

  -- Switch into Teacher A's identity
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', teacher_a_user, 'role', 'authenticated')::text,
    true
  );

  -------------------------------------------------------------------
  -- TEST 1: Teacher A CAN insert a question for their own exam
  -------------------------------------------------------------------
  BEGIN
    INSERT INTO public.questions (exam_id, question_text, correct_answer, marks)
    VALUES (exam_a_id, 'Own question', 'A', 1)
    RETURNING id INTO question_a_id;
    passed := passed + 1;
    RAISE NOTICE 'PASS: Teacher A inserted question into own exam';
  EXCEPTION WHEN OTHERS THEN
    failed := failed + 1;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    RAISE NOTICE 'FAIL: Teacher A could NOT insert into own exam: %', err_msg;
  END;

  -------------------------------------------------------------------
  -- TEST 2: Teacher A CANNOT insert a question for Teacher B's exam
  -------------------------------------------------------------------
  BEGIN
    INSERT INTO public.questions (exam_id, question_text, correct_answer, marks)
    VALUES (exam_b_id, 'Cross-class question', 'A', 1);
    failed := failed + 1;
    RAISE NOTICE 'FAIL: Teacher A inserted into other class exam (should have been blocked)';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    passed := passed + 1;
    RAISE NOTICE 'PASS: Teacher A blocked from inserting into Teacher B''s exam';
  END;

  -------------------------------------------------------------------
  -- TEST 3: Teacher A CAN edit their own question
  -------------------------------------------------------------------
  BEGIN
    UPDATE public.questions SET question_text = 'Edited' WHERE id = question_a_id;
    IF FOUND THEN
      passed := passed + 1;
      RAISE NOTICE 'PASS: Teacher A updated own question';
    ELSE
      failed := failed + 1;
      RAISE NOTICE 'FAIL: Teacher A update returned 0 rows';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failed := failed + 1;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    RAISE NOTICE 'FAIL: Teacher A could NOT update own question: %', err_msg;
  END;

  -------------------------------------------------------------------
  -- TEST 4: Teacher A CAN add an unassigned student to their class
  -------------------------------------------------------------------
  BEGIN
    UPDATE public.students SET class_id = class_a_id WHERE id = student_unassigned;
    IF FOUND THEN
      passed := passed + 1;
      RAISE NOTICE 'PASS: Teacher A added unassigned student to own class';
    ELSE
      failed := failed + 1;
      RAISE NOTICE 'FAIL: Teacher A add-to-roster returned 0 rows';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failed := failed + 1;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    RAISE NOTICE 'FAIL: Teacher A could NOT add to own roster: %', err_msg;
  END;

  -------------------------------------------------------------------
  -- TEST 5: Teacher A CAN remove a student from their own class
  -------------------------------------------------------------------
  BEGIN
    UPDATE public.students SET class_id = NULL WHERE id = student_in_a;
    IF FOUND THEN
      passed := passed + 1;
      RAISE NOTICE 'PASS: Teacher A removed student from own class';
    ELSE
      failed := failed + 1;
      RAISE NOTICE 'FAIL: Teacher A remove-from-roster returned 0 rows';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    failed := failed + 1;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
    RAISE NOTICE 'FAIL: Teacher A could NOT remove from own roster: %', err_msg;
  END;

  -- Re-seed a student into class B for the next test (using elevated role)
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO public.students (full_name, admission_no, class_id)
  VALUES ('RLS In Class B', 'RLS-B-1', class_b_id);
  -- Switch back to Teacher A
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', teacher_a_user, 'role', 'authenticated')::text,
    true
  );

  -------------------------------------------------------------------
  -- TEST 6: Teacher A CANNOT move a student INTO Teacher B's class
  -------------------------------------------------------------------
  BEGIN
    UPDATE public.students SET class_id = class_b_id
    WHERE admission_no = 'RLS-U-1';
    -- RLS WITH CHECK should reject this update
    IF FOUND THEN
      failed := failed + 1;
      RAISE NOTICE 'FAIL: Teacher A moved student to other class (should have been blocked)';
    ELSE
      passed := passed + 1;
      RAISE NOTICE 'PASS: Teacher A blocked from moving student into Teacher B''s class (no rows updated)';
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    passed := passed + 1;
    RAISE NOTICE 'PASS: Teacher A blocked from cross-class roster move (policy violation)';
  END;

  -------------------------------------------------------------------
  -- TEST 7: Teacher A CANNOT update a student already in Teacher B's class
  -------------------------------------------------------------------
  BEGIN
    UPDATE public.students SET full_name = 'hacked'
    WHERE admission_no = 'RLS-B-1';
    IF FOUND THEN
      failed := failed + 1;
      RAISE NOTICE 'FAIL: Teacher A edited student in other class';
    ELSE
      passed := passed + 1;
      RAISE NOTICE 'PASS: Teacher A blocked from editing student in Teacher B''s class';
    END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    passed := passed + 1;
    RAISE NOTICE 'PASS: Teacher A blocked from editing student in other class (policy violation)';
  END;

  RAISE NOTICE '---';
  RAISE NOTICE 'TOTAL: % passed, % failed', passed, failed;
  IF failed > 0 THEN
    RAISE EXCEPTION '% test(s) failed', failed;
  END IF;
END
$$;

ROLLBACK;
