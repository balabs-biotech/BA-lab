-- Store user-defined agricultural parcel boundaries as GeoJSON without requiring PostGIS.
-- Geometry validation/area calculations remain application-side until a spatial extension is enabled.
create table public.farm_parcels (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  location_id uuid,
  parcel_code text not null,
  name text not null,
  boundary_geojson jsonb not null,
  boundary_source text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  unique (organization_id, parcel_code),
  foreign key (organization_id, location_id)
    references public.locations(organization_id, id) on delete restrict,
  check (boundary_source in ('manual', 'gps', 'import')),
  check (jsonb_typeof(boundary_geojson) = 'object'),
  check (boundary_geojson->>'type' in ('Polygon', 'MultiPolygon')),
  check (jsonb_typeof(boundary_geojson->'coordinates') = 'array')
);

create index farm_parcels_org_location_idx
  on public.farm_parcels (organization_id, location_id);

alter table public.farm_parcels enable row level security;

create policy farm_parcels_select on public.farm_parcels
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy farm_parcels_insert on public.farm_parcels
  for insert to authenticated
  with check (private.is_org_member(organization_id));

create policy farm_parcels_update on public.farm_parcels
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));

create policy farm_parcels_delete on public.farm_parcels
  for delete to authenticated
  using (private.is_org_member(organization_id));

revoke all on table public.farm_parcels from anon;
grant select, insert, update, delete on table public.farm_parcels to authenticated;
