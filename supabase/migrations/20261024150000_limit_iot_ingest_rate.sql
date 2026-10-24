-- Bound authenticated IoT ingestion volume per registered device.
-- One row per device; the counter is capped to avoid unbounded growth.
create table if not exists public.iot_device_rate_limits (
  device_id uuid primary key references public.iot_devices(id) on delete cascade,
  window_started_at timestamptz not null default clock_timestamp(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.iot_device_rate_limits enable row level security;
revoke all on table public.iot_device_rate_limits from public, anon, authenticated;
grant all on table public.iot_device_rate_limits to service_role;

create or replace function public.allow_iot_ingest_request(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  -- Fixed 60-second window, maximum 120 requests per registered device.
  -- The upsert serializes concurrent requests on the device's primary key.
  insert into public.iot_device_rate_limits(device_id, window_started_at, request_count)
  values (p_device_id, v_now, 1)
  on conflict (device_id) do update
    set window_started_at = case
          when public.iot_device_rate_limits.window_started_at <= v_now - interval '60 seconds'
          then v_now
          else public.iot_device_rate_limits.window_started_at
        end,
        request_count = case
          when public.iot_device_rate_limits.window_started_at <= v_now - interval '60 seconds'
          then 1
          else least(public.iot_device_rate_limits.request_count + 1, 121)
        end
  returning request_count into v_count;

  return v_count <= 120;
end;
$$;

revoke all on function public.allow_iot_ingest_request(uuid) from public, anon, authenticated;
grant execute on function public.allow_iot_ingest_request(uuid) to service_role;
