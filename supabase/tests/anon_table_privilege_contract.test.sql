-- Run after the full migration replay against the disposable CI PostgreSQL database.
\set ON_ERROR_STOP on

DO $assertions$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'culture_types',
    'material_types',
    'notion_migration_rows',
    'organisms',
    'organizations',
    'plant_cultures',
    'service_plans',
    'units',
    'variables'
  ]
  LOOP
    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'TRUNCATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'REFERENCES')
       OR has_table_privilege('anon', format('public.%I', table_name), 'TRIGGER') THEN
      RAISE EXCEPTION 'FAIL: anon retains a table privilege on public.%', table_name;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('anon', 'public.commons_datasets', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.public_dataset_records', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: public read access to published dataset tables was removed';
  END IF;

  IF has_table_privilege('anon', 'public.commons_datasets', 'INSERT')
     OR has_table_privilege('anon', 'public.public_dataset_records', 'INSERT')
     OR has_table_privilege('anon', 'public.commons_datasets', 'UPDATE')
     OR has_table_privilege('anon', 'public.public_dataset_records', 'UPDATE')
     OR has_table_privilege('anon', 'public.commons_datasets', 'DELETE')
     OR has_table_privilege('anon', 'public.public_dataset_records', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL: anon retains write access to published dataset tables';
  END IF;
END
$assertions$;
