-- Static policy contract for tenant-scoped operational tables.
-- Runs after the full migration replay against disposable CI PostgreSQL.
\set ON_ERROR_STOP on

DO $assertions$
DECLARE
  target_table text;
  policy_count integer;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['batches', 'cultures', 'measurements', 'plant_cultures']
  LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      RAISE EXCEPTION 'FAIL: required tenant table public.% is missing', target_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = target_table
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'FAIL: public.% must have RLS enabled and forced', target_table;
    END IF;

    SELECT count(*) INTO policy_count
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = target_table
      AND p.cmd IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
      AND (
        coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')
      ) ILIKE '%is_org_member%';

    IF policy_count < 4 THEN
      RAISE EXCEPTION
        'FAIL: public.% has only % CRUD policies tied to organization membership; expected at least 4',
        target_table, policy_count;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = target_table
        AND p.cmd IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        AND NOT (
          (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''))
          ILIKE '%is_org_member%'
        )
    ) THEN
      RAISE EXCEPTION
        'FAIL: public.% has a CRUD policy not visibly bound to organization membership',
        target_table;
    END IF;

    IF has_table_privilege('anon', format('public.%I', target_table), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', target_table), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', target_table), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', target_table), 'DELETE') THEN
      RAISE EXCEPTION 'FAIL: anon retains direct CRUD table privileges on public.%', target_table;
    END IF;
  END LOOP;
END
$assertions$;
