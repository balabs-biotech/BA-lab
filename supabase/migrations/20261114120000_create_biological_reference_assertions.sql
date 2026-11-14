-- Machine-readable, source-linked biological knowledge claims.
-- A claim is never promoted to validated without an administrator review.
-- The source registry remains the canonical bibliographic record.

create table if not exists public.biological_reference_assertions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assertion_code text not null check (assertion_code ~ '^[a-z][a-z0-9_.-]{1,159}$'),
  assertion_version text not null check (assertion_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+([+-][a-zA-Z0-9.-]+)?$'),
  subject_type text not null check (
    subject_type in (
      'taxon', 'strain', 'cultivar', 'substrate', 'culture_stage',
      'production_system', 'environmental_parameter', 'biological_process'
    )
  ),
  subject_ref text not null check (length(subject_ref) between 1 and 240),
  predicate_code text not null check (predicate_code ~ '^[a-z][a-z0-9_.-]{1,159}$'),
  object_value jsonb not null check (jsonb_typeof(object_value) in ('object', 'array', 'string', 'number', 'boolean')),
  unit_code text,
  reference_registry_id uuid not null
    references public.biological_reference_registry(id) on delete restrict,
  source_locator text,
  evidence_level text not null check (
    evidence_level in ('L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'unassessed')
  ),
  applicability jsonb not null default '{}'::jsonb
    check (jsonb_typeof(applicability) = 'object'),
  uncertainty jsonb not null default '{}'::jsonb
    check (jsonb_typeof(uncertainty) = 'object'),
  status text not null default 'draft'
    check (status in ('draft', 'validated', 'retired')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint biological_reference_assertions_version_unique
    unique (organization_id, assertion_code, assertion_version),
  constraint biological_reference_assertions_review_state
    check (
      (status = 'draft' and reviewed_by is null and reviewed_at is null)
      or (status in ('validated', 'retired') and reviewed_by is not null and reviewed_at is not null)
    )
);

create index if not exists biological_reference_assertions_subject_idx
  on public.biological_reference_assertions
  (organization_id, subject_type, subject_ref, status);

create index if not exists biological_reference_assertions_reference_idx
  on public.biological_reference_assertions
  (organization_id, reference_registry_id);

create or replace function private.stamp_biological_assertion_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status = 'draft') then
    if not private.is_org_admin(new.organization_id) then
      raise exception 'validating a biological assertion requires an organization administrator'
        using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.biological_reference_registry r
      where r.id = new.reference_registry_id
        and r.organization_id = new.organization_id
        and r.status = 'validated'
    ) then
      raise exception 'biological assertion requires a validated source in the same organization'
        using errcode = '23514';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

create or replace function private.guard_validated_biological_assertion_immutability()
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
    raise exception 'validated biological assertion versions are immutable' using errcode = '55000';
  end if;
  if new.status in ('validated', 'retired')
     and (new.reviewed_by is null or new.reviewed_at is null) then
    raise exception 'biological assertion review identity and timestamp are required';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_validated_biological_assertion_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.status in ('validated', 'retired') then
    raise exception 'validated biological assertion versions cannot be deleted' using errcode = '55000';
  end if;
  return old;
end;
$function$;

revoke all on function private.stamp_biological_assertion_review() from public, anon, authenticated;
revoke all on function private.guard_validated_biological_assertion_immutability() from public, anon, authenticated;
revoke all on function private.guard_validated_biological_assertion_delete() from public, anon, authenticated;

drop trigger if exists biological_reference_assertions_00_review_stamp on public.biological_reference_assertions;
create trigger biological_reference_assertions_00_review_stamp
  before insert or update of status, organization_id, reference_registry_id
  on public.biological_reference_assertions
  for each row execute function private.stamp_biological_assertion_review();

drop trigger if exists biological_reference_assertions_immutable on public.biological_reference_assertions;
create trigger biological_reference_assertions_immutable
  before update on public.biological_reference_assertions
  for each row execute function private.guard_validated_biological_assertion_immutability();

drop trigger if exists biological_reference_assertions_no_delete on public.biological_reference_assertions;
create trigger biological_reference_assertions_no_delete
  before delete on public.biological_reference_assertions
  for each row execute function private.guard_validated_biological_assertion_delete();

alter table public.biological_reference_assertions enable row level security;

drop policy if exists biological_reference_assertions_select on public.biological_reference_assertions;
create policy biological_reference_assertions_select
  on public.biological_reference_assertions for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists biological_reference_assertions_insert on public.biological_reference_assertions;
create policy biological_reference_assertions_insert
  on public.biological_reference_assertions for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists biological_reference_assertions_update on public.biological_reference_assertions;
create policy biological_reference_assertions_update
  on public.biological_reference_assertions for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists biological_reference_assertions_delete on public.biological_reference_assertions;
create policy biological_reference_assertions_delete
  on public.biological_reference_assertions for delete to authenticated
  using (private.is_org_admin(organization_id));

revoke all on table public.biological_reference_assertions from public, anon;
grant select, insert, update, delete on public.biological_reference_assertions to authenticated;
