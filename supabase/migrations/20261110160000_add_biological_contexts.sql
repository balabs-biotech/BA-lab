-- Persist time-bounded biological operating contexts without duplicating CultureOps entities.
-- Subject identity remains in cultures / plant_cultures; environment identity remains in environments.

create table public.biological_contexts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  domain text not null check (domain in ('mycology', 'greentech', 'lab')),
  culture_id uuid,
  plant_culture_id uuid,
  environment_id uuid not null,
  organism_kind text not null check (organism_kind in (
    'plant', 'fungus', 'fungal_consortium', 'bacterium',
    'archaea', 'microbial_consortium', 'other'
  )),
  taxon_code text,
  strain_code text,
  cultivar_code text,
  culture_stage text not null check (length(btrim(culture_stage)) between 1 and 100),
  substrate_code text,
  production_system text not null check (length(btrim(production_system)) between 1 and 120),
  context_tags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(context_tags) = 'array'),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint biological_contexts_one_subject_check
    check (num_nonnulls(culture_id, plant_culture_id) = 1),
  constraint biological_contexts_domain_subject_check
    check (
      (domain = 'mycology' and culture_id is not null and plant_culture_id is null
        and organism_kind in ('fungus', 'fungal_consortium'))
      or
      (domain = 'lab' and culture_id is not null and plant_culture_id is null)
      or
      (domain = 'greentech' and plant_culture_id is not null and culture_id is null
        and organism_kind = 'plant')
    ),
  constraint biological_contexts_strain_kind_check
    check (
      strain_code is null
      or organism_kind in ('fungus', 'fungal_consortium', 'bacterium', 'archaea', 'microbial_consortium')
    ),
  constraint biological_contexts_cultivar_kind_check
    check (cultivar_code is null or organism_kind = 'plant'),
  constraint biological_contexts_validity_check
    check (valid_to is null or valid_to >= valid_from),
  constraint biological_contexts_tags_strings_check
    check (
      not jsonb_path_exists(context_tags, '$[*] ? (@.type() != "string")')
    ),
  constraint biological_contexts_culture_fk
    foreign key (organization_id, culture_id)
    references public.cultures (organization_id, id) on delete cascade,
  constraint biological_contexts_plant_culture_fk
    foreign key (organization_id, plant_culture_id)
    references public.plant_cultures (organization_id, id) on delete cascade,
  constraint biological_contexts_environment_fk
    foreign key (organization_id, environment_id)
    references public.environments (organization_id, id) on delete restrict
);

create index biological_contexts_culture_validity_idx
  on public.biological_contexts (organization_id, culture_id, valid_from, valid_to)
  where culture_id is not null;
create index biological_contexts_plant_validity_idx
  on public.biological_contexts (organization_id, plant_culture_id, valid_from, valid_to)
  where plant_culture_id is not null;
create index biological_contexts_environment_validity_idx
  on public.biological_contexts (organization_id, environment_id, valid_from, valid_to);

alter table public.biological_contexts enable row level security;

create policy biological_contexts_select
  on public.biological_contexts
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy biological_contexts_insert
  on public.biological_contexts
  for insert to authenticated
  with check (private.is_org_writer(organization_id));

create policy biological_contexts_update
  on public.biological_contexts
  for update to authenticated
  using (private.is_org_writer(organization_id))
  with check (private.is_org_writer(organization_id));

create policy biological_contexts_delete
  on public.biological_contexts
  for delete to authenticated
  using (private.is_org_writer(organization_id));

grant select, insert, update, delete on public.biological_contexts to authenticated;
-- The authenticated Edge Function gateway reads this table after explicit JWT and tenant checks.
grant select on public.biological_contexts to service_role;

comment on table public.biological_contexts is
  'Time-bounded biological operating context linked to existing CultureOps culture or plant_culture and environment records.';
comment on column public.biological_contexts.context_tags is
  'JSON array of explicit, non-empty domain tags; no biological facts are inferred from environmental observations.';
comment on column public.biological_contexts.environment_id is
  'References the existing environment; location_id is resolved through environments.location_id and is not duplicated.';

-- An environment must resolve to a physical location for analysis-scope binding.
-- location_id is deliberately derived, never duplicated on biological_contexts.
create or replace function private.validate_biological_context_environment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_location_id uuid;
begin
  select e.location_id
    into v_location_id
    from public.environments e
   where e.organization_id = new.organization_id
     and e.id = new.environment_id;

  if not found or v_location_id is null then
    raise exception 'biological_context_environment_requires_location'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists biological_contexts_environment_location_guard
  on public.biological_contexts;
create trigger biological_contexts_environment_location_guard
  before insert or update of organization_id, environment_id
  on public.biological_contexts
  for each row
  execute function private.validate_biological_context_environment();

revoke all on function private.validate_biological_context_environment() from public, anon, authenticated;

-- Once a biological context references an environment, its physical location is
-- part of the historical binding and cannot be silently changed or cleared.
create or replace function private.guard_environment_location_with_biological_contexts()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.location_id is distinct from old.location_id
     and exists (
       select 1
         from public.biological_contexts bc
        where bc.organization_id = old.organization_id
          and bc.environment_id = old.id
     ) then
    raise exception 'environment_location_locked_by_biological_contexts'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists environments_biological_context_location_guard
  on public.environments;
create trigger environments_biological_context_location_guard
  before update of location_id
  on public.environments
  for each row
  execute function private.guard_environment_location_with_biological_contexts();

revoke all on function private.guard_environment_location_with_biological_contexts() from public, anon, authenticated;
