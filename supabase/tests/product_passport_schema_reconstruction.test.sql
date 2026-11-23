-- Isolated reconstruction test for the BA Labs product-passport schema.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create schema if not exists storage;
create table if not exists storage.buckets(
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
drop table if exists public.alerts, public.incidents, public.documents, public.quality_checks,
  public.passport_versions, public.passports, public.lot_events, public.lots,
  public.products, public.product_categories, public.user_roles cascade;
\ir ../migrations/20261123110000_reconcile_product_passport_schema.sql

do $$
declare n integer; is_private boolean;
begin
  select count(*) into n from pg_tables where schemaname='public' and tablename in
    ('product_categories','products','lots','passports','passport_versions','quality_checks','documents','incidents','alerts','lot_events','user_roles');
  if n <> 11 then raise exception 'Expected 11 passport tables, found %',n; end if;
  if exists(select 1 from pg_tables where schemaname='public' and tablename in
    ('product_categories','products','lots','passports','passport_versions','quality_checks','documents','incidents','alerts','lot_events','user_roles') and not rowsecurity) then
    raise exception 'RLS is not enabled on every passport table';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename in
    ('product_categories','products','lots','passports','passport_versions','quality_checks','documents','incidents','alerts','lot_events','user_roles')) then
    raise exception 'Unexpected direct client policy on operational passport tables';
  end if;
  select not public into is_private from storage.buckets where id='ba-labs-documents';
  if is_private is distinct from true then raise exception 'Passport document bucket must be private'; end if;
  if not exists(select 1 from pg_trigger where tgname='passport_version_publication_guard' and not tgisinternal) then
    raise exception 'Passport publication guard trigger missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='passport_versions_immutable' and not tgisinternal) then
    raise exception 'Immutable passport-version trigger missing';
  end if;
end $$;
rollback;
