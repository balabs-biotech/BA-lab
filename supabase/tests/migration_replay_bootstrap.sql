-- Minimal Supabase-compatible auth objects for replaying the full migration chain.
-- This database is disposable CI PostgreSQL, never the production project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- Supabase Vault compatibility shim for CI migration replay.
-- Production provides vault.decrypted_secrets through the Vault extension.
-- This empty local table only satisfies function-definition dependencies; no secret is seeded.
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text
);

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
