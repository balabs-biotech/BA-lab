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
create table if not exists public.audit_events(
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null,
  target_type text not null, target_id text not null, occurred_at timestamptz not null default now(),
  outcome text not null, metadata jsonb not null default '{}'::jsonb, request_id text,
  created_at timestamptz not null default now()
);
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
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='updated_at') then
    raise exception 'Documents updated_at column missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='documents_set_updated_at' and not tgisinternal) then
    raise exception 'Documents updated_at trigger missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='passport_version_publication_guard' and not tgisinternal) then
    raise exception 'Passport publication guard trigger missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='passport_versions_immutable' and not tgisinternal) then
    raise exception 'Immutable passport-version trigger missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'approve_alert_with_audit','archive_document_with_audit','create_alert_draft_with_audit',
        'create_incident_with_scope_with_audit','create_lot_with_audit','create_passport_draft_with_audit',
        'create_product_with_public_info_with_audit','publish_alert_with_audit','publish_passport_with_audit',
        'record_quality_check_with_audit','register_document_upload_with_audit','release_lot_with_audit',
        'review_quality_check_with_audit','revoke_passport_with_audit','rotate_passport_token_with_audit',
        'transition_lot_with_audit','update_incident_with_audit'
      )) <> 17 then raise exception 'Expected all 17 product-passport workflow RPCs'; end if;
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'approve_alert_with_audit','archive_document_with_audit','create_alert_draft_with_audit',
      'create_incident_with_scope_with_audit','create_lot_with_audit','create_passport_draft_with_audit',
      'create_product_with_public_info_with_audit','publish_alert_with_audit','publish_passport_with_audit',
      'record_quality_check_with_audit','register_document_upload_with_audit','release_lot_with_audit',
      'review_quality_check_with_audit','revoke_passport_with_audit','rotate_passport_token_with_audit',
      'transition_lot_with_audit','update_incident_with_audit'
    ) and (p.prosecdef or not has_function_privilege('service_role',p.oid,'EXECUTE')
      or has_function_privilege('anon',p.oid,'EXECUTE')
      or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) then raise exception 'Workflow RPC must be invoker-rights, service_role-only'; end if;
end $$;
rollback;
