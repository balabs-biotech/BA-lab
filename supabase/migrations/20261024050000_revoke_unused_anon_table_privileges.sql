-- Remove unused anonymous-role table privileges from internal and tenant-scoped tables.
-- The repository supports staged schemas; revoke only on tables that exist in this migration history.
-- RLS remains necessary, but SQL grants must also express the intended access contract.
do $migration$
declare
  table_name text;
begin
  foreach table_name in array array[
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
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('revoke all privileges on table public.%I from anon, public', table_name);
    end if;
  end loop;
end
$migration$;
