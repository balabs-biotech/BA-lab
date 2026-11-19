-- Persistent, privacy-minimizing rate limits for the public storefront endpoint.
create table if not exists public.store_checkout_rate_limits (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1),
  updated_at timestamptz not null default now()
);

create index if not exists store_checkout_rate_limits_updated_at_idx
  on public.store_checkout_rate_limits (updated_at);

alter table public.store_checkout_rate_limits enable row level security;
revoke all on table public.store_checkout_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.store_checkout_rate_limits to service_role;

create or replace function public.consume_store_rate_limit(
  p_fingerprint text,
  p_limit integer default 5,
  p_window_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 100
     or p_window_seconds not between 60 and 86400 then
    raise exception 'invalid_rate_limit_arguments' using errcode = '22023';
  end if;

  insert into public.store_checkout_rate_limits as current_bucket (
    fingerprint, window_started_at, request_count, updated_at
  ) values (
    p_fingerprint, v_now, 1, v_now
  )
  on conflict (fingerprint) do update
  set
    window_started_at = case
      when current_bucket.window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
      then v_now else current_bucket.window_started_at end,
    request_count = case
      when current_bucket.window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
      then 1 else current_bucket.request_count + 1 end,
    updated_at = v_now
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_store_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_store_rate_limit(text,integer,integer) to service_role;
