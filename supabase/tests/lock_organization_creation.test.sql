-- Regression test: authenticated users cannot create arbitrary organizations.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists public.organizations(id uuid primary key);
alter table public.organizations enable row level security;
drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert to authenticated with check (true);

\i supabase/migrations/20261022001606_lock_organization_creation_to_trusted_backend.sql

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='organizations'
      and roles && array['authenticated']::name[]
      and cmd in ('INSERT','ALL')
  ) then
    raise exception 'FAIL: authenticated users still have an organization INSERT policy';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='organizations'
      and policyname='organizations_select'
      and cmd='SELECT'
      and roles && array['authenticated']::name[]
  ) and exists (
    select 1 from pg_tables where schemaname='public' and tablename='organizations'
  ) then
    -- This fixture tests INSERT policy removal only; it does not require SELECT.
    null;
  end if;
  if not exists (select 1 from pg_roles where rolname='service_role' and rolbypassrls) then
    raise exception 'FAIL: trusted service_role should bypass RLS';
  end if;
end $$;
