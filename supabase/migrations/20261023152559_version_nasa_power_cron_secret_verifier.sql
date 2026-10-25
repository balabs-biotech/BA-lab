-- Version the verifier used by the scheduled NASA POWER import.
-- The actual high-entropy value remains in Supabase Vault and is never stored in migrations.
create or replace function public.verify_nasa_power_cron_secret(p_candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select decrypted_secret = p_candidate
      from vault.decrypted_secrets
      where name = 'ba_labs_nasa_power_cron_secret'
      limit 1
    ),
    false
  );
$function$;

revoke all on function public.verify_nasa_power_cron_secret(text) from public;
revoke all on function public.verify_nasa_power_cron_secret(text) from anon, authenticated;
grant execute on function public.verify_nasa_power_cron_secret(text) to service_role;

comment on function public.verify_nasa_power_cron_secret(text) is
  'Internal constant-time-ish equality check for the scheduled NASA POWER import secret; executable only by service_role.';
