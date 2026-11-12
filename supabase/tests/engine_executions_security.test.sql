\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists private;
create table if not exists auth.users(id uuid primary key);
create table if not exists public.organizations(id uuid primary key);
create table if not exists public.organization_members(
  organization_id uuid not null,
  user_id uuid not null,
  role text not null default 'member',
  primary key(organization_id,user_id)
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id=p_org and om.user_id=auth.uid()
  )
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

drop table if exists public.engine_executions cascade;
\ir ../migrations/20261112020000_create_engine_executions.sql

do $$
declare
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_user uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  if not (select relrowsecurity from pg_class where oid='public.engine_executions'::regclass) then
    raise exception 'engine_executions must have RLS enabled';
  end if;
  if not has_table_privilege('authenticated','public.engine_executions','SELECT') then
    raise exception 'authenticated members need SELECT privilege';
  end if;
  if has_table_privilege('authenticated','public.engine_executions','INSERT') or
     has_table_privilege('authenticated','public.engine_executions','UPDATE') or
     has_table_privilege('authenticated','public.engine_executions','DELETE') then
    raise exception 'authenticated clients must not write execution ledger rows';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='engine_executions'
      and policyname='engine_executions_select'
      and qual like '%is_org_member%'
  ) then
    raise exception 'tenant membership SELECT policy missing';
  end if;
  insert into public.organizations(id,code,name) values(v_org,'TEST-ENGINE-ORG','Engine Test Organization') on conflict do nothing;
  insert into auth.users(id) values(v_user) on conflict do nothing;
  insert into public.organization_members(organization_id,user_id,role)
    values(v_org,v_user,'member') on conflict do nothing;
  insert into public.engine_executions(
    organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
    input_record_ids,input_snapshot_sha256,request_payload,status,requested_by
  ) values (
    v_org,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','test-idempotency-0001',
    'environmental.timeseries.qc','0.1.0','{"organization_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',
    array['dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid],repeat('a',64),'{}','queued',v_user
  );
  if not exists (
    select 1 from public.engine_executions
    where organization_id=v_org and idempotency_key='test-idempotency-0001'
      and status='queued'
  ) then raise exception 'queued execution could not be persisted'; end if;
  update public.engine_executions
    set status='running', started_at=now(), updated_at=now()
    where organization_id=v_org and idempotency_key='test-idempotency-0001';
  update public.engine_executions
    set status='completed', result_payload='{"outcome":"success"}',
        completed_at=now(), updated_at=now()
    where organization_id=v_org and idempotency_key='test-idempotency-0001';
  begin
    update public.engine_executions
      set input_snapshot_sha256=repeat('c',64)
      where organization_id=v_org and idempotency_key='test-idempotency-0001';
    raise exception 'immutable input snapshot was modified';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.engine_executions
      set status='failed', error_code='late_failure'
      where organization_id=v_org and idempotency_key='test-idempotency-0001';
    raise exception 'terminal execution was modified';
  exception when sqlstate '55000' then null;
  end;
  begin
    insert into public.engine_executions(
      organization_id,request_id,idempotency_key,engine_id,engine_version,scope,
      input_record_ids,input_snapshot_sha256,request_payload
    ) values (
      v_org,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','test-idempotency-0001',
      'environmental.timeseries.qc','0.1.0','{}',
      array['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid],repeat('b',64),'{}'
    );
    raise exception 'duplicate organization idempotency key was accepted';
  exception when unique_violation then null;
  end;
  raise notice 'engine execution ledger security and idempotency contract passed';
end $$;

rollback;
