-- Regression test: tenant views must not expose anon access or elevated grants.
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

CREATE TABLE public.view_privilege_hardening_fixture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payload text
);
CREATE VIEW public.view_privilege_hardening_fixture_view AS
  SELECT organization_id, payload FROM public.view_privilege_hardening_fixture;
GRANT ALL PRIVILEGES ON TABLE public.view_privilege_hardening_fixture TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.view_privilege_hardening_fixture_view TO anon, authenticated;

\i supabase/migrations/20261022111500_revoke_excess_view_privileges.sql

DO $assertions$
BEGIN
  IF has_table_privilege('anon', 'public.view_privilege_hardening_fixture', 'SELECT')
     OR has_table_privilege('anon', 'public.view_privilege_hardening_fixture_view', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: anon retains access to tenant-scoped table or view';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.view_privilege_hardening_fixture', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.view_privilege_hardening_fixture_view', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: authenticated lost expected table/view read access';
  END IF;

  IF has_table_privilege('authenticated', 'public.view_privilege_hardening_fixture_view', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.view_privilege_hardening_fixture_view', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.view_privilege_hardening_fixture_view', 'TRIGGER') THEN
    RAISE EXCEPTION 'FAIL: authenticated retains unnecessary elevated privileges on a view';
  END IF;
END
$assertions$;

DROP VIEW public.view_privilege_hardening_fixture_view;
DROP TABLE public.view_privilege_hardening_fixture;
