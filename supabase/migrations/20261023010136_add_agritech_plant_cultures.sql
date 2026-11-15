-- Separate plant/greenhouse records from fungal and laboratory culture lineages.
create table if not exists public.plant_cultures (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  code text not null,
  crop_type text not null,
  species_name text not null,
  cultivar_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_code text not null default 'plants',
  location_id uuid,
  environment_id uuid,
  substrate text,
  started_at timestamptz,
  status text not null default 'active'
    check (status in ('planned', 'active', 'harvested', 'archived', 'lost')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint plant_cultures_pkey primary key (organization_id, id),
  constraint plant_cultures_org_code_key unique (organization_id, code),
  constraint plant_cultures_location_fk
    foreign key (organization_id, location_id)
    references public.locations (organization_id, id),
  constraint plant_cultures_environment_fk
    foreign key (organization_id, environment_id)
    references public.environments (organization_id, id)
);

create index if not exists plant_cultures_org_status_idx
  on public.plant_cultures (organization_id, status, started_at desc);
create index if not exists plant_cultures_org_crop_idx
  on public.plant_cultures (organization_id, crop_type, cultivar_name);

alter table public.plant_cultures enable row level security;

drop policy if exists plant_cultures_select on public.plant_cultures;
create policy plant_cultures_select on public.plant_cultures
  for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists plant_cultures_insert on public.plant_cultures;
create policy plant_cultures_insert on public.plant_cultures
  for insert to authenticated
  with check (private.is_org_member(organization_id));

drop policy if exists plant_cultures_update on public.plant_cultures;
create policy plant_cultures_update on public.plant_cultures
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));

drop policy if exists plant_cultures_delete on public.plant_cultures;
create policy plant_cultures_delete on public.plant_cultures
  for delete to authenticated
  using (private.is_org_member(organization_id));

grant select, insert, update, delete on public.plant_cultures to authenticated;
