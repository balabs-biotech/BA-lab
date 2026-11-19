-- Test de la migration 20261020090000_protect_cultures_notion_columns_v1.sql.
-- Schéma minimal qui reproduit les rôles Supabase et la RLS de public.cultures.
-- Usage (depuis la racine du dépôt) : psql -v ON_ERROR_STOP=1 -X -q -f supabase/tests/protect_cultures_notion_cols.test.sql
-- Toute assertion en échec lève une exception et fait échouer psql.
\set ON_ERROR_STOP on

-- Les rôles sont globaux au cluster : création idempotente.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema private;
create schema auth;
grant usage on schema private, auth, public to authenticated, anon, service_role;

create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.organization_members(organization_id uuid, user_id uuid);
create function private.is_org_member(p_org uuid) returns boolean
  language sql security definer set search_path = pg_catalog, public
  as $$ select exists (select 1 from public.organization_members om
                       where om.organization_id = p_org and om.user_id = auth.uid()); $$;

create table public.cultures(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text,
  parent_culture_id uuid,
  notion_page_id text,
  notion_sync_status text not null default 'pending'
    check (notion_sync_status in ('pending','synced','error')),
  notion_synced_at timestamptz,
  notion_sync_error text);
alter table public.cultures enable row level security;
create policy cultures_select on public.cultures for select to authenticated
  using (private.is_org_member(organization_id));
create policy cultures_insert on public.cultures for insert to authenticated
  with check (private.is_org_member(organization_id));
create policy cultures_update on public.cultures for update to authenticated
  using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
grant select, insert, update on public.cultures to authenticated, anon, service_role;

insert into public.organization_members values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1');
insert into public.cultures(id, organization_id, code) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'TEST-1');

-- Migration appliquée deux fois : doit être rejouable.
\i supabase/migrations/20261020090000_protect_cultures_notion_columns_v1.sql
\i supabase/migrations/20261020090000_protect_cultures_notion_columns_v1.sql

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);

-- 1-2. membre authentifié : écriture directe sur notion_* refusée (42501)
set role authenticated;
do $$ begin
  begin update public.cultures set notion_sync_status = 'synced' where code = 'TEST-1';
        raise exception 'FAIL: notion_sync_status update allowed';
  exception when sqlstate '42501' then null; end;
  begin update public.cultures set notion_page_id = 'forged' where code = 'TEST-1';
        raise exception 'FAIL: notion_page_id update allowed';
  exception when sqlstate '42501' then null; end;
  begin update public.cultures set notion_synced_at = now() where code = 'TEST-1';
        raise exception 'FAIL: notion_synced_at update allowed';
  exception when sqlstate '42501' then null; end;
  begin update public.cultures set notion_sync_error = 'x' where code = 'TEST-1';
        raise exception 'FAIL: notion_sync_error update allowed';
  exception when sqlstate '42501' then null; end;
end $$;

-- 3. colonne métier toujours modifiable dans le périmètre RLS
do $$ declare n int; begin
  update public.cultures set code = 'TEST-1b' where code = 'TEST-1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: business update affected % rows', n; end if;
end $$;

-- 4. création avec métadonnées falsifiées : remise à l'état initial
do $$ declare r record; begin
  insert into public.cultures(organization_id, code, notion_page_id, notion_sync_status, notion_synced_at, notion_sync_error)
  values ('00000000-0000-0000-0000-0000000000a1', 'TEST-2', 'forged', 'synced', now(), 'x');
  select * into r from public.cultures where code = 'TEST-2';
  if r.notion_page_id is not null or r.notion_sync_status <> 'pending'
     or r.notion_synced_at is not null or r.notion_sync_error is not null then
    raise exception 'FAIL: forged insert kept notion_* values';
  end if;
end $$;

-- 5. insertion dans une autre organisation : refusée par la RLS
do $$ begin
  begin insert into public.cultures(organization_id, code)
        values ('00000000-0000-0000-0000-0000000000a2', 'TEST-X');
        raise exception 'FAIL: cross-org insert allowed';
  exception when sqlstate '42501' then null; end;
end $$;

-- 6. utilisateur d'une autre organisation : ne voit ni ne modifie rien
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
do $$ declare n int; begin
  update public.cultures set code = 'hack';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: other-org update affected % rows', n; end if;
end $$;
reset role;

-- 7. service_role (fonction Edge) : succès et erreurs de synchronisation enregistrés
set role service_role;
do $$ declare r record; begin
  update public.cultures
     set notion_page_id = 'page-1', notion_sync_status = 'synced',
         notion_synced_at = now(), notion_sync_error = null
   where code = 'TEST-1b';
  update public.cultures
     set notion_sync_status = 'error', notion_sync_error = 'Notion create failed'
   where code = 'TEST-2';
  select * into r from public.cultures where code = 'TEST-1b';
  if r.notion_page_id <> 'page-1' or r.notion_sync_status <> 'synced' then
    raise exception 'FAIL: service_role sync write lost'; end if;
  select * into r from public.cultures where code = 'TEST-2';
  if r.notion_sync_status <> 'error' then raise exception 'FAIL: service_role error write lost'; end if;
end $$;
reset role;

-- 8. anonyme : aucune ligne modifiée (pas de politique)
set role anon;
do $$ declare n int; begin
  update public.cultures set notion_sync_status = 'pending';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: anon update affected % rows', n; end if;
end $$;
reset role;

-- 9. retour arrière : supprime la protection sans toucher aux données
drop trigger cultures_protect_notion_cols on public.cultures;
drop function private.protect_cultures_notion_cols();
do $$ begin
  if (select count(*) from public.cultures) <> 2 then raise exception 'FAIL: rollback lost rows'; end if;
end $$;

\echo OK: protect_cultures_notion_cols tests passed
