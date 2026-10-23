-- Add BA Labs-relevant fungal culture formats missing from the generic catalogue.
-- These are culture formats, not biological lifecycle operations.
INSERT INTO public.culture_types (code, label, parent_code)
VALUES
  ('grain_spawn', 'Grain spawn', 'solid'),
  ('substrate', 'Fruiting substrate', 'solid')
ON CONFLICT (code) DO NOTHING;
