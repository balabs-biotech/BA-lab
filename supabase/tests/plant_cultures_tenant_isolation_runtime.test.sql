-- Behavioral tenant-isolation regression test for plant/greenhouse records.
-- Runs only after full migration replay in disposable CI PostgreSQL. Never run against production.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id)
VALUES ('20000000-0000-0000-0000-000000000011')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, code, name)
VALUES
  ('10000000-0000-0000-0000-000000000011', 'ci-plant-tenant-a', 'CI Plant Tenant A'),
  ('10000000-0000-0000-0000-000000000012', 'ci-plant-tenant-b', 'CI Plant Tenant B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id)
VALUES ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011')
ON CONFLICT DO NOTHING;

INSERT INTO public.plant_cultures (organization_id, code, crop_type, species_name, cultivar_name, quantity, status)
VALUES
  ('10000000-0000-0000-0000-000000000011', 'CI-PLANT-A-001', 'tomato', 'Solanum lycopersicum', 'Marmande', 2, 'active'),
  ('10000000-0000-0000-0000-000000000012', 'CI-PLANT-B-001', 'tomato', 'Solanum lycopersicum', 'Yellow Pear', 3, 'active')
ON CONFLICT (organization_id, code) DO NOTHING;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000011', true);
-- CI's bare PostgreSQL replay may not install Supabase API grants.
-- Grant operations inside this disposable transaction to isolate RLS behavior.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_cultures TO authenticated;
SET LOCAL ROLE authenticated;

DO $assertions$
DECLARE
  visible_count integer;
  affected_count integer;
BEGIN
  SELECT count(*) INTO visible_count
  FROM public.plant_cultures
  WHERE code IN ('CI-PLANT-A-001', 'CI-PLANT-B-001');

  IF visible_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.plant_cultures
    WHERE organization_id = '10000000-0000-0000-0000-000000000011'
      AND code = 'CI-PLANT-A-001'
  ) THEN
    RAISE EXCEPTION 'FAIL: member cannot see exactly their own tenant plant culture';
  END IF;

  UPDATE public.plant_cultures SET notes = 'unauthorized modification'
  WHERE organization_id = '10000000-0000-0000-0000-000000000012'
    AND code = 'CI-PLANT-B-001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cross-tenant plant_cultures UPDATE affected % rows', affected_count;
  END IF;

  DELETE FROM public.plant_cultures
  WHERE organization_id = '10000000-0000-0000-0000-000000000012'
    AND code = 'CI-PLANT-B-001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cross-tenant plant_cultures DELETE affected % rows', affected_count;
  END IF;

  UPDATE public.plant_cultures SET notes = 'authorized modification'
  WHERE organization_id = '10000000-0000-0000-0000-000000000011'
    AND code = 'CI-PLANT-A-001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: same-tenant plant_cultures UPDATE should affect exactly one row, got %', affected_count;
  END IF;
END
$assertions$;

RESET ROLE;
ROLLBACK;

SELECT 'PASS: behavioral plant_cultures tenant isolation (SELECT/UPDATE/DELETE)' AS test_result;
