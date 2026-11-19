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
    'store_order_events',
    'store_checkout_rate_limits'
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

    IF v_table <> 'store_checkout_rate_limits' AND (
      NOT has_table_privilege('service_role', v_oid, 'SELECT')
      OR NOT has_table_privilege('service_role', v_oid, 'INSERT')
    ) THEN
      RAISE EXCEPTION 'service_role must be able to read and insert public.%', v_table;
    END IF;

    IF v_table = 'store_checkout_rate_limits' AND (
      has_table_privilege('service_role', v_oid, 'SELECT')
      OR has_table_privilege('service_role', v_oid, 'INSERT')
      OR has_table_privilege('service_role', v_oid, 'UPDATE')
      OR has_table_privilege('service_role', v_oid, 'DELETE')
    ) THEN
      RAISE EXCEPTION 'rate-limit table must only be writable through its controlled RPC';
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

BEGIN;
DO $integration$
DECLARE
  v_product_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_quote jsonb;
  v_order public.store_orders%ROWTYPE;
  v_allowed boolean;
  v_tracking jsonb;
  v_hash bytea := decode(repeat('a', 64), 'hex');
  v_idem bytea := decode(repeat('b', 64), 'hex');
BEGIN
  IF NOT has_function_privilege('service_role',
    'public.create_store_guest_order(jsonb,jsonb,bytea,bytea)', 'EXECUTE')
    OR has_function_privilege('anon',
    'public.create_store_guest_order(jsonb,jsonb,bytea,bytea)', 'EXECUTE')
    OR has_function_privilege('authenticated',
    'public.create_store_guest_order(jsonb,jsonb,bytea,bytea)', 'EXECUTE') THEN
    RAISE EXCEPTION 'guest-order RPC execution grants are not least-privilege';
  END IF;

  IF NOT has_function_privilege('service_role',
    'public.consume_store_checkout_rate_limit(bytea,integer,integer)', 'EXECUTE')
    OR has_function_privilege('anon',
    'public.consume_store_checkout_rate_limit(bytea,integer,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated',
    'public.consume_store_checkout_rate_limit(bytea,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rate-limit RPC execution grants are not least-privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.create_store_guest_order(jsonb,jsonb,bytea,bytea)'::regprocedure
      AND proconfig @> ARRAY['search_path=""']
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.consume_store_checkout_rate_limit(bytea,integer,integer)'::regprocedure
      AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'security-definer commerce RPCs must pin an empty search_path';
  END IF;

  SELECT id INTO v_product_id FROM public.store_products
  WHERE product_code = 'BAL-CUL-AGAR-001';

  INSERT INTO public.store_variants (
    product_id, variant_code, label_i18n, unit_code, pack_quantity,
    price_mode, price_dzd, availability
  ) VALUES (
    v_product_id, 'TEST-AGAR-UNIT',
    '{"fr":"Unité test","en":"Test unit"}'::jsonb,
    'unit', 1, 'fixed', 2000, 'available'
  );

  v_result := public.create_store_guest_order(
    jsonb_build_object(
      'customer_name', 'Test Customer',
      'customer_phone', '0550000000',
      'delivery_mode', 'pickup',
      'locale', 'fr',
      'terms_accepted', true,
      'terms_version', 'test-terms-v1',
      'privacy_notice_version', 'test-privacy-v1',
      'marketing_opt_in', false
    ),
    jsonb_build_array(jsonb_build_object(
      'product_code', 'BAL-CUL-AGAR-001',
      'variant_code', 'TEST-AGAR-UNIT',
      'quantity', 2
    )),
    v_hash,
    v_idem
  );

  SELECT * INTO v_order FROM public.store_orders
  WHERE id = (v_result->>'order_id')::uuid;

  IF v_order.total_dzd <> 4000 OR v_order.subtotal_dzd <> 4000
    OR v_order.delivery_fee_dzd <> 0 THEN
    RAISE EXCEPTION 'database price calculation failed: %', row_to_json(v_order);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.store_order_items
    WHERE order_id = v_order.id
      AND unit_price_dzd = 2000
      AND line_total_dzd = 4000
  ) THEN
    RAISE EXCEPTION 'order item must preserve the database price snapshot';
  END IF;

  IF NOT has_function_privilege('service_role',
    'public.lookup_store_guest_order(text,bytea)', 'EXECUTE')
    OR has_function_privilege('anon',
    'public.lookup_store_guest_order(text,bytea)', 'EXECUTE')
    OR has_function_privilege('authenticated',
    'public.lookup_store_guest_order(text,bytea)', 'EXECUTE') THEN
    RAISE EXCEPTION 'guest tracking RPC execution grants are not least-privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.lookup_store_guest_order(text,bytea)'::regprocedure
      AND proconfig @> ARRAY['search_path=""']
  ) THEN
    RAISE EXCEPTION 'guest tracking RPC must pin an empty search_path';
  END IF;

  v_tracking := public.lookup_store_guest_order(v_order.order_code, v_hash);
  IF v_tracking IS NULL
    OR v_tracking->>'status' <> 'pending_confirmation'
    OR v_tracking ? 'customer_phone'
    OR v_tracking ? 'customer_email'
    OR v_tracking ? 'delivery_address' THEN
    RAISE EXCEPTION 'guest tracking must return order state only, without customer PII';
  END IF;

  IF public.lookup_store_guest_order(v_order.order_code, decode(repeat('f', 64), 'hex')) IS NOT NULL THEN
    RAISE EXCEPTION 'guest tracking must reject an invalid token hash';
  END IF;

  v_replay := public.create_store_guest_order(
    jsonb_build_object(
      'customer_name', 'Test Customer',
      'customer_phone', '0550000000',
      'delivery_mode', 'pickup',
      'locale', 'fr',
      'terms_accepted', true,
      'terms_version', 'test-terms-v1',
      'privacy_notice_version', 'test-privacy-v1',
      'marketing_opt_in', false
    ),
    jsonb_build_array(jsonb_build_object(
      'product_code', 'BAL-CUL-AGAR-001',
      'variant_code', 'TEST-AGAR-UNIT',
      'quantity', 2
    )),
    v_hash,
    v_idem
  );

  IF (v_replay->>'idempotent_replay')::boolean IS NOT TRUE
    OR v_replay->>'order_code' <> v_result->>'order_code'
    OR (SELECT count(*) FROM public.store_orders WHERE idempotency_key_hash = v_idem) <> 1 THEN
    RAISE EXCEPTION 'guest-order idempotency contract failed';
  END IF;

  v_quote := public.create_store_guest_order(
    jsonb_build_object(
      'customer_name', 'Quote Customer',
      'customer_phone', '0550000001',
      'delivery_mode', 'pickup',
      'locale', 'fr',
      'terms_accepted', true,
      'terms_version', 'test-terms-v1',
      'privacy_notice_version', 'test-privacy-v1',
      'marketing_opt_in', false
    ),
    jsonb_build_array(jsonb_build_object(
      'product_code', 'BAL-LC-PPU-ETE-001',
      'quantity', 1
    )),
    decode(repeat('c', 64), 'hex'),
    decode(repeat('d', 64), 'hex')
  );

  IF (SELECT total_dzd FROM public.store_orders WHERE id = (v_quote->>'order_id')::uuid) IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.store_order_items
      WHERE order_id = (v_quote->>'order_id')::uuid
        AND price_mode = 'quote'
        AND unit_price_dzd IS NULL
    ) THEN
    RAISE EXCEPTION 'quote-only products must not receive invented prices';
  END IF;

  v_allowed := public.consume_store_checkout_rate_limit(decode(repeat('e', 64), 'hex'), 2, 600);
  IF v_allowed IS NOT TRUE THEN RAISE EXCEPTION 'first rate-limited request should pass'; END IF;
  v_allowed := public.consume_store_checkout_rate_limit(decode(repeat('e', 64), 'hex'), 2, 600);
  IF v_allowed IS NOT TRUE THEN RAISE EXCEPTION 'second rate-limited request should pass'; END IF;
  v_allowed := public.consume_store_checkout_rate_limit(decode(repeat('e', 64), 'hex'), 2, 600);
  IF v_allowed IS NOT FALSE THEN RAISE EXCEPTION 'third rate-limited request should be blocked'; END IF;
END
$integration$;
ROLLBACK;

SELECT 'BA Labs Store guest-order, pricing, idempotency and rate-limit contract: PASS' AS result;
