-- Regression test: a culture can have only one active Notion sync claim.
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists private;
drop table if exists public.cultures cascade;
create table public.cultures (
  organization_id uuid not null,
  id uuid not null,
  primary key (organization_id, id)
);

insert into public.cultures (organization_id, id) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000022');

\i supabase/migrations/20261022143000_serialize_notion_sync_claims.sql

do $assertions$
declare
  org_id uuid := '00000000-0000-0000-0000-000000000001';
  v_culture_id uuid := '00000000-0000-0000-0000-000000000011';
  token_a uuid := '00000000-0000-0000-0000-0000000000a1';
  token_b uuid := '00000000-0000-0000-0000-0000000000b1';
  result boolean;
begin
  select public.claim_notion_sync(org_id, v_culture_id, token_a) into result;
  if result is distinct from true then raise exception 'FAIL: first claim should succeed'; end if;

  select public.claim_notion_sync(org_id, v_culture_id, token_b) into result;
  if result is distinct from false then raise exception 'FAIL: concurrent second claim should be rejected'; end if;

  select public.release_notion_sync_claim(org_id, v_culture_id, token_b) into result;
  if result is distinct from false then raise exception 'FAIL: a different token must not release the active claim'; end if;

  select public.release_notion_sync_claim(org_id, v_culture_id, token_a) into result;
  if result is distinct from true then raise exception 'FAIL: owner token should release claim'; end if;

  select public.claim_notion_sync(org_id, v_culture_id, token_b) into result;
  if result is distinct from true then raise exception 'FAIL: claim should succeed after release'; end if;

  update private.notion_sync_claims
    set expires_at = clock_timestamp() - interval '1 second'
    where private.notion_sync_claims.culture_id = v_culture_id and private.notion_sync_claims.organization_id = org_id;

  select public.claim_notion_sync(org_id, v_culture_id, token_a) into result;
  if result is distinct from true then raise exception 'FAIL: expired claim should be recoverable'; end if;

  begin
    perform public.claim_notion_sync(
      '00000000-0000-0000-0000-000000000002',
      v_culture_id,
      token_b
    );
    raise exception 'FAIL: claim accepted mismatched organization';
  exception when foreign_key_violation then
    null;
  end;

  if has_function_privilege('anon', 'public.claim_notion_sync(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon can execute claim RPC';
  end if;
  if has_function_privilege('authenticated', 'public.claim_notion_sync(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'FAIL: authenticated can execute claim RPC';
  end if;
end
$assertions$;
