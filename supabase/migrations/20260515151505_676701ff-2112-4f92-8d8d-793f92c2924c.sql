
CREATE TABLE public.trait_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trait_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.trait_categories(id) ON DELETE CASCADE,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, label)
);

CREATE INDEX idx_trait_items_category ON public.trait_items(category_id, display_order);

ALTER TABLE public.trait_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trait_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view trait_categories" ON public.trait_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage trait_categories" ON public.trait_categories
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "All view trait_items" ON public.trait_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage trait_items" ON public.trait_items
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_trait_categories_updated_at
  BEFORE UPDATE ON public.trait_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_trait_items_updated_at
  BEFORE UPDATE ON public.trait_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed categories
INSERT INTO public.trait_categories (name, display_order) VALUES
  ('Conduct & Work Habit', 1),
  ('Handwriting', 2),
  ('Library', 3),
  ('Diction', 4),
  ('Enrichment Activities', 5),
  ('Home Performance Indices', 6),
  ('Swimming', 7);

-- Seed items
WITH cat AS (SELECT id, name FROM public.trait_categories)
INSERT INTO public.trait_items (category_id, label, display_order)
SELECT cat.id, item.label, item.ord
FROM cat
JOIN (VALUES
  ('Conduct & Work Habit', 'Respectful and cordial (peers and Adult)', 1),
  ('Conduct & Work Habit', 'Independence & Organized', 2),
  ('Conduct & Work Habit', 'Maintains appropriate behaviour without prompting', 3),
  ('Conduct & Work Habit', 'Exhibits eagerness & curiosity as a learner', 4),
  ('Conduct & Work Habit', 'Participate actively in class', 5),
  ('Conduct & Work Habit', 'Collaborates with other children for learning', 6),
  ('Conduct & Work Habit', 'Persevere at a challenging task', 7),
  ('Conduct & Work Habit', 'Daily work reflects best effort', 8),
  ('Conduct & Work Habit', 'Leadership skills', 9),
  ('Conduct & Work Habit', 'Public presentation skills', 10),

  ('Handwriting', 'Writes numerals and letters correctly', 1),
  ('Handwriting', 'Uses correct letter placement/spacing', 2),
  ('Handwriting', 'Prints neatly', 3),

  ('Library', 'Handles books properly', 1),
  ('Library', 'Return books in good order', 2),
  ('Library', 'Uses the facility without prompting', 3),
  ('Library', 'Adhere to rules', 4),

  ('Diction', 'Enunciation', 1),
  ('Diction', 'Pronunciation', 2),
  ('Diction', 'Public speaking', 3),
  ('Diction', 'Etiquette and poise', 4),

  ('Enrichment Activities', 'Computer', 1),
  ('Enrichment Activities', 'French', 2),
  ('Enrichment Activities', 'Arts & Craft', 3),
  ('Enrichment Activities', 'Taekwondo', 4),
  ('Enrichment Activities', 'Cookery', 5),
  ('Enrichment Activities', 'Ballet', 6),
  ('Enrichment Activities', 'Swimming', 7),
  ('Enrichment Activities', 'Chess', 8),
  ('Enrichment Activities', 'Music', 9),
  ('Enrichment Activities', 'Reading club', 10),

  ('Home Performance Indices', 'Punctuality', 1),
  ('Home Performance Indices', 'Neatness', 2),
  ('Home Performance Indices', 'PTC attendance', 3),
  ('Home Performance Indices', 'Quality of homework submitted', 4),
  ('Home Performance Indices', 'Prompt submission of homework', 5),

  ('Swimming', 'Pool safety awareness and use', 1),
  ('Swimming', 'Underwater breathing control', 2),
  ('Swimming', 'Floating', 3),
  ('Swimming', 'Kicking', 4),
  ('Swimming', 'Gliding, crawling and free style', 5),
  ('Swimming', 'Breast stroke', 6),
  ('Swimming', 'Back', 7)
) AS item(cat_name, label, ord) ON item.cat_name = cat.name;
