-- Regression test for BA Labs fungal culture formats.
\set ON_ERROR_STOP on
CREATE TABLE public.culture_types (
  code text PRIMARY KEY,
  label text NOT NULL,
  parent_code text REFERENCES public.culture_types(code)
);
INSERT INTO public.culture_types (code, label) VALUES ('solid', 'Solid');

\i supabase/migrations/20261023012000_add_mycology_culture_formats.sql

DO $assertions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.culture_types WHERE code='grain_spawn' AND parent_code='solid') THEN
    RAISE EXCEPTION 'FAIL: grain spawn format is missing or not classified as a solid culture';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.culture_types WHERE code='substrate' AND parent_code='solid') THEN
    RAISE EXCEPTION 'FAIL: substrate format is missing or not classified as a solid culture';
  END IF;
END
$assertions$;

DROP TABLE public.culture_types;
