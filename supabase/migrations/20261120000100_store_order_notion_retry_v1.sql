-- Durable, concurrency-safe retries for the storefront's Notion mirror.
alter table public.store_orders
  add column if not exists notion_sync_next_attempt_at timestamptz not null default (now() + interval '10 minutes'),
  add column if not exists notion_sync_locked_until timestamptz,
  add column if not exists notion_sync_lock_token uuid;

alter table public.store_orders
  drop constraint if exists store_orders_notion_sync_status_check;
alter table public.store_orders
  add constraint store_orders_notion_sync_status_check
  check (notion_sync_status in ('pending','processing','synced','failed'));

create index if not exists store_orders_notion_retry_idx
  on public.store_orders (notion_sync_next_attempt_at, created_at)
  where notion_sync_status in ('pending','processing');

create or replace function public.claim_store_order_sync(p_limit integer default 10)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 20 then
    raise exception 'invalid_claim_limit' using errcode = '22023';
  end if;

  update public.store_orders
  set notion_sync_status = 'failed',
      notion_sync_locked_until = null,
      notion_sync_lock_token = null,
      notion_sync_error = coalesce(notion_sync_error, 'retry_limit_reached'),
      updated_at = pg_catalog.now()
  where notion_sync_attempts >= 8
    and (
      (notion_sync_status = 'pending' and notion_sync_next_attempt_at <= pg_catalog.now())
      or (notion_sync_status = 'processing' and notion_sync_locked_until <= pg_catalog.now())
    );

  return query
  with candidates as (
    select id
    from public.store_orders
    where notion_sync_attempts < 8
      and (
        (notion_sync_status = 'pending' and notion_sync_next_attempt_at <= pg_catalog.now())
        or (notion_sync_status = 'processing' and notion_sync_locked_until <= pg_catalog.now())
      )
    order by notion_sync_next_attempt_at asc, created_at asc
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.store_orders as orders
    set notion_sync_status = 'processing',
        notion_sync_attempts = orders.notion_sync_attempts + 1,
        notion_sync_lock_token = extensions.uuid_generate_v4(),
        notion_sync_locked_until = pg_catalog.now() + interval '5 minutes',
        updated_at = pg_catalog.now()
    from candidates
    where orders.id = candidates.id
    returning orders.*
  )
  select pg_catalog.jsonb_build_object(
    'order', pg_catalog.to_jsonb(claimed),
    'items', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(items) order by items.id)
      from public.store_order_items as items
      where items.order_id = claimed.id
    ), '[]'::jsonb)
  )
  from claimed;
end;
$$;

create or replace function public.complete_store_order_sync(
  p_order_id uuid,
  p_lock_token uuid,
  p_notion_page_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_order_id is null or p_lock_token is null
     or nullif(pg_catalog.btrim(p_notion_page_id), '') is null then
    raise exception 'invalid_sync_completion' using errcode = '22023';
  end if;

  update public.store_orders
  set notion_sync_status = 'synced',
      notion_page_id = p_notion_page_id,
      notion_sync_error = null,
      notion_sync_next_attempt_at = null,
      notion_sync_locked_until = null,
      notion_sync_lock_token = null,
      notion_synced_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_order_id
    and notion_sync_status = 'processing'
    and notion_sync_lock_token = p_lock_token;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.fail_store_order_sync(
  p_order_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_order_id is null or p_lock_token is null then
    raise exception 'invalid_sync_failure' using errcode = '22023';
  end if;

  update public.store_orders
  set notion_sync_status = case when notion_sync_attempts >= 8 then 'failed' else 'pending' end,
      notion_sync_error = left(coalesce(nullif(p_error, ''), 'notion_sync_failed'), 180),
      notion_sync_next_attempt_at = case
        when notion_sync_attempts >= 8 then null
        else pg_catalog.now() + case notion_sync_attempts
          when 1 then interval '1 minute'
          when 2 then interval '5 minutes'
          when 3 then interval '15 minutes'
          when 4 then interval '1 hour'
          when 5 then interval '6 hours'
          else interval '24 hours'
        end
      end,
      notion_sync_locked_until = null,
      notion_sync_lock_token = null,
      updated_at = pg_catalog.now()
  where id = p_order_id
    and notion_sync_status = 'processing'
    and notion_sync_lock_token = p_lock_token;

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_store_order_sync(integer) from public, anon, authenticated;
revoke all on function public.complete_store_order_sync(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.fail_store_order_sync(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_store_order_sync(integer) to service_role;
grant execute on function public.complete_store_order_sync(uuid,uuid,text) to service_role;
grant execute on function public.fail_store_order_sync(uuid,uuid,text) to service_role;
