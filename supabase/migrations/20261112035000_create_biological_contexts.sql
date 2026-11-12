-- Reproducible baseline for biological context history.
-- Production already contains this table; IF NOT EXISTS makes this migration
-- safe to replay there while bringing clean migration-chain databases in line.
create table if not exists public.biological_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  domain text not null,
  culture_id uuid,
  plant_culture_id uuid,
  environment_id uuid not null,
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
  constraint biological_contexts_domain_check
    check (domain = any (array['mycology'::text, 'greentech'::text, 'lab'::text])),
  constraint biological_contexts_one_subject
    check (
      (culture_id is not null and plant_culture_id is null and domain <> 'greentech')
      or
      (plant_culture_id is not null and culture_id is null and domain = 'greentech')
    ),
  constraint biological_contexts_valid_window
    check (valid_to is null or valid_to >= valid_from),
  constraint biological_contexts_organization_id_fkey
    foreign key (organization_id) references public.organizations(id) on delete cascade,
  constraint biological_contexts_culture_fk
    foreign key (organization_id, culture_id)
    references public.cultures(organization_id, id) on delete cascade,
  constraint biological_contexts_plant_fk
    foreign key (organization_id, plant_culture_id)
    references public.plant_cultures(organization_id, id) on delete cascade,
  constraint biological_contexts_environment_fk
    foreign key (organization_id, environment_id)
    references public.environments(organization_id, id) on delete restrict,
  constraint biological_contexts_subject_domain_unique
    unique (id, organization_id)
);

create index if not exists biological_contexts_subject_window_idx
  on public.biological_contexts
  (organization_id, domain, culture_id, plant_culture_id, valid_from desc);

alter table public.biological_contexts enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='biological_contexts' and policyname='biological_contexts_select') then
    create policy biological_contexts_select on public.biological_contexts
      for select to authenticated using (private.is_org_member(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='biological_contexts' and policyname='biological_contexts_insert') then
    create policy biological_contexts_insert on public.biological_contexts
      for insert to authenticated with check (private.is_org_writer(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='biological_contexts' and policyname='biological_contexts_update') then
    create policy biological_contexts_update on public.biological_contexts
      for update to authenticated
      using (private.is_org_writer(organization_id))
      with check (private.is_org_writer(organization_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='biological_contexts' and policyname='biological_contexts_delete') then
    create policy biological_contexts_delete on public.biological_contexts
      for delete to authenticated using (private.is_org_writer(organization_id));
  end if;
end;
$policies$;

grant select, insert, update, delete on public.biological_contexts to authenticated;
