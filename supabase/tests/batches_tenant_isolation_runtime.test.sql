-- Behavioral tenant-isolation regression test for the real batches policies.
-- Runs only after full migration replay in disposable CI PostgreSQL. Never run against production.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (id)
VALUES ('20000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, code, name)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'ci-tenant-a', 'CI Tenant A'),
  ('10000000-0000-0000-0000-000000000002', 'ci-tenant-b', 'CI Tenant B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id)
VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.batches (organization_id, batch_code, name, batch_type)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'CI-A-001', 'Tenant A fixture', 'security-test'),
  ('10000000-0000-0000-0000-000000000002', 'CI-B-001', 'Tenant B fixture', 'security-test')
ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
-- CI's bare PostgreSQL replay does not install Supabase's normal API grants.
-- Grant table operations in this disposable test transaction so assertions isolate RLS behavior.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batches TO authenticated;
SET LOCAL ROLE authenticated;

DO $assertions$
DECLARE
  visible_count integer;
  affected_count integer;
  blocked boolean := false;
BEGIN
  SELECT count(*) INTO visible_count
  FROM public.batches
  WHERE batch_code IN ('CI-A-001', 'CI-B-001');

  IF visible_count <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.batches
    WHERE organization_id = '10000000-0000-0000-0000-000000000001'
      AND batch_code = 'CI-A-001'
  ) THEN
    RAISE EXCEPTION 'FAIL: member cannot see exactly their own tenant batch';
  END IF;

  UPDATE public.batches SET name = 'unauthorized modification'
  WHERE organization_id = '10000000-0000-0000-0000-000000000002'
    AND batch_code = 'CI-B-001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cross-tenant batch UPDATE affected % rows', affected_count;
  END IF;

  DELETE FROM public.batches
  WHERE organization_id = '10000000-0000-0000-0000-000000000002'
    AND batch_code = 'CI-B-001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: cross-tenant batch DELETE affected % rows', affected_count;
  END IF;

  BEGIN
    INSERT INTO public.batches (organization_id, batch_code, name, batch_type)
    VALUES ('10000000-0000-0000-0000-000000000002', 'CI-CROSS-ORG', 'Must be blocked', 'security-test');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;

  IF NOT blocked THEN
    RAISE EXCEPTION 'FAIL: cross-tenant batch INSERT was not rejected by RLS';
  END IF;

  INSERT INTO public.batches (organization_id, batch_code, name, batch_type)
  VALUES ('10000000-0000-0000-0000-000000000001', 'CI-A-002', 'Authorized fixture', 'security-test');

  IF NOT EXISTS (
    SELECT 1 FROM public.batches
    WHERE organization_id = '10000000-0000-0000-0000-000000000001'
      AND batch_code = 'CI-A-002'
  ) THEN
    RAISE EXCEPTION 'FAIL: valid same-tenant batch INSERT did not persist';
  END IF;
END
$assertions$;

RESET ROLE;
ROLLBACK;

SELECT 'PASS: behavioral batches tenant isolation (SELECT/INSERT/UPDATE/DELETE)' AS test_result;
