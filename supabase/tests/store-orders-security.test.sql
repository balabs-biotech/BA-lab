begin;

do $$
declare
  v_first jsonb;
  v_retry jsonb;
  v_quote jsonb;
  v_order_id uuid;
  v_order_count integer;
  v_item_count integer;
  v_estimate numeric;
  v_rls_orders boolean;
  v_rls_items boolean;
  v_definer boolean;
begin
  if has_table_privilege('anon','public.store_orders','select')
     or has_table_privilege('authenticated','public.store_orders','select')
     or has_table_privilege('anon','public.store_order_items','select')
     or has_table_privilege('authenticated','public.store_order_items','select') then
    raise exception 'Public roles must not read storefront orders';
  end if;

  if not has_table_privilege('service_role','public.store_orders','select')
     or not has_table_privilege('service_role','public.store_orders','insert')
     or not has_table_privilege('service_role','public.store_orders','update')
     or not has_table_privilege('service_role','public.store_order_items','select')
     or not has_table_privilege('service_role','public.store_order_items','insert') then
    raise exception 'service_role must retain backend table privileges';
  end if;

  if has_function_privilege('anon','public.create_store_order(uuid,jsonb,jsonb,text)','execute')
     or has_function_privilege('authenticated','public.create_store_order(uuid,jsonb,jsonb,text)','execute')
     or not has_function_privilege('service_role','public.create_store_order(uuid,jsonb,jsonb,text)','execute') then
    raise exception 'Store order RPC grants are not least-privilege';
  end if;

  select c.relrowsecurity into v_rls_orders
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='store_orders';
  select c.relrowsecurity into v_rls_items
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='store_order_items';
  if not coalesce(v_rls_orders,false) or not coalesce(v_rls_items,false) then
    raise exception 'RLS must be enabled on both storefront tables';
  end if;

  select p.prosecdef into v_definer
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_store_order';
  if not coalesce(v_definer,false) then
    raise exception 'Atomic insert RPC must run with its restricted owner privileges';
  end if;

  v_first := public.create_store_order(
    '8f83b0df-2c0d-4c77-90b5-2fd95a3c9c2a'::uuid,
    '{"name":"Contract test","phone":"+213555000000","deliveryMode":"À définir","wilaya":"Sétif"}'::jsonb,
    '[{"product_code":"BAL-PETRI-INOC-001","product_title":"Boîte de Pétri inoculée · 1 souche","product_family":"agar","quantity":2,"unit_price_dzd":2000,"price_confirmed":true}]'::jsonb,
    'fr'
  );

  if v_first->>'duplicate' <> 'false' or v_first->>'estimated_total_dzd' <> '4000' then
    raise exception 'Fixed-price request did not produce the expected 4,000 DZD estimate: %', v_first;
  end if;

  v_order_id := (v_first->>'id')::uuid;
  select count(*) into v_order_count from public.store_orders where id=v_order_id;
  select count(*) into v_item_count from public.store_order_items where order_id=v_order_id;
  select estimated_total_dzd into v_estimate from public.store_orders where id=v_order_id;
  if v_order_count <> 1 or v_item_count <> 1 or v_estimate <> 4000 then
    raise exception 'Atomic order/item snapshot was not stored correctly';
  end if;

  v_retry := public.create_store_order(
    '8f83b0df-2c0d-4c77-90b5-2fd95a3c9c2a'::uuid,
    '{"name":"Contract test retry","phone":"+213555000000","deliveryMode":"À définir"}'::jsonb,
    '[{"product_code":"BAL-PETRI-INOC-001","product_title":"Boîte de Pétri inoculée · 1 souche","product_family":"agar","quantity":2,"unit_price_dzd":2000,"price_confirmed":true}]'::jsonb,
    'fr'
  );
  if v_retry->>'duplicate' <> 'true' then
    raise exception 'Repeated request_id must be idempotent';
  end if;
  select count(*) into v_item_count from public.store_order_items where order_id=v_order_id;
  if v_item_count <> 1 then
    raise exception 'Idempotent retry must not duplicate order items';
  end if;

  v_quote := public.create_store_order(
    '9f83b0df-2c0d-4c77-90b5-2fd95a3c9c2b'::uuid,
    '{"name":"Quote-only test","phone":"+213555000001","deliveryMode":"À définir"}'::jsonb,
    '[{"product_code":"BAL-LC-SYR-10ML-001","product_title":"Seringue de culture liquide · 10 ml","product_family":"liquid","quantity":1,"unit_price_dzd":5000,"price_confirmed":false}]'::jsonb,
    'fr'
  );
  if v_quote ? 'estimated_total_dzd' and v_quote->'estimated_total_dzd' <> 'null'::jsonb then
    raise exception 'Indicative price must not become a confirmed estimate';
  end if;
end $$;

rollback;
