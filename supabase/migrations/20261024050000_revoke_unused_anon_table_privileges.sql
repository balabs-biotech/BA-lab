-- Remove unused anonymous-role table privileges from internal and tenant-scoped tables.
-- RLS currently has no anon policies for these tables, so this makes the SQL privilege
-- contract explicit without changing authenticated access or published dataset reads.
revoke all privileges on table
  public.culture_types,
  public.material_types,
  public.notion_migration_rows,
  public.organisms,
  public.organizations,
  public.plant_cultures,
  public.service_plans,
  public.units,
  public.variables
from anon;
