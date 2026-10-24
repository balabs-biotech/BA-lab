-- Index the plant-culture foreign keys used to filter by location and environment.
-- These indexes are safe to create on fresh installations and are no-ops when already present.
create index if not exists plant_cultures_org_environment_fk_idx
  on public.plant_cultures (organization_id, environment_id);

create index if not exists plant_cultures_org_location_fk_idx
  on public.plant_cultures (organization_id, location_id);
