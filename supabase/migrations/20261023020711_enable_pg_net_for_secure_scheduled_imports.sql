-- Enable pg_net for the trusted scheduled NASA POWER importer.
-- Some local PostgreSQL test images do not ship pg_net; Supabase production does.
-- Never store the cron secret in migration source.
create schema if not exists extensions;

do $migration$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  else
    raise notice 'pg_net is unavailable in this PostgreSQL environment; skipping optional extension setup';
  end if;
end
$migration$;
