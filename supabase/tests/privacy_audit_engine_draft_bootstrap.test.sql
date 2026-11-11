-- Test-only prerequisites for applying the Privacy & Audit Engine draft
-- in the disposable PostgreSQL 17 migration-replay CI database.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end
$$;

alter table auth.users
  add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

create schema if not exists private;
