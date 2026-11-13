-- Schedule the queue consumer only after its Vault secret and Supabase HTTP extensions exist.
do $engine_dispatch_schedule$
declare
  v_has_secret boolean := false;
  v_command text := $dispatch_command$
    select net.http_post(
      url := 'https://axcouwiodqsauwnsiotn.supabase.co/functions/v1/engine-queue-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ba-dispatch-secret',
          (select decrypted_secret
           from vault.decrypted_secrets
           where name = 'ba_labs_engine_dispatch_secret'
           limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $dispatch_command$;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and exists (select 1 from pg_extension where extname = 'pg_net')
    and to_regnamespace('cron') is not null
    and to_regclass('vault.decrypted_secrets') is not null
    and to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
    execute
      'select exists (select 1 from vault.decrypted_secrets where name = $1 and length(decrypted_secret) >= 32)'
      into v_has_secret
      using 'ba_labs_engine_dispatch_secret';

    if v_has_secret then
      execute 'select cron.unschedule(jobid) from cron.job where jobname = $1'
        using 'ba-labs-engine-queue-dispatch';
      execute 'select cron.schedule($1, $2, $3)'
        using 'ba-labs-engine-queue-dispatch', '* * * * *', v_command;
    end if;
  end if;
end;
$engine_dispatch_schedule$;

comment on function public.claim_engine_executions(text,integer,integer,uuid,uuid) is
  'Service-only atomic queue claim used by the authenticated orchestrator and scheduled background dispatcher.';
