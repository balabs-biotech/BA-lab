-- Prevent overlapping activated profile windows at the actual resolver scope.
-- Intervals are inclusive (valid_from .. valid_to); NULL valid_to is unbounded.
-- Advisory transaction locks serialize concurrent activation attempts per scope.

create or replace function private.guard_environment_profile_resolution_window()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status not in ('active', 'retired') then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'environment-profile:' || new.organization_id::text || ':' || new.environment_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.environment_context_profiles existing
    where existing.organization_id = new.organization_id
      and existing.environment_id = new.environment_id
      and existing.id <> new.id
      and existing.status in ('active', 'retired')
      and existing.valid_from <= coalesce(new.valid_to, 'infinity'::date)
      and (existing.valid_to is null or existing.valid_to >= new.valid_from)
  ) then
    raise exception using
      errcode = '23P01',
      message = 'activated environment profile validity overlaps another profile in the same environment';
  end if;

  return new;
end;
$$;

create or replace function private.guard_domain_profile_resolution_window()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

revoke all on function private.guard_environment_profile_resolution_window() from public, anon, authenticated;
revoke all on function private.guard_domain_profile_resolution_window() from public, anon, authenticated;

drop trigger if exists environment_context_profiles_resolution_window on public.environment_context_profiles;
create trigger environment_context_profiles_resolution_window
before insert or update of organization_id, environment_id, status, valid_from, valid_to
on public.environment_context_profiles
for each row execute function private.guard_environment_profile_resolution_window();

drop trigger if exists domain_interpretation_profiles_resolution_window on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_resolution_window
before insert or update of organization_id, domain, status, valid_from, valid_to
on public.domain_interpretation_profiles
for each row execute function private.guard_domain_profile_resolution_window();
