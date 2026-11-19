-- BA Labs public storefront: isolated guest enquiry storage.
-- CultureOps tenant-scoped orders are intentionally untouched.

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  order_ref text not null unique,
  status text not null default 'new'
    check (status in ('new','qualifying','contacted','quote_sent','confirmed','preparing','shipped','closed','on_hold','cancelled')),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_organization text,
  customer_wilaya text,
  delivery_mode text not null
    check (delivery_mode in ('À définir','Retrait sur place','Livraison','Expédition')),
  customer_message text,
  locale text not null default 'fr'
    check (locale in ('fr','en','ar','pt')),
  total_quantity integer not null default 0 check (total_quantity >= 1),
  estimated_total_dzd numeric(12,2),
  notion_page_id text,
  notion_sync_status text not null default 'pending'
    check (notion_sync_status in ('pending','synced','failed')),
  notion_sync_attempts integer not null default 0 check (notion_sync_attempts >= 0),
  notion_sync_error text,
  notion_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_code text not null,
  product_title text not null,
  product_family text not null check (product_family in ('liquid','agar','spawn')),
  quantity integer not null check (quantity between 1 and 100),
  unit_price_dzd numeric(12,2),
  price_confirmed boolean not null default false,
  line_total_dzd numeric(12,2),
  created_at timestamptz not null default now(),
  check (
    (price_confirmed = true and unit_price_dzd is not null and line_total_dzd is not null)
    or
    (price_confirmed = false and line_total_dzd is null)
  )
);

create index if not exists store_orders_created_at_idx
  on public.store_orders (created_at desc);
create index if not exists store_orders_notion_sync_idx
  on public.store_orders (notion_sync_status, created_at);
create index if not exists store_order_items_order_id_idx
  on public.store_order_items (order_id);

alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

revoke all on table public.store_orders from public, anon, authenticated;
revoke all on table public.store_order_items from public, anon, authenticated;
grant select, insert, update, delete on table public.store_orders to service_role;
grant select, insert, update, delete on table public.store_order_items to service_role;

create or replace function public.create_store_order(
  p_request_id uuid,
  p_customer jsonb,
  p_items jsonb,
  p_locale text default 'fr'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.store_orders%rowtype;
  v_item jsonb;
  v_order_id uuid;
  v_order_ref text;
  v_total_quantity integer;
  v_estimated_total numeric(12,2);
  v_all_prices_confirmed boolean;
  v_duplicate boolean := false;
begin
  if p_request_id is null then
    raise exception 'request_id_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_customer) <> 'object'
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 20 then
    raise exception 'invalid_order_payload' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_customer->>'name',''))) < 2
     or length(trim(coalesce(p_customer->>'phone',''))) < 6
     or coalesce(p_customer->>'deliveryMode','') not in ('À définir','Retrait sur place','Livraison','Expédition')
     or coalesce(p_locale,'fr') not in ('fr','en','ar','pt') then
    raise exception 'invalid_customer_fields' using errcode = '22023';
  end if;

  select coalesce(sum((x->>'quantity')::integer),0)::integer,
         bool_and(coalesce((x->>'price_confirmed')::boolean,false)
                  and nullif(x->>'unit_price_dzd','') is not null)
    into v_total_quantity, v_all_prices_confirmed
  from jsonb_array_elements(p_items) as x;

  if v_total_quantity < 1 or v_total_quantity > 2000 then
    raise exception 'invalid_total_quantity' using errcode = '22023';
  end if;

  v_all_prices_confirmed := coalesce(v_all_prices_confirmed,false);
  if v_all_prices_confirmed then
    select sum((x->>'quantity')::numeric * (x->>'unit_price_dzd')::numeric)
      into v_estimated_total
    from jsonb_array_elements(p_items) as x;
  else
    v_estimated_total := null;
  end if;

  select id, order_ref
    into v_order_id, v_order_ref
  from public.store_orders
  where request_id = p_request_id;

  if found then
    v_duplicate := true;
    return jsonb_build_object(
      'id', v_order_id,
      'order_ref', v_order_ref,
      'duplicate', true
    );
  end if;

  v_order_id := gen_random_uuid();
  v_order_ref := 'BA-' ||
    to_char(clock_timestamp() at time zone 'UTC','YYYYMMDD') || '-' ||
    upper(substr(replace(v_order_id::text,'-',''),1,6));

  insert into public.store_orders (
    id, request_id, order_ref, customer_name, customer_phone,
    customer_email, customer_organization, customer_wilaya,
    delivery_mode, customer_message, locale, total_quantity,
    estimated_total_dzd
  ) values (
    v_order_id, p_request_id, v_order_ref,
    trim(p_customer->>'name'),
    trim(p_customer->>'phone'),
    nullif(lower(trim(p_customer->>'email')),''),
    nullif(trim(p_customer->>'organization'),''),
    nullif(trim(p_customer->>'wilaya'),''),
    p_customer->>'deliveryMode',
    nullif(trim(p_customer->>'message'),''),
    coalesce(p_locale,'fr'),
    v_total_quantity,
    v_estimated_total
  )
  on conflict (request_id) do nothing;

  if not found then
    select id, order_ref
      into v_order_id, v_order_ref
    from public.store_orders
    where request_id = p_request_id;
    return jsonb_build_object(
      'id', v_order_id,
      'order_ref', v_order_ref,
      'duplicate', true
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if length(trim(coalesce(v_item->>'product_code',''))) = 0
       or length(trim(coalesce(v_item->>'product_title',''))) = 0
       or coalesce(v_item->>'product_family','') not in ('liquid','agar','spawn')
       or coalesce((v_item->>'quantity')::integer,0) not between 1 and 100 then
      raise exception 'invalid_order_item' using errcode = '22023';
    end if;

    insert into public.store_order_items (
      order_id, product_code, product_title, product_family,
      quantity, unit_price_dzd, price_confirmed, line_total_dzd
    ) values (
      v_order_id,
      trim(v_item->>'product_code'),
      trim(v_item->>'product_title'),
      v_item->>'product_family',
      (v_item->>'quantity')::integer,
      case when v_item->>'price_confirmed' = 'true'
        then (v_item->>'unit_price_dzd')::numeric else null end,
      coalesce((v_item->>'price_confirmed')::boolean,false),
      case when v_item->>'price_confirmed' = 'true'
        then ((v_item->>'quantity')::numeric * (v_item->>'unit_price_dzd')::numeric)
        else null end
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'order_ref', v_order_ref,
    'duplicate', false,
    'estimated_total_dzd', v_estimated_total
  );
end;
$$;

revoke all on function public.create_store_order(uuid,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_store_order(uuid,jsonb,jsonb,text) to service_role;
