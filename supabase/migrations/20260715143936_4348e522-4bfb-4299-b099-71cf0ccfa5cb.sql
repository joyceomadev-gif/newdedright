
-- ============================================================
-- copy_exam_questions: copy an exam's questions to destination class(es)
-- ============================================================
CREATE OR REPLACE FUNCTION public.copy_exam_questions(
  _source_exam_id uuid,
  _dest_class_ids uuid[],
  _mode text DEFAULT 'new',              -- 'new' | 'append' | 'replace'
  _options jsonb DEFAULT '{}'::jsonb,
  _dest_term_id uuid DEFAULT NULL,
  _dest_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  src public.exams%ROWTYPE;
  src_subject_name text;
  dest_class_id uuid;
  dest_subject_id uuid;
  dest_exam_id uuid;
  dest_exam_new boolean;
  results jsonb := '[]'::jsonb;
  per jsonb;
  total_copied int := 0;
  total_exams  int := 0;
  q RECORD;
  pos int;
  ins_count int;
  include_answers    boolean := COALESCE((_options->>'include_answers')::boolean, true);
  include_instructions boolean := COALESCE((_options->>'include_instructions')::boolean, true);
  include_media      boolean := COALESCE((_options->>'include_media')::boolean, true);
  include_marks      boolean := COALESCE((_options->>'include_marks')::boolean, true);
  include_order      boolean := COALESCE((_options->>'include_order')::boolean, true);
  randomize          boolean := COALESCE((_options->>'randomize')::boolean, false);
  filter_types       text[]  := CASE WHEN _options ? 'types'
                                     THEN ARRAY(SELECT jsonb_array_elements_text(_options->'types'))
                                     ELSE NULL END;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO src FROM public.exams WHERE id = _source_exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source exam not found'; END IF;

  -- Permission: admin, or teaches the source class/subject
  IF NOT (public.is_admin(uid)
          OR public.teaches_class(uid, src.class_id)
          OR public.teaches_class_subject(uid, src.class_id, src.subject_id)) THEN
    RAISE EXCEPTION 'You do not have permission to copy this exam';
  END IF;

  SELECT name INTO src_subject_name FROM public.subjects WHERE id = src.subject_id;
  IF _mode NOT IN ('new','append','replace') THEN
    RAISE EXCEPTION 'Invalid mode: %', _mode;
  END IF;

  FOREACH dest_class_id IN ARRAY _dest_class_ids LOOP
    per := jsonb_build_object('class_id', dest_class_id);

    IF dest_class_id = src.class_id THEN
      per := per || jsonb_build_object('status','skipped','reason','same as source class');
      results := results || per;
      CONTINUE;
    END IF;

    -- Resolve destination subject by matching name in the destination class
    SELECT id INTO dest_subject_id
      FROM public.subjects
     WHERE class_id = dest_class_id AND lower(name) = lower(src_subject_name)
     LIMIT 1;
    IF dest_subject_id IS NULL THEN
      per := per || jsonb_build_object('status','failed','reason', 'No matching subject "' || src_subject_name || '" in destination class');
      results := results || per;
      CONTINUE;
    END IF;

    -- Resolve or create destination exam
    dest_exam_id := NULL;
    dest_exam_new := false;
    IF _mode IN ('append','replace') THEN
      SELECT id INTO dest_exam_id FROM public.exams
       WHERE class_id = dest_class_id
         AND subject_id = dest_subject_id
         AND COALESCE(term_id, src.term_id) = COALESCE(_dest_term_id, src.term_id)
         AND type = src.type
         AND COALESCE(purpose,'exam') = COALESCE(src.purpose,'exam')
       ORDER BY created_at DESC LIMIT 1;
      IF dest_exam_id IS NOT NULL AND public.exam_has_attempts(dest_exam_id) THEN
        per := per || jsonb_build_object('status','failed','reason','Destination exam is locked (students have started it)');
        results := results || per;
        CONTINUE;
      END IF;
      IF _mode = 'replace' AND dest_exam_id IS NOT NULL THEN
        DELETE FROM public.questions WHERE exam_id = dest_exam_id;
      END IF;
    END IF;

    IF dest_exam_id IS NULL THEN
      INSERT INTO public.exams (
        title, subject_id, class_id, term_id, session_id, exam_date,
        duration_minutes, max_score, type, purpose, question_source,
        num_questions, instructions, randomize_questions, randomize_options,
        pass_mark, created_by, published, status
      ) VALUES (
        src.title || ' (Copy)',
        dest_subject_id, dest_class_id,
        COALESCE(_dest_term_id, src.term_id),
        COALESCE(_dest_session_id, src.session_id),
        src.exam_date, src.duration_minutes, src.max_score, src.type,
        src.purpose, src.question_source, src.num_questions,
        CASE WHEN include_instructions THEN src.instructions ELSE NULL END,
        CASE WHEN randomize THEN true ELSE src.randomize_questions END,
        src.randomize_options, src.pass_mark, uid, false, 'draft'::public.exam_status
      ) RETURNING id INTO dest_exam_id;
      dest_exam_new := true;
    END IF;

    -- Determine starting position for appended questions
    SELECT COALESCE(MAX(position),0) INTO pos FROM public.questions WHERE exam_id = dest_exam_id;
    ins_count := 0;

    FOR q IN
      SELECT * FROM public.questions
       WHERE exam_id = _source_exam_id
         AND (filter_types IS NULL OR question_type = ANY(filter_types))
       ORDER BY CASE WHEN randomize THEN random() END,
                section_order NULLS LAST, question_number NULLS LAST, position NULLS LAST
    LOOP
      pos := pos + 1;
      INSERT INTO public.questions (
        exam_id, question_text, options, correct_answer, marks, position,
        question_type, section_label, section_instruction, section_order,
        question_number, media, content_json
      ) VALUES (
        dest_exam_id, q.question_text, q.options,
        CASE WHEN include_answers THEN q.correct_answer ELSE NULL END,
        CASE WHEN include_marks THEN q.marks ELSE 1 END,
        CASE WHEN include_order AND NOT randomize THEN COALESCE(q.position, pos) ELSE pos END,
        q.question_type, q.section_label,
        CASE WHEN include_instructions THEN q.section_instruction ELSE NULL END,
        CASE WHEN include_order AND NOT randomize THEN q.section_order ELSE NULL END,
        CASE WHEN include_order AND NOT randomize THEN q.question_number ELSE NULL END,
        CASE WHEN include_media THEN q.media ELSE '[]'::jsonb END,
        q.content_json
      );
      ins_count := ins_count + 1;
    END LOOP;

    total_copied := total_copied + ins_count;
    total_exams  := total_exams + 1;
    per := per || jsonb_build_object(
      'status','success','dest_exam_id',dest_exam_id,
      'created', dest_exam_new, 'questions_copied', ins_count
    );
    results := results || per;

    -- Audit
    INSERT INTO public.exam_audit_log (actor_user_id, action, entity_type, entity_id, meta)
    VALUES (uid, 'questions_copied', 'exam', dest_exam_id, jsonb_build_object(
      'source_exam_id', _source_exam_id,
      'source_class_id', src.class_id,
      'dest_class_id', dest_class_id,
      'mode', _mode,
      'questions_copied', ins_count,
      'options', _options
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'exams_created_or_updated', total_exams,
    'total_questions_copied', total_copied,
    'results', results
  );
END $$;

REVOKE ALL ON FUNCTION public.copy_exam_questions(uuid, uuid[], text, jsonb, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_exam_questions(uuid, uuid[], text, jsonb, uuid, uuid) TO authenticated;

-- ============================================================
-- save_exam_to_bank: save exam questions into the Question Bank
-- ============================================================
CREATE OR REPLACE FUNCTION public.save_exam_to_bank(
  _exam_id uuid,
  _question_ids uuid[] DEFAULT NULL,       -- NULL = all
  _metadata jsonb DEFAULT '{}'::jsonb,
  _dup_mode text DEFAULT 'skip'            -- 'skip' | 'replace' | 'new_version'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  e public.exams%ROWTYPE;
  q RECORD;
  existing_id uuid;
  added int := 0;
  skipped int := 0;
  updated int := 0;
  versions int := 0;
  errors jsonb := '[]'::jsonb;
  norm text;
  meta_topic text := NULLIF(_metadata->>'topic','');
  meta_subtopic text := NULLIF(_metadata->>'sub_topic','');
  meta_diff text := COALESCE(NULLIF(_metadata->>'difficulty',''),'medium');
  meta_tags text[] := CASE WHEN _metadata ? 'tags'
                           THEN ARRAY(SELECT jsonb_array_elements_text(_metadata->'tags'))
                           ELSE ARRAY[]::text[] END;
  meta_keywords text[] := CASE WHEN _metadata ? 'keywords'
                               THEN ARRAY(SELECT jsonb_array_elements_text(_metadata->'keywords'))
                               ELSE ARRAY[]::text[] END;
  merged_tags text[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO e FROM public.exams WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam not found'; END IF;

  IF NOT (public.is_admin(uid)
          OR public.teaches_class(uid, e.class_id)
          OR public.teaches_class_subject(uid, e.class_id, e.subject_id)) THEN
    RAISE EXCEPTION 'You do not have permission to save these questions';
  END IF;
  IF _dup_mode NOT IN ('skip','replace','new_version') THEN
    RAISE EXCEPTION 'Invalid duplicate mode: %', _dup_mode;
  END IF;

  merged_tags := ARRAY(SELECT DISTINCT t FROM unnest(meta_tags || meta_keywords) AS t WHERE t IS NOT NULL AND t <> '');

  FOR q IN
    SELECT * FROM public.questions
     WHERE exam_id = _exam_id
       AND (_question_ids IS NULL OR id = ANY(_question_ids))
     ORDER BY section_order NULLS LAST, question_number NULLS LAST, position NULLS LAST
  LOOP
    BEGIN
      norm := lower(regexp_replace(COALESCE(q.question_text,''), '\s+', ' ', 'g'));
      IF length(trim(norm)) = 0 THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      SELECT id INTO existing_id FROM public.question_bank
       WHERE class_id = e.class_id
         AND subject_id = e.subject_id
         AND COALESCE(purpose,'exam') = COALESCE(e.purpose,'exam')
         AND lower(regexp_replace(question_text, '\s+', ' ', 'g')) = norm
       ORDER BY updated_at DESC LIMIT 1;

      IF existing_id IS NOT NULL AND _dup_mode = 'skip' THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;

      IF existing_id IS NOT NULL AND _dup_mode = 'replace' THEN
        INSERT INTO public.question_bank_revisions (question_id, editor_user_id, snapshot)
        SELECT existing_id, uid, to_jsonb(qb.*) FROM public.question_bank qb WHERE id = existing_id;
        UPDATE public.question_bank SET
          question_text = q.question_text,
          options = q.options,
          correct_answer = q.correct_answer,
          marks = q.marks,
          question_type = q.question_type,
          media = COALESCE(q.media,'[]'::jsonb),
          section_label = q.section_label,
          section_instruction = q.section_instruction,
          section_order = q.section_order,
          question_number = q.question_number,
          topic = COALESCE(meta_topic, topic),
          sub_topic = COALESCE(meta_subtopic, sub_topic),
          difficulty = meta_diff::qb_difficulty,
          tags = ARRAY(SELECT DISTINCT t FROM unnest(tags || merged_tags) AS t),
          updated_by = uid,
          updated_at = now()
        WHERE id = existing_id;
        updated := updated + 1;
      ELSE
        -- new_version (duplicate exists) OR no duplicate: insert new row
        IF existing_id IS NOT NULL AND _dup_mode = 'new_version' THEN
          INSERT INTO public.question_bank_revisions (question_id, editor_user_id, snapshot)
          SELECT existing_id, uid, to_jsonb(qb.*) FROM public.question_bank qb WHERE id = existing_id;
          versions := versions + 1;
        END IF;
        INSERT INTO public.question_bank (
          class_id, subject_id, purpose, question_text, options, correct_answer,
          marks, question_type, media, section_label, section_instruction,
          section_order, question_number, topic, sub_topic, difficulty, tags,
          created_by, updated_by, term_id, session_id, status
        ) VALUES (
          e.class_id, e.subject_id, COALESCE(e.purpose,'exam'),
          q.question_text, q.options, q.correct_answer,
          q.marks, q.question_type, COALESCE(q.media,'[]'::jsonb),
          q.section_label, q.section_instruction, q.section_order, q.question_number,
          meta_topic, meta_subtopic, meta_diff::qb_difficulty, merged_tags,
          uid, uid, e.term_id, e.session_id, 'draft'::qb_status
        );
        added := added + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      errors := errors || jsonb_build_object('question_id', q.id, 'error', SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.exam_audit_log (actor_user_id, action, entity_type, entity_id, meta)
  VALUES (uid, 'saved_to_bank', 'exam', _exam_id, jsonb_build_object(
    'added', added, 'updated', updated, 'skipped', skipped,
    'new_versions', versions, 'dup_mode', _dup_mode, 'metadata', _metadata
  ));

  RETURN jsonb_build_object(
    'added', added, 'updated', updated, 'skipped', skipped,
    'new_versions', versions, 'errors', errors,
    'total_saved', added + updated
  );
END $$;

REVOKE ALL ON FUNCTION public.save_exam_to_bank(uuid, uuid[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_exam_to_bank(uuid, uuid[], jsonb, text) TO authenticated;
