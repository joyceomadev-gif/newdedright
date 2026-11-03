-- 20260903120000_student_first_last_name.sql
-- Adds first_name / last_name to students (middle_name already exists).
-- Fully backward-compatible: any code that still inserts/updates only
-- `full_name` keeps working unchanged; first_name/last_name are kept in
-- sync automatically. New code can write first_name/last_name instead
-- and full_name will be derived automatically.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

-- Backfill from the existing full_name for all current rows.
-- Heuristic: first word = first_name, last word = last_name
-- (middle_name column is already separate and untouched here).
UPDATE public.students
SET
  first_name = split_part(trim(full_name), ' ', 1),
  last_name  = CASE
                 WHEN array_length(regexp_split_to_array(trim(full_name), '\s+'), 1) >= 2
                   THEN (regexp_split_to_array(trim(full_name), '\s+'))
                        [array_length(regexp_split_to_array(trim(full_name), '\s+'), 1)]
                 ELSE NULL
               END
WHERE first_name IS NULL
  AND full_name IS NOT NULL
  AND length(trim(full_name)) > 0;

-- Two-way sync trigger:
--  * If caller supplies first_name/last_name but not full_name -> build full_name.
--  * If caller supplies (only) full_name, as all existing app code does today
--    -> split it into first_name/last_name automatically.
-- This means BOTH the old insert shape ({ full_name }) and a future new
-- insert shape ({ first_name, last_name }) work without any app changes.
CREATE OR REPLACE FUNCTION public.sync_student_name_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parts text[];
BEGIN
  -- Caller gave first/last (new-style form) -> (re)build full_name from parts.
  IF (NEW.first_name IS NOT NULL AND length(trim(NEW.first_name)) > 0) THEN
    NEW.full_name := trim(
      NEW.first_name
      || CASE WHEN NEW.middle_name IS NOT NULL AND length(trim(NEW.middle_name)) > 0
              THEN ' ' || NEW.middle_name ELSE '' END
      || CASE WHEN NEW.last_name IS NOT NULL AND length(trim(NEW.last_name)) > 0
              THEN ' ' || NEW.last_name ELSE '' END
    );
  -- Caller gave only full_name (existing app behaviour today) -> derive parts.
  ELSIF NEW.full_name IS NOT NULL AND length(trim(NEW.full_name)) > 0 THEN
    parts := regexp_split_to_array(trim(NEW.full_name), '\s+');
    NEW.first_name := parts[1];
    IF array_length(parts, 1) >= 2 THEN
      NEW.last_name := parts[array_length(parts, 1)];
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_name_fields ON public.students;
CREATE TRIGGER trg_sync_student_name_fields
  BEFORE INSERT OR UPDATE OF first_name, last_name, middle_name, full_name
  ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_student_name_fields();

-- Not enforcing NOT NULL yet — review any rows where the split looks wrong
-- (compound names, single-word names) using the query in
-- 20260903120400_backfill_and_verification.sql before tightening this.
