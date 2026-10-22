-- Regression test: anon has no SQL access to tenant-scoped tables; authenticated
-- retains ordinary CRUD, but neither client role has TRUNCATE/REFERENCES/TRIGGER.
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

CREATE TABLE IF NOT EXISTS public.privilege_hardening_fixture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payload text
);
GRANT ALL PRIVILEGES ON TABLE public.privilege_hardening_fixture TO anon, authenticated;

\i supabase/migrations/20261022110000_revoke_anon_tenant_table_privileges.sql

DO $assertions$
BEGIN
  IF has_table_privilege('anon', 'public.privilege_hardening_fixture', 'SELECT')
     OR has_table_privilege('anon', 'public.privilege_hardening_fixture', 'INSERT')
     OR has_table_privilege('anon', 'public.privilege_hardening_fixture', 'UPDATE')
     OR has_table_privilege('anon', 'public.privilege_hardening_fixture', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: anon retains CRUD access to an organization-scoped table';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lost expected CRUD privileges';
  END IF;

  IF has_table_privilege('anon', 'public.privilege_hardening_fixture', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.privilege_hardening_fixture', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'REFERENCES')
     OR has_table_privilege('anon', 'public.privilege_hardening_fixture', 'TRIGGER')
     OR has_table_privilege('authenticated', 'public.privilege_hardening_fixture', 'TRIGGER') THEN
    RAISE EXCEPTION 'FAIL: a client role retains an unnecessary elevated table privilege';
  END IF;
END
$assertions$;

DROP TABLE public.privilege_hardening_fixture;
