
create or replace function public.verify_nasa_power_cron_secret(p_candidate text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (select decrypted_secret = p_candidate
     from vault.decrypted_secrets
     where name = 'ba_labs_nasa_power_cron_secret'
     limit 1),
    false
  );
$$;

revoke all on function public.verify_nasa_power_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_nasa_power_cron_secret(text) to service_role;

select vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'ba_labs_nasa_power_cron_secret',
  'Shared secret for scheduled NASA POWER imports from Supabase Cron',
  null
);

select cron.unschedule(jobid) from cron.job where jobname = 'ba-labs-nasa-power-daily';

select cron.schedule(
  'ba-labs-nasa-power-daily',
  '30 4 * * *',
  $job$
  select net.http_post(
    url := 'https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/nasa-power-scheduled-import',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ba-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ba_labs_nasa_power_cron_secret' limit 1)
    ),
    body := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 120000
  );
  $job$
);
;
