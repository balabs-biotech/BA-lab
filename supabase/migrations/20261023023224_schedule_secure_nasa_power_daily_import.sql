-- Schedule the NASA POWER importer daily at 04:30 UTC.
-- The high-entropy secret is stored in Supabase Vault, never in this migration.
do $migration$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'ba-labs-nasa-power-daily'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
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
  );
end
$migration$;
