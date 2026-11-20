-- Schedule the private Notion retry worker every five minutes.
-- The job remains dormant until the service-role JWT is stored in Supabase Vault.
do $$
declare
  v_command text := $command$
    select net.http_post(
      url := 'https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/store-order-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || decrypted_secret
      ),
      body := '{}'::jsonb
    )
    from vault.decrypted_secrets
    where name = 'store_sync_service_role_jwt'
      and decrypted_secret is not null
      and decrypted_secret <> '';
  $command$;
  v_job_id bigint;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return;
  end if;

  for v_job_id in
    select jobid from cron.job where jobname = 'ba-labs-store-order-sync'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'ba-labs-store-order-sync',
    '*/5 * * * *',
    v_command
  );
end
$$;
