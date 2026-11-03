-- Add 'exam' to ca_type enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'ca_type'::regtype
      AND enumlabel = 'exam'
  ) THEN
    ALTER TYPE ca_type ADD VALUE 'exam';
  END IF;
END $$;
