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
\ir ../migrations/20261123120000_product_passport_workflow_rpcs.sql

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

-- Exercise the complete synthetic lifecycle without touching live BA Labs data.
do $$
declare
  actor_operator uuid := '00000000-0000-4000-8000-000000000001';
  actor_reviewer uuid := '00000000-0000-4000-8000-000000000002';
  token_hash text := repeat('a',64);
  category_id uuid;
  product_id uuid;
  lot_id uuid;
  check_id uuid;
  v_passport_id uuid;
  v_version_no integer;
  v_snapshot jsonb;
begin
  insert into auth.users(id) values(actor_operator),(actor_reviewer) on conflict do nothing;
  insert into public.product_categories(code,name_fr) values('TEST','Catégorie test') returning id into category_id;

  product_id := public.create_product_with_public_info_with_audit(
    category_id,'BA-TEST-001','Produit fixture',null,null,null,
    'Description interne fixture','Description publique fixture','Utilisation fixture',actor_operator
  );
  lot_id := public.create_lot_with_audit(
    product_id,'LOT-TEST-001',date '2026-11-23',date '2027-11-23',1,'unité',null,actor_operator
  );
  perform public.transition_lot_with_audit(lot_id,'in_production',null,actor_operator);
  perform public.transition_lot_with_audit(lot_id,'awaiting_checks',null,actor_operator);

  check_id := public.record_quality_check_with_audit(
    lot_id,'Inspection visuelle','pass','Contrôle fixture',actor_operator
  );
  perform public.review_quality_check_with_audit(check_id,actor_reviewer);
  perform public.release_lot_with_audit(lot_id,actor_reviewer);

  v_passport_id := public.create_passport_draft_with_audit(lot_id,token_hash,actor_operator);
  v_version_no := public.publish_passport_with_audit(v_passport_id,actor_reviewer);

  select pv.v_snapshot into v_snapshot
  from public.passport_versions pv
  where pv.passport_id=v_passport_id and pv.version=v_version_no;

  if v_version_no <> 1 then raise exception 'Expected first passport version, got %',v_version_no; end if;
  if v_snapshot #>> '{product,name}' <> 'Produit fixture' then raise exception 'Published v_snapshot product name mismatch'; end if;
  if v_snapshot #>> '{lot,code}' <> 'LOT-TEST-001' then raise exception 'Published v_snapshot lot code mismatch'; end if;
  if v_snapshot #>> '{quality,status}' <> 'released' then raise exception 'Published v_snapshot quality state mismatch'; end if;
  if v_snapshot->'alerts' <> '[]'::jsonb then raise exception 'Unexpected fixture alerts'; end if;
  if v_snapshot ? 'internal_notes' then raise exception 'Internal lot notes leaked into public v_snapshot'; end if;
  if not exists(
    select 1 from public.passports p
    join public.passport_versions pv on pv.passport_id=p.id and pv.version=p.current_version
    where p.id=v_passport_id and p.qr_token_hash=token_hash and p.status='published'
      and pv.v_snapshot=v_snapshot
  ) then raise exception 'QR hash does not resolve to the current published v_snapshot'; end if;
end $$;

rollback;
