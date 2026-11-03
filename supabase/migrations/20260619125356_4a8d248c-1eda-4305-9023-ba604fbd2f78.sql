INSERT INTO public.school_settings (id, scoring_scheme, cumulative_method, ca1_weight, ca2_weight, ca3_weight, exam_weight, promotion_min_average, grading_scale, school_name)
VALUES (
  1,
  'weighted_ca_exam',
  'average_of_terms',
  15, 15, 0, 70,
  50,
  '[{"grade":"A","min":70,"max":100,"remark":"Excellent"},{"grade":"B","min":60,"max":69,"remark":"Very Good"},{"grade":"C","min":50,"max":59,"remark":"Good"},{"grade":"D","min":45,"max":49,"remark":"Pass"},{"grade":"E","min":40,"max":44,"remark":"Weak Pass"},{"grade":"F","min":0,"max":39,"remark":"Fail"}]'::jsonb,
  'Moral Ville Academy'
)
ON CONFLICT (id) DO NOTHING;