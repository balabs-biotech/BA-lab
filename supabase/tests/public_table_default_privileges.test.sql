-- Regression test for future public-table default privileges.
\set ON_ERROR_STOP on

DO $default_acl$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
      AND d.defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND d.defaclobjtype = 'r'
      AND a.grantee IN (
        SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
      )
  ) THEN
    RAISE EXCEPTION 'FAIL: postgres public-table defaults still grant privileges to API roles';
  END IF;
END
$default_acl$;

CREATE TABLE public.__default_privileges_probe (id bigint PRIMARY KEY);

DO $future_table$
BEGIN
  IF has_table_privilege('anon', 'public.__default_privileges_probe', 'SELECT')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'INSERT')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'UPDATE')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'DELETE')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'REFERENCES')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'TRIGGER')
     OR has_table_privilege('anon', 'public.__default_privileges_probe', 'MAINTAIN') THEN
    RAISE EXCEPTION 'FAIL: a future public table is exposed to anon';
  END IF;

  IF has_table_privilege('authenticated', 'public.__default_privileges_probe', 'SELECT')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'INSERT')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'DELETE')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'REFERENCES')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'TRIGGER')
     OR has_table_privilege('authenticated', 'public.__default_privileges_probe', 'MAINTAIN') THEN
    RAISE EXCEPTION 'FAIL: a future public table is exposed to authenticated by default';
  END IF;
END
$future_table$;

DROP TABLE public.__default_privileges_probe;
