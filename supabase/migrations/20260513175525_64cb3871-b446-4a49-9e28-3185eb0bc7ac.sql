ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS scoring_scheme text NOT NULL DEFAULT 'weighted_ca_exam'
    CHECK (scoring_scheme IN ('weighted_ca_exam','running_average','display_only')),
  ADD COLUMN IF NOT EXISTS cumulative_method text NOT NULL DEFAULT 'average_of_terms'
    CHECK (cumulative_method IN ('average_of_terms','sum_of_terms'));
