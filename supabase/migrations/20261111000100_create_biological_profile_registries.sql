-- CultureOps biological and interpretation registries.
-- Tenant isolation is enforced with the same private helpers used by core tables.

create table if not exists public.biological_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain in ('mycology', 'greentech', 'lab')),
  culture_id uuid references public.cultures(id) on delete cascade,
  plant_culture_id uuid references public.plant_cultures(id) on delete cascade,
  environment_id uuid not null references public.environments(id) on delete restrict,
  organism_kind text not null,
  taxon_code text,
  strain_code text,
  cultivar_code text,
  culture_stage text not null,
  substrate_code text,
  production_system text not null,
  context_tags text[] not null default '{}',
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint biological_contexts_one_subject check (
    (culture_id is not null and plant_culture_id is null and domain <> 'greentech')
    or (plant_culture_id is not null and culture_id is null and domain = 'greentech')
  ),
  constraint biological_contexts_valid_window check (valid_to is null or valid_to >= valid_from),
  constraint biological_contexts_subject_domain_unique
    unique (id, organization_id)
);

create index if not exists biological_contexts_subject_window_idx
  on public.biological_contexts (organization_id, domain, culture_id, plant_culture_id, valid_from desc);

create table if not exists public.environment_context_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  environment_id uuid not null references public.environments(id) on delete cascade,
  profile_code text not null,
  profile_version integer not null check (profile_version > 0),
  context_type text not null,
  label text not null,
  timezone text not null,
  origin text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint environment_context_profiles_version_unique
    unique (organization_id, environment_id, profile_code, profile_version),
  constraint environment_context_profiles_valid_window
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists environment_context_profiles_resolution_idx
  on public.environment_context_profiles
  (organization_id, environment_id, profile_code, valid_from, valid_to);

create table if not exists public.environment_context_profile_sensors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.environment_context_profiles(id) on delete cascade,
  sensor_id uuid not null references public.iot_devices(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint environment_context_profile_sensors_unique unique (profile_id, sensor_id)
);

create table if not exists public.domain_interpretation_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain in ('mycology', 'greentech', 'lab')),
  profile_code text not null,
  profile_version integer not null check (profile_version > 0),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint domain_interpretation_profiles_version_unique
    unique (organization_id, domain, profile_code, profile_version),
  constraint domain_interpretation_profiles_valid_window
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists domain_interpretation_profiles_resolution_idx
  on public.domain_interpretation_profiles
  (organization_id, domain, profile_code, valid_from, valid_to);

-- A profile's scientific content is immutable after activation. Only its
-- lifecycle status may move active -> retired.
create or replace function private.guard_activated_profile_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status in ('active', 'retired') then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'activated profile versions are immutable';
    end if;
    if old.status = 'retired' and new.status <> 'retired' then
      raise exception 'retired profile versions cannot be reactivated';
    end if;
    if old.status = 'active' and new.status not in ('active', 'retired') then
      raise exception 'active profile can only remain active or be retired';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists environment_context_profiles_immutable on public.environment_context_profiles;
create trigger environment_context_profiles_immutable
before update on public.environment_context_profiles
for each row execute function private.guard_activated_profile_immutability();

drop trigger if exists domain_interpretation_profiles_immutable on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_immutable
before update on public.domain_interpretation_profiles
for each row execute function private.guard_activated_profile_immutability();

alter table public.biological_contexts enable row level security;
alter table public.environment_context_profiles enable row level security;
alter table public.environment_context_profile_sensors enable row level security;
alter table public.domain_interpretation_profiles enable row level security;

drop policy if exists biological_contexts_select on public.biological_contexts;
create policy biological_contexts_select on public.biological_contexts
for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists biological_contexts_insert on public.biological_contexts;
create policy biological_contexts_insert on public.biological_contexts
for insert to authenticated with check (private.is_org_writer(organization_id));
drop policy if exists biological_contexts_update on public.biological_contexts;
create policy biological_contexts_update on public.biological_contexts
for update to authenticated using (private.is_org_writer(organization_id))
with check (private.is_org_writer(organization_id));
drop policy if exists biological_contexts_delete on public.biological_contexts;
create policy biological_contexts_delete on public.biological_contexts
for delete to authenticated using (private.is_org_writer(organization_id));

drop policy if exists environment_context_profiles_select on public.environment_context_profiles;
create policy environment_context_profiles_select on public.environment_context_profiles
for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists environment_context_profiles_write on public.environment_context_profiles;
create policy environment_context_profiles_write on public.environment_context_profiles
for all to authenticated using (private.is_org_writer(organization_id))
with check (private.is_org_writer(organization_id));

drop policy if exists environment_context_profile_sensors_select on public.environment_context_profile_sensors;
create policy environment_context_profile_sensors_select on public.environment_context_profile_sensors
for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists environment_context_profile_sensors_write on public.environment_context_profile_sensors;
create policy environment_context_profile_sensors_write on public.environment_context_profile_sensors
for all to authenticated using (private.is_org_writer(organization_id))
with check (private.is_org_writer(organization_id));

drop policy if exists domain_interpretation_profiles_select on public.domain_interpretation_profiles;
create policy domain_interpretation_profiles_select on public.domain_interpretation_profiles
for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists domain_interpretation_profiles_write on public.domain_interpretation_profiles;
create policy domain_interpretation_profiles_write on public.domain_interpretation_profiles
for all to authenticated using (private.is_org_writer(organization_id))
with check (private.is_org_writer(organization_id));

grant select, insert, update, delete on
  public.biological_contexts,
  public.environment_context_profiles,
  public.environment_context_profile_sensors,
  public.domain_interpretation_profiles
to authenticated;
