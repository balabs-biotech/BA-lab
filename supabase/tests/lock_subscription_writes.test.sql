-- Regression test: clients cannot create or mutate subscription entitlements.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists private;
create table public.organizations(id uuid primary key);
create table public.service_plans(id uuid primary key);
create table public.organization_members(organization_id uuid, user_id uuid);
create table public.organization_subscriptions(
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  plan_id uuid not null references public.service_plans(id),
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create or replace function private.is_org_member(p_org uuid) returns boolean
  language sql stable security definer set search_path = pg_catalog, public
  as $$ select exists (select 1 from public.organization_members om where om.organization_id=p_org) $$;
alter table public.organization_subscriptions enable row level security;
create policy organization_subscriptions_select on public.organization_subscriptions
  for select to authenticated using (private.is_org_member(organization_id));
create policy organization_subscriptions_insert on public.organization_subscriptions
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy organization_subscriptions_update on public.organization_subscriptions
  for update to authenticated using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy organization_subscriptions_delete on public.organization_subscriptions
  for delete to authenticated using (private.is_org_member(organization_id));

\i supabase/migrations/20261022100000_lock_subscription_writes_to_trusted_backend.sql

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='organization_subscriptions'
      and roles && array['authenticated']::name[]
      and cmd in ('INSERT','UPDATE','DELETE','ALL')
  ) then
    raise exception 'FAIL: authenticated users still have a subscription write policy';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='organization_subscriptions'
      and policyname='organization_subscriptions_select'
      and cmd='SELECT'
      and roles && array['authenticated']::name[]
  ) then
    raise exception 'FAIL: organization members lost subscription read access';
  end if;
  if not exists (
    select 1 from pg_roles where rolname='service_role' and rolbypassrls
  ) then
    raise exception 'FAIL: expected service_role to retain RLS bypass for trusted backend writes';
  end if;
end $$;
