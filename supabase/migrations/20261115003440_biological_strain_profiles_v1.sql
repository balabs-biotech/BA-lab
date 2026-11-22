
create table if not exists public.biological_strain_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_code text not null,
  profile_version text not null,
  scientific_name text not null,
  strain_code text,
  strain_name text,
  lifecycle_stage text not null,
  parameter_ranges jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  validation_status text not null default 'draft',
  validation_notes text,
  source_reviewed_at timestamptz,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint biological_strain_profiles_code_check check (length(profile_code) between 1 and 120),
  constraint biological_strain_profiles_version_check check (length(profile_version) between 1 and 32),
  constraint biological_strain_profiles_stage_check check (length(lifecycle_stage) between 1 and 80),
  constraint biological_strain_profiles_ranges_object check (jsonb_typeof(parameter_ranges) = 'object'),
  constraint biological_strain_profiles_evidence_array check (jsonb_typeof(evidence) = 'array'),
  constraint biological_strain_profiles_validation_check check (validation_status in ('draft','review','validated','retired')),
  constraint biological_strain_profiles_validity_check check (valid_to is null or valid_to >= valid_from),
  constraint biological_strain_profiles_org_id_unique unique (organization_id,id),
  constraint biological_strain_profiles_version_unique unique (organization_id,profile_code,profile_version)
);

create index if not exists biological_strain_profiles_lookup_idx
on public.biological_strain_profiles (organization_id, scientific_name, strain_code, lifecycle_stage, validation_status);

alter table public.biological_strain_profiles enable row level security;

drop policy if exists biological_strain_profiles_select on public.biological_strain_profiles;
create policy biological_strain_profiles_select on public.biological_strain_profiles
for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists biological_strain_profiles_write on public.biological_strain_profiles;
create policy biological_strain_profiles_write on public.biological_strain_profiles
for all to authenticated
using (private.is_org_writer(organization_id))
with check (private.is_org_writer(organization_id));

grant select, insert, update, delete on public.biological_strain_profiles to authenticated;

alter table public.cultures
  add column if not exists biological_strain_profile_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='cultures_biological_strain_profile_org_fk'
      and conrelid='public.cultures'::regclass
  ) then
    alter table public.cultures
      add constraint cultures_biological_strain_profile_org_fk
      foreign key (organization_id, biological_strain_profile_id)
      references public.biological_strain_profiles(organization_id,id)
      on delete set null (biological_strain_profile_id);
  end if;
end $$;

create index if not exists cultures_biological_strain_profile_idx
on public.cultures (organization_id, biological_strain_profile_id)
where biological_strain_profile_id is not null;
;
