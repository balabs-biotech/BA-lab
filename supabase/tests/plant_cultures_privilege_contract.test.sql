-- Regression test: plant_cultures must not inherit broad client grants.
-- RLS does not protect TRUNCATE, so client roles must not hold that privilege.
\set ON_ERROR_STOP on

DO $precondition$
BEGIN
  IF to_regclass('public.plant_cultures') IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.plant_cultures is missing';
  END IF;
END
$precondition$;

-- Reproduce the broad default grants present on Supabase-created public tables.
GRANT ALL PRIVILEGES ON TABLE public.plant_cultures TO anon, authenticated;

-- Re-run the corrective migration against the deliberately over-granted table.
\i supabase/migrations/20261101180000_harden_plant_cultures_client_access.sql

DO $assertions$
BEGIN
  IF has_table_privilege('anon', 'public.plant_cultures', 'SELECT')
     OR has_table_privilege('anon', 'public.plant_cultures', 'INSERT')
     OR has_table_privilege('anon', 'public.plant_cultures', 'UPDATE')
     OR has_table_privilege('anon', 'public.plant_cultures', 'DELETE')
     OR has_table_privilege('anon', 'public.plant_cultures', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.plant_cultures', 'REFERENCES')
     OR has_table_privilege('anon', 'public.plant_cultures', 'TRIGGER')
     OR has_table_privilege('anon', 'public.plant_cultures', 'MAINTAIN') THEN
    RAISE EXCEPTION 'FAIL: anon retains a privilege on plant_cultures';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.plant_cultures', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.plant_cultures', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.plant_cultures', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.plant_cultures', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lost expected CRUD privileges on plant_cultures';
  END IF;

  IF has_table_privilege('authenticated', 'public.plant_cultures', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.plant_cultures', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.plant_cultures', 'TRIGGER')
     OR has_table_privilege('authenticated', 'public.plant_cultures', 'MAINTAIN') THEN
    RAISE EXCEPTION 'FAIL: authenticated retains unnecessary elevated privileges on plant_cultures';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plant_cultures'
      AND policyname = 'plant_cultures_insert'
      AND with_check LIKE '%private.is_org_writer(organization_id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plant_cultures'
      AND policyname = 'plant_cultures_update'
      AND qual LIKE '%private.is_org_writer(organization_id)%'
      AND with_check LIKE '%private.is_org_writer(organization_id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plant_cultures'
      AND policyname = 'plant_cultures_delete'
      AND qual LIKE '%private.is_org_writer(organization_id)%'
  ) THEN
    RAISE EXCEPTION 'FAIL: plant_cultures write policies do not enforce writer role';
  END IF;
END
$assertions$;
