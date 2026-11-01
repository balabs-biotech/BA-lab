-- Regression test: plant_cultures must not inherit broad client grants.
-- RLS does not protect TRUNCATE, so client roles must not hold that privilege.
\set ON_ERROR_STOP on

DO $assertions$
BEGIN
  IF to_regclass('public.plant_cultures') IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.plant_cultures is missing';
  END IF;

  IF has_table_privilege('anon', 'public.plant_cultures', 'SELECT')
     OR has_table_privilege('anon', 'public.plant_cultures', 'INSERT')
     OR has_table_privilege('anon', 'public.plant_cultures', 'UPDATE')
     OR has_table_privilege('anon', 'public.plant_cultures', 'DELETE')
     OR has_table_privilege('anon', 'public.plant_cultures', 'TRUNCATE')
     OR has_table_privilege('anon', 'public.plant_cultures', 'REFERENCES')
     OR has_table_privilege('anon', 'public.plant_cultures', 'TRIGGER') THEN
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
     OR has_table_privilege('authenticated', 'public.plant_cultures', 'TRIGGER') THEN
    RAISE EXCEPTION 'FAIL: authenticated retains unnecessary elevated privileges on plant_cultures';
  END IF;
END
$assertions$;
