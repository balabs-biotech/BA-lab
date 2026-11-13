-- Reconcile the versioned interpretation-profile registry into the repository
-- migration chain, then add tenant-scoped scientific reference records.
-- Existing production objects are preserved; CREATE IF NOT EXISTS makes replay additive.

create table if not exists public.domain_interpretation_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain in ('mycology', 'greentech', 'lab')),
  profile_code text not null,
  profile_version text not null check (length(profile_version) between 1 and 32),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint domain_interpretation_profiles_valid_window
    check (valid_to is null or valid_to >= valid_from),
  constraint domain_interpretation_profiles_version_unique
    unique (organization_id, domain, profile_code, profile_version)
);

create index if not exists domain_interpretation_profiles_resolution_idx
  on public.domain_interpretation_profiles
  (organization_id, domain, status, valid_from desc);

create or replace function private.guard_activated_profile_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.status in ('active', 'retired') then
    if old.status = 'active' and new.status = 'retired' then
      if (to_jsonb(new) - 'status' - 'valid_to')
         is distinct from
         (to_jsonb(old) - 'status' - 'valid_to') then
        raise exception 'activated profile scientific content is immutable' using errcode = '55000';
      end if;
      if new.valid_to is null then
        raise exception 'retiring an activated profile requires a finite valid_to date' using errcode = '55000';
      end if;
      if old.valid_to is not null and new.valid_to > old.valid_to then
        raise exception 'retirement may only shorten an activated profile validity window' using errcode = '55000';
      end if;
    else
      if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
        raise exception 'activated profile versions are immutable' using errcode = '55000';
      end if;
      if old.status = 'retired' and new.status <> 'retired' then
        raise exception 'retired profile versions cannot be reactivated' using errcode = '55000';
      end if;
      if old.status = 'active' and new.status not in ('active', 'retired') then
        raise exception 'active profile can only remain active or be retired' using errcode = '55000';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.guard_activated_profile_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.status in ('active', 'retired') then
    raise exception 'activated profile versions cannot be deleted' using errcode = '55000';
  end if;
  return old;
end;
$function$;

create or replace function private.guard_domain_profile_resolution_window()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status not in ('active', 'retired') then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'domain-profile:' || new.organization_id::text || ':' || new.domain,
      0
    )
  );

  if exists (
    select 1
    from public.domain_interpretation_profiles existing
    where existing.organization_id = new.organization_id
      and existing.domain = new.domain
      and existing.id <> new.id
      and existing.status in ('active', 'retired')
      and existing.valid_from <= coalesce(new.valid_to, 'infinity'::date)
      and (existing.valid_to is null or existing.valid_to >= new.valid_from)
  ) then
    raise exception using
      errcode = '23P01',
      message = 'activated domain profile validity overlaps another profile in the same domain';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_activated_profile_immutability() from public, anon, authenticated;
revoke all on function private.guard_activated_profile_delete() from public, anon, authenticated;
revoke all on function private.guard_domain_profile_resolution_window() from public, anon, authenticated;

drop trigger if exists domain_interpretation_profiles_immutable on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_immutable
  before update on public.domain_interpretation_profiles
  for each row execute function private.guard_activated_profile_immutability();

drop trigger if exists domain_interpretation_profiles_no_delete on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_no_delete
  before delete on public.domain_interpretation_profiles
  for each row execute function private.guard_activated_profile_delete();

drop trigger if exists domain_interpretation_profiles_resolution_window on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_resolution_window
  before insert or update of organization_id, domain, status, valid_from, valid_to
  on public.domain_interpretation_profiles
  for each row execute function private.guard_domain_profile_resolution_window();

alter table public.domain_interpretation_profiles enable row level security;

drop policy if exists domain_interpretation_profiles_select on public.domain_interpretation_profiles;
create policy domain_interpretation_profiles_select
  on public.domain_interpretation_profiles for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists domain_interpretation_profiles_write on public.domain_interpretation_profiles;
create policy domain_interpretation_profiles_write
  on public.domain_interpretation_profiles for all to authenticated
  using (private.is_org_writer(organization_id))
  with check (private.is_org_writer(organization_id));

revoke all on table public.domain_interpretation_profiles from public, anon;
grant select, insert, update, delete on public.domain_interpretation_profiles to authenticated;

