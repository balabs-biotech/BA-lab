begin;

do $$
begin
  if has_function_privilege('anon', 'public.claim_store_order_sync(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.claim_store_order_sync(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_store_order_sync(integer)', 'EXECUTE') then
    raise exception 'claim RPC grants are not least-privilege';
  end if;
  if has_function_privilege('anon', 'public.complete_store_order_sync(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.complete_store_order_sync(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.complete_store_order_sync(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'complete RPC grants are not least-privilege';
  end if;
  if has_function_privilege('anon', 'public.fail_store_order_sync(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.fail_store_order_sync(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fail_store_order_sync(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'failure RPC grants are not least-privilege';
  end if;
end
$$;

create temporary table retry_claims (payload jsonb);

insert into public.store_orders (
  request_id, order_ref, customer_name, customer_phone, delivery_mode,
  total_quantity, notion_sync_status, notion_sync_next_attempt_at
) values (
  gen_random_uuid(), 'BA-TEST-RETRY-CLAIM', 'Synthetic test', '+213000000000',
  'À définir', 1, 'pending', now() - interval '1 minute'
);

insert into retry_claims select * from public.claim_store_order_sync(10);

do $$
begin
  if (select count(*) from retry_claims) <> 1 then
    raise exception 'claim RPC did not claim exactly one due request';
  end if;
  if (select count(*) from public.claim_store_order_sync(10)) <> 0 then
    raise exception 'claimed request was not protected against a second claim';
  end if;
end
$$;

do $$
declare
  payload jsonb;
  order_id uuid;
  lock_token uuid;
  completed boolean;
begin
  select retry_claims.payload into payload from retry_claims limit 1;
  order_id := (payload->'order'->>'id')::uuid;
  lock_token := (payload->'order'->>'notion_sync_lock_token')::uuid;
  completed := public.complete_store_order_sync(order_id, lock_token, 'synthetic-notion-page');
  if not completed then
    raise exception 'valid lock owner could not complete sync';
  end if;
  if not exists (
    select 1 from public.store_orders
    where id = order_id and notion_sync_status = 'synced'
      and notion_sync_locked_until is null and notion_sync_lock_token is null
      and notion_sync_next_attempt_at is null
  ) then
    raise exception 'completed sync did not clear retry state';
  end if;
end
$$;

truncate retry_claims;

insert into public.store_orders (
  request_id, order_ref, customer_name, customer_phone, delivery_mode,
  total_quantity, notion_sync_status, notion_sync_next_attempt_at
) values (
  gen_random_uuid(), 'BA-TEST-RETRY-FAIL', 'Synthetic test', '+213000000000',
  'À définir', 1, 'pending', now() - interval '1 minute'
);

insert into retry_claims select * from public.claim_store_order_sync(10);

do $$
declare
  payload jsonb;
  order_id uuid;
  lock_token uuid;
  failed boolean;
begin
  select retry_claims.payload into payload from retry_claims limit 1;
  order_id := (payload->'order'->>'id')::uuid;
  lock_token := (payload->'order'->>'notion_sync_lock_token')::uuid;
  failed := public.fail_store_order_sync(order_id, lock_token, 'synthetic_failure');
  if not failed then
    raise exception 'valid lock owner could not defer failed sync';
  end if;
  if not exists (
    select 1 from public.store_orders
    where id = order_id and notion_sync_status = 'pending'
      and notion_sync_attempts = 1
      and notion_sync_next_attempt_at between now() + interval '50 seconds' and now() + interval '70 seconds'
      and notion_sync_locked_until is null and notion_sync_lock_token is null
  ) then
    raise exception 'failed sync did not enter the expected bounded backoff state';
  end if;
end
$$;

rollback;
