-- Regression test: culture creation/reference views are read-only for clients.
\set ON_ERROR_STOP on
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE TABLE public.reference_view_write_fixture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payload text
);
CREATE VIEW public.v_culture_creation_options AS
  SELECT organization_id, payload FROM public.reference_view_write_fixture;
CREATE VIEW public.v_culture_creation_reference AS
  SELECT organization_id, payload FROM public.reference_view_write_fixture;
GRANT ALL PRIVILEGES ON TABLE public.v_culture_creation_options TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.v_culture_creation_reference TO anon, authenticated;

\i supabase/migrations/20261022004559_make_culture_reference_views_read_only.sql

DO $assertions$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['v_culture_creation_options','v_culture_creation_reference'] LOOP
    IF has_table_privilege('anon', format('public.%I', v_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', v_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', v_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', v_name), 'DELETE') THEN
      RAISE EXCEPTION 'FAIL: anon retains access to %', v_name;
    END IF;
    IF NOT has_table_privilege('authenticated', format('public.%I', v_name), 'SELECT') THEN
      RAISE EXCEPTION 'FAIL: authenticated lost SELECT on %', v_name;
    END IF;
    IF has_table_privilege('authenticated', format('public.%I', v_name), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', v_name), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', v_name), 'DELETE') THEN
      RAISE EXCEPTION 'FAIL: authenticated retains write privilege on %', v_name;
    END IF;
  END LOOP;
END
$assertions$;

DROP VIEW public.v_culture_creation_reference;
DROP VIEW public.v_culture_creation_options;
DROP TABLE public.reference_view_write_fixture;