create table if not exists public.biological_reference_registry (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_id text not null check (length(reference_id) between 1 and 160),
  reference_version text not null check (length(reference_version) between 1 and 80),
  title text not null check (length(title) between 1 and 500),
  authors text,
  publisher text,
  publication_date date,
  doi text,
  source_url text,
  citation text not null check (length(citation) between 1 and 2000),
  source_type text not null check (
    source_type in ('peer_reviewed', 'standard', 'technical_document', 'dataset', 'internal_protocol', 'other')
  ),
  evidence_level public.evidence_level not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft' check (status in ('draft', 'validated', 'retired')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint biological_reference_registry_version_unique
    unique (organization_id, reference_id, reference_version),
  constraint biological_reference_registry_review_state
    check (
      (status = 'draft' and reviewed_by is null and reviewed_at is null)
      or (status in ('validated', 'retired') and reviewed_by is not null and reviewed_at is not null)
    )
);

create index if not exists biological_reference_registry_status_idx
  on public.biological_reference_registry (organization_id, status, reference_id);

create or replace function private.is_org_admin(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_org
      and om.user_id = auth.uid()
      and om.role::text in ('owner', 'admin')
  );
$function$;

revoke all on function private.is_org_admin(uuid) from public, anon;
grant execute on function private.is_org_admin(uuid) to authenticated;

-- Activation is a scientific governance action, not an ordinary draft edit.
create or replace function private.guard_interpretation_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status in ('active', 'retired') and not private.is_org_admin(new.organization_id) then
    raise exception 'activating or retiring an interpretation profile requires an organization administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_interpretation_profile_activation() from public, anon, authenticated;
drop trigger if exists domain_interpretation_profiles_admin_activation on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_admin_activation
  before insert or update of status, organization_id
  on public.domain_interpretation_profiles
  for each row execute function private.guard_interpretation_profile_activation();

-- The database stamps the identity and time of the actual reviewer.
create or replace function private.stamp_biological_reference_review()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status = 'draft') then
    if not private.is_org_admin(new.organization_id) then
      raise exception 'validating a biological reference requires an organization administrator'
        using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$function$;

revoke all on function private.stamp_biological_reference_review() from public, anon, authenticated;
drop trigger if exists biological_reference_registry_review_stamp on public.biological_reference_registry;
create trigger biological_reference_registry_review_stamp
  before insert or update of status, organization_id
  on public.biological_reference_registry
  for each row execute function private.stamp_biological_reference_review();

create or replace function private.guard_validated_biological_reference_immutability()
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
    raise exception 'validated biological reference versions are immutable' using errcode = '55000';
  end if;
  if new.status in ('validated', 'retired') and (
    new.reviewed_by is null or new.reviewed_at is null
  ) then
    raise exception 'validating a biological reference requires reviewer identity and timestamp';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_validated_biological_reference_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if old.status in ('validated', 'retired') then
    raise exception 'validated biological reference versions cannot be deleted' using errcode = '55000';
  end if;
  return old;
end;
$function$;

revoke all on function private.guard_validated_biological_reference_immutability() from public, anon, authenticated;
revoke all on function private.guard_validated_biological_reference_delete() from public, anon, authenticated;

drop trigger if exists biological_reference_registry_immutable on public.biological_reference_registry;
create trigger biological_reference_registry_immutable
  before update on public.biological_reference_registry
  for each row execute function private.guard_validated_biological_reference_immutability();

drop trigger if exists biological_reference_registry_no_delete on public.biological_reference_registry;
create trigger biological_reference_registry_no_delete
  before delete on public.biological_reference_registry
  for each row execute function private.guard_validated_biological_reference_delete();

alter table public.biological_reference_registry enable row level security;

drop policy if exists biological_reference_registry_select on public.biological_reference_registry;
create policy biological_reference_registry_select
  on public.biological_reference_registry for select to authenticated
  using (private.is_org_member(organization_id));

drop policy if exists biological_reference_registry_insert on public.biological_reference_registry;
create policy biological_reference_registry_insert
  on public.biological_reference_registry for insert to authenticated
  with check (private.is_org_admin(organization_id));

drop policy if exists biological_reference_registry_update on public.biological_reference_registry;
create policy biological_reference_registry_update
  on public.biological_reference_registry for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

drop policy if exists biological_reference_registry_delete on public.biological_reference_registry;
create policy biological_reference_registry_delete
  on public.biological_reference_registry for delete to authenticated
  using (private.is_org_admin(organization_id));

revoke all on table public.biological_reference_registry from public, anon;
grant select, insert, update, delete on public.biological_reference_registry to authenticated;
