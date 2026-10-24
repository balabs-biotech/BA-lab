-- Reconstructed from the production migration ledger entry for version 20261023023224.
-- The original migration created the verifier, provisioned its Vault secret, and scheduled the importer.
-- Secret material is generated at deployment time; no value is stored in source control.
-- Generic PostgreSQL CI environments without Supabase Vault/pg_cron/pg_net skip this integration block.

do $migration$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is null
     or to_regclass('vault.decrypted_secrets') is null
     or to_regclass('net.http_post') is null
     or to_regprocedure('vault.create_secret(text,text,text,uuid)') is null then
    raise notice 'Supabase Vault, pg_cron, or pg_net unavailable; skipping NASA POWER scheduler setup in this environment';
    return;
  end if;

  execute $function$
    create or replace function public.verify_nasa_power_cron_secret(p_candidate text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select coalesce(
        (select decrypted_secret = p_candidate
         from vault.decrypted_secrets
         where name = 'ba_labs_nasa_power_cron_secret'
         limit 1),
        false
      );
    $body$;
  $function$;

  execute 'revoke all on function public.verify_nasa_power_cron_secret(text) from public, anon, authenticated';
  execute 'grant execute on function public.verify_nasa_power_cron_secret(text) to service_role';

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'ba_labs_nasa_power_cron_secret'
  ) then
    execute $secret$
      select vault.create_secret(
        encode(gen_random_bytes(32), 'hex'),
        'ba_labs_nasa_power_cron_secret',
        'Shared secret for scheduled NASA POWER imports from Supabase Cron',
        null
      )
    $secret$;
  end if;

  execute 'select jobid from cron.job where jobname = $1 limit 1'
    into existing_job_id
    using 'ba-labs-nasa-power-daily';

  if existing_job_id is not null then
    execute 'select cron.unschedule($1)' using existing_job_id;
  end if;

  execute $schedule$
    select cron.schedule(
      'ba-labs-nasa-power-daily',
      '30 4 * * *',
      $job$
        select net.http_post(
          url := 'https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/nasa-power-scheduled-import',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-ba-cron-secret', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'ba_labs_nasa_power_cron_secret'
              limit 1
            )
          ),
          body := jsonb_build_object('trigger', 'cron'),
          timeout_milliseconds := 120000
        );
      $job$
    )
  $schedule$;
end
$migration$;
