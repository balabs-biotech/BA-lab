-- Regression test for 20261021120000_add_missing_fk_indexes_optimize_consent_rls.sql.
-- Runs in the disposable PostgreSQL CI service; no production connection is used.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists private;
create table if not exists auth.users(id uuid primary key);
create table if not exists public.organization_members(organization_id uuid, user_id uuid);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function private.is_org_member(p_org uuid) returns boolean
  language sql security definer set search_path = pg_catalog, public
  as $$ select exists (select 1 from public.organization_members om
                       where om.organization_id = p_org and om.user_id = auth.uid()) $$;
create table if not exists public.units(code text primary key);
create table if not exists public.batch_qc_checks(
  id uuid primary key default gen_random_uuid(),
  unit_code text references public.units(code));
create table if not exists public.batch_qc_templates(
  id uuid primary key default gen_random_uuid(),
  default_unit_code text references public.units(code));
create table if not exists public.culture_data_consents(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null references auth.users(id),
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  research_statistics_opt_in boolean not null default false,
  research_opt_in_at timestamptz,
  created_at timestamptz not null default now());
alter table public.culture_data_consents enable row level security;

\i supabase/migrations/20261021120000_add_missing_fk_indexes_optimize_consent_rls.sql
\i supabase/migrations/20261021120000_add_missing_fk_indexes_optimize_consent_rls.sql

do $$ declare n integer; begin
  select count(*) into n from pg_indexes
   where schemaname='public' and indexname in (
    'batch_qc_checks_unit_code_idx',
    'batch_qc_templates_default_unit_code_idx',
    'culture_data_consents_user_id_idx');
  if n <> 3 then raise exception 'FAIL: expected 3 FK indexes, found %', n; end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='culture_data_consents'
      and policyname='culture_data_consents_select_own'
      and qual like '%SELECT auth.uid()%') then
    raise exception 'FAIL: select policy is not using a scalar subquery for auth.uid()';
  end if;
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='culture_data_consents'
      and policyname='culture_data_consents_insert_own'
      and with_check like '%SELECT auth.uid()%') then
    raise exception 'FAIL: insert policy is not using a scalar subquery for auth.uid()';
  end if;
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='culture_data_consents'
      and policyname='culture_data_consents_update_own'
      and qual like '%SELECT auth.uid()%'
      and with_check like '%SELECT auth.uid()%') then
    raise exception 'FAIL: update policy is not using scalar subqueries for auth.uid()';
  end if;
end $$;
