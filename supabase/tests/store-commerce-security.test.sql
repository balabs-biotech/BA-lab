-- BA Labs Store: guest-commerce data boundary and schema contract.
DO $test$
DECLARE
  v_table text;
  v_oid regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'store_products',
    'store_variants',
    'store_orders',
    'store_order_items',
    'store_order_events'
  ] LOOP
    v_oid := to_regclass('public.' || v_table);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Missing commerce table public.%', v_table;
    END IF;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = v_oid) THEN
      RAISE EXCEPTION 'RLS must be enabled on public.%', v_table;
    END IF;

    IF has_table_privilege('anon', v_oid, 'SELECT')
      OR has_table_privilege('anon', v_oid, 'INSERT')
      OR has_table_privilege('anon', v_oid, 'UPDATE')
      OR has_table_privilege('anon', v_oid, 'DELETE') THEN
      RAISE EXCEPTION 'anon must have no direct privileges on public.%', v_table;
    END IF;

    IF has_table_privilege('authenticated', v_oid, 'SELECT')
      OR has_table_privilege('authenticated', v_oid, 'INSERT')
      OR has_table_privilege('authenticated', v_oid, 'UPDATE')
      OR has_table_privilege('authenticated', v_oid, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated must have no direct privileges on public.%', v_table;
    END IF;

    IF NOT has_table_privilege('service_role', v_oid, 'SELECT')
      OR NOT has_table_privilege('service_role', v_oid, 'INSERT') THEN
      RAISE EXCEPTION 'service_role must be able to read and insert public.%', v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('service_role', 'public.store_order_events', 'UPDATE')
    OR has_table_privilege('service_role', 'public.store_order_events', 'DELETE') THEN
    RAISE EXCEPTION 'Commerce order events must be append-only, including for service_role';
  END IF;

  IF has_table_privilege('service_role', 'public.store_order_items', 'UPDATE')
    OR has_table_privilege('service_role', 'public.store_order_items', 'DELETE') THEN
    RAISE EXCEPTION 'Commerce order item price/product snapshots must be immutable';
  END IF;

  IF (SELECT count(*) FROM public.store_products) <> 12 THEN
    RAISE EXCEPTION 'Expected 12 seeded catalogue products, found %',
      (SELECT count(*) FROM public.store_products);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.store_orders'::regclass
      AND conname = 'store_orders_tracking_token_hash_check'
  ) THEN
    RAISE EXCEPTION 'Guest order tracking token must be stored as a 32-byte hash';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.store_variants'::regclass
      AND conname = 'store_variants_price_mode_check'
  ) THEN
    RAISE EXCEPTION 'Variant price mode consistency constraint is missing';
  END IF;
END
$test$;

SELECT 'BA Labs Store commerce security contract: PASS' AS result;
