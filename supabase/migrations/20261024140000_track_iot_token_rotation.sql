-- Keep the registry's rotation timestamp truthful whenever a device token hash changes.
-- The plaintext token remains outside the database and is never returned by this trigger.
create or replace function private.track_iot_token_rotation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.token_sha256 is distinct from old.token_sha256 then
    new.token_rotated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists iot_devices_track_token_rotation on public.iot_devices;
create trigger iot_devices_track_token_rotation
before update of token_sha256 on public.iot_devices
for each row
execute function private.track_iot_token_rotation();

revoke all on function private.track_iot_token_rotation() from public, anon, authenticated;
