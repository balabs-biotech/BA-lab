-- Schedule the NASA POWER importer daily at 04:30 UTC.
-- The high-entropy secret is stored in Supabase Vault, never in this migration.
-- Plain PostgreSQL test containers may not include pg_cron; skip scheduling there.
do $migration$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is unavailable in this PostgreSQL environment; skipping scheduled job setup';
    return;
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
