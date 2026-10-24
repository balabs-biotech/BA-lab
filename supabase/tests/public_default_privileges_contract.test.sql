-- Run after the full migration replay against disposable CI PostgreSQL.
\set ON_ERROR_STOP on

DO $assertions$
DECLARE
  owner_name text;
  object_kind "char";
  acl aclitem[];
  owner_oid oid;
  anon_oid oid;
BEGIN
  SELECT oid INTO anon_oid FROM pg_roles WHERE rolname = 'anon';

  FOREACH owner_name IN ARRAY ARRAY['postgres', 'supabase_admin']
  LOOP
    SELECT oid INTO owner_oid FROM pg_roles WHERE rolname = owner_name;
    IF owner_oid IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH object_kind IN ARRAY ARRAY['r'::"char", 'S'::"char", 'f'::"char"]
    LOOP
      SELECT d.defaclacl INTO acl
      FROM pg_default_acl d
      WHERE d.defaclrole = owner_oid
        AND d.defaclnamespace = 'public'::regnamespace
        AND d.defaclobjtype = object_kind;

      IF acl IS NOT NULL AND EXISTS (
        SELECT 1
        FROM aclexplode(acl) grant_entry
        WHERE grant_entry.grantee IN (0, anon_oid)
      ) THEN
        RAISE EXCEPTION
          'FAIL: default privileges for role % and object type % still grant privileges to PUBLIC or anon',
          owner_name, object_kind;
      END IF;
    END LOOP;
  END LOOP;
END
$assertions$;
