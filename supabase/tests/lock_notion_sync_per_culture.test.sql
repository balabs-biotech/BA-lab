-- Regression tests for the per-culture Notion sync lease.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table public.cultures (
  id uuid primary key,
  organization_id uuid not null
);
insert into public.cultures values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2');
\i supabase/migrations/20261022100000_lock_notion_sync_per_culture.sql

do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000d1';
  b uuid := '00000000-0000-0000-0000-0000000000d2';
begin
  if not public.claim_notion_sync_lock('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',a,300) then
    raise exception 'FAIL: first claim should succeed';
  end if;
  if public.claim_notion_sync_lock('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',b,300) then
    raise exception 'FAIL: concurrent claim should be rejected';
  end if;
  if public.claim_notion_sync_lock('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1',b,300) then
    raise exception 'FAIL: mismatched organization must not claim';
  end if;
  if public.release_notion_sync_lock('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',b) then
    raise exception 'FAIL: non-owner must not release lock';
  end if;
  if not public.release_notion_sync_lock('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',a) then
    raise exception 'FAIL: lock owner should release';
  end if;
  if not public.claim_notion_sync_lock('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1',b,300) then
    raise exception 'FAIL: released lock should be claimable';
  end if;
  if has_function_privilege('anon','public.claim_notion_sync_lock(uuid,uuid,uuid,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.claim_notion_sync_lock(uuid,uuid,uuid,integer)','EXECUTE') then
    raise exception 'FAIL: client roles must not execute lock functions';
  end if;
end $$;
drop table public.notion_sync_locks;
drop table public.cultures;
drop function public.claim_notion_sync_lock(uuid, uuid, uuid, integer);
drop function public.release_notion_sync_lock(uuid, uuid, uuid);
\echo OK: notion_sync_lock tests passed
