-- Versioned, tenant-scoped biological identity assertions.
-- Reuses the canonical organisms/strains tables and the scientific reference registry.
create table if not exists public.biological_identity_assertions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assertion_code text not null check (length(assertion_code) between 1 and 160),
  assertion_version text not null check (assertion_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
  subject_type text not null check (subject_type in ('organism', 'strain')),
  organism_id uuid not null references public.organisms(id) on delete restrict,
  strain_id uuid,
  assertion_type text not null check (assertion_type in (
    'taxonomy.scientific_name',
    'taxonomy.external_identifier',
    'taxonomy.synonym',
    'strain.designation',
    'strain.origin',
    'strain.deposit_identifier',
    'strain.genetic_identity'
  )),
  assertion_value text not null check (length(assertion_value) between 1 and 2000),
  source_reference_id text not null,
  source_reference_version text not null,
  evidence_level public.evidence_level not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft', 'validated', 'retired')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint biological_identity_assertion_subject_shape check (
    (subject_type = 'organism' and strain_id is null
      and assertion_type in ('taxonomy.scientific_name', 'taxonomy.external_identifier', 'taxonomy.synonym'))
    or
    (subject_type = 'strain' and strain_id is not null
      and assertion_type in ('strain.designation', 'strain.origin', 'strain.deposit_identifier', 'strain.genetic_identity'))
  ),
  constraint biological_identity_assertion_validity check (valid_to is null or valid_to >= valid_from),
  constraint biological_identity_assertion_review_state check (
    (status = 'draft' and reviewed_by is null and reviewed_at is null)
    or (status in ('validated', 'retired') and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint biological_identity_assertion_version_unique unique (
    organization_id, assertion_code, assertion_version
  ),
  constraint biological_identity_assertion_strain_fk
    foreign key (organization_id, strain_id)
    references public.strains(organization_id, id) on delete restrict,
  constraint biological_identity_assertion_reference_fk
    foreign key (organization_id, source_reference_id, source_reference_version)
    references public.biological_reference_registry(organization_id, reference_id, reference_version)
    on delete restrict
);

create index if not exists biological_identity_assertions_subject_idx
  on public.biological_identity_assertions (organization_id, subject_type, organism_id, strain_id, status);

create or replace function private.guard_biological_identity_assertion_subject()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_strain_organism_id uuid;
begin
  if new.strain_id is not null then
    select organism_id into v_strain_organism_id
    from public.strains
    where organization_id = new.organization_id and id = new.strain_id;
    if v_strain_organism_id is null or v_strain_organism_id <> new.organism_id then
      raise exception 'biological identity assertion strain must belong to the declared organism'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.stamp_biological_identity_assertion_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_reference_status text;
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status = 'draft') then
    if not private.is_org_admin(new.organization_id) then
      raise exception 'validating a biological identity assertion requires an organization administrator'
        using errcode = '42501';
    end if;

    select status into v_reference_status
    from public.biological_reference_registry
    where organization_id = new.organization_id
      and reference_id = new.source_reference_id
      and reference_version = new.source_reference_version;

    if v_reference_status is distinct from 'validated' then
      raise exception 'identity assertion requires a validated scientific source reference'
        using errcode = '23514';
    end if;

    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

create or replace function private.guard_biological_identity_assertion_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.status in ('validated', 'retired') then
    if old.status = 'validated' and new.status = 'retired'
       and (to_jsonb(new) - 'status') is not distinct from (to_jsonb(old) - 'status') then
      return new;
    end if;
    raise exception 'validated biological identity assertion versions are immutable'
      using errcode = '55000';
  end if;
  if new.status = 'validated' and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception 'identity assertion validation requires reviewer identity and timestamp';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_biological_identity_assertion_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.status in ('validated', 'retired') then
    raise exception 'validated biological identity assertion versions cannot be deleted'
      using errcode = '55000';
  end if;
  return old;
end;
$function$;

revoke all on function private.guard_biological_identity_assertion_subject() from public, anon, authenticated;
revoke all on function private.stamp_biological_identity_assertion_review() from public, anon, authenticated;
revoke all on function private.guard_biological_identity_assertion_immutability() from public, anon, authenticated;
revoke all on function private.guard_biological_identity_assertion_delete() from public, anon, authenticated;

drop trigger if exists biological_identity_assertions_subject_guard on public.biological_identity_assertions;
drop trigger if exists biological_identity_assertions_00_subject_guard on public.biological_identity_assertions;
create trigger biological_identity_assertions_00_subject_guard
  before insert or update of organization_id, organism_id, strain_id, subject_type, assertion_type
  on public.biological_identity_assertions
  for each row execute function private.guard_biological_identity_assertion_subject();

drop trigger if exists biological_identity_assertions_00_review_stamp on public.biological_identity_assertions;
create trigger biological_identity_assertions_00_review_stamp
  before insert or update of status, organization_id
  on public.biological_identity_assertions
  for each row execute function private.stamp_biological_identity_assertion_review();

drop trigger if exists biological_identity_assertions_immutable on public.biological_identity_assertions;
create trigger biological_identity_assertions_immutable
  before update on public.biological_identity_assertions
  for each row execute function private.guard_biological_identity_assertion_immutability();

drop trigger if exists biological_identity_assertions_no_delete on public.biological_identity_assertions;
create trigger biological_identity_assertions_no_delete
  before delete on public.biological_identity_assertions
  for each row execute function private.guard_biological_identity_assertion_delete();

alter table public.biological_identity_assertions enable row level security;

drop policy if exists biological_identity_assertions_select on public.biological_identity_assertions;
create policy biological_identity_assertions_select
  on public.biological_identity_assertions for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists biological_identity_assertions_insert on public.biological_identity_assertions;
create policy biological_identity_assertions_insert
  on public.biological_identity_assertions for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists biological_identity_assertions_update on public.biological_identity_assertions;
create policy biological_identity_assertions_update
  on public.biological_identity_assertions for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists biological_identity_assertions_delete on public.biological_identity_assertions;
create policy biological_identity_assertions_delete
  on public.biological_identity_assertions for delete to authenticated
  using (private.is_org_admin(organization_id));

revoke all on table public.biological_identity_assertions from public, anon;
grant select, insert, update, delete on public.biological_identity_assertions to authenticated;
