
UPDATE public.questions SET media = jsonb_build_array(jsonb_build_object('bucket','question-media','path','y5-orchid/mathematics/q6-equal-sides-solid.png','url','y5-orchid/mathematics/q6-equal-sides-solid.png','type','image','caption','Solid with all sides equal in length'))
WHERE id IN ('4ccd55a4-d39b-409f-895e-0f3c88ad331c','3755d439-33ae-40d7-b66a-d15fad299bf2');

UPDATE public.questions SET media = jsonb_build_array(jsonb_build_object('bucket','question-media','path','y5-orchid/mathematics/q26-pq-rs-crossing.png','url','y5-orchid/mathematics/q26-pq-rs-crossing.png','type','image','caption','Lines PQ and RS crossing at O with angle SOQ = 52°'))
WHERE id IN ('077993f6-c3a3-47fa-8d5b-ffb24c275089','60a8e635-8bac-4e46-ba5a-baf1c85c7b3a');

UPDATE public.questions SET media = jsonb_build_array(jsonb_build_object('bucket','question-media','path','y5-orchid/mathematics/q32-smith-family-pie-chart.png','url','y5-orchid/mathematics/q32-smith-family-pie-chart.png','type','image','caption','Pie chart of Smith family expenditure'))
WHERE id IN ('6e797af3-6556-4ace-9b32-26c2e003bf1d','05ca2e14-975e-4d29-9235-16ccbc2d6a28');

UPDATE public.questions SET media = jsonb_build_array(jsonb_build_object('bucket','question-media','path','y5-orchid/mathematics/theory-q5-abc-cbd-angles.png','url','y5-orchid/mathematics/theory-q5-abc-cbd-angles.png','type','image','caption','Angles ABC and CBD on straight line AD'))
WHERE id IN ('94b9a99c-b61f-40d8-927f-9b353cd493da','f32a6e91-2eff-472e-a31b-3424844f0e51');
