-- Regression test for future public-function default privileges.
\set ON_ERROR_STOP on

DO $default_acl$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
      AND d.defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND d.defaclobjtype = 'f'
      AND a.grantee IN (
        SELECT oid FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
      )
      AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: postgres public-function defaults still grant EXECUTE to API roles';
  END IF;
END
$default_acl$;

CREATE FUNCTION public.__default_function_privileges_probe()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 1 $$;

DO $future_function$
BEGIN
  IF has_function_privilege('anon', 'public.__default_function_privileges_probe()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: a future public function is executable by anon';
  END IF;

  IF has_function_privilege('authenticated', 'public.__default_function_privileges_probe()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: a future public function is executable by authenticated by default';
  END IF;
END
$future_function$;

DROP FUNCTION public.__default_function_privileges_probe();
