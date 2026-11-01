-- Contract for authenticated SECURITY DEFINER batch/culture write RPCs.
-- These endpoints intentionally bypass table RLS for atomic multi-table writes,
-- but must enforce the tenant writer predicate and never be callable by anon.
\set ON_ERROR_STOP on

DO $rpc_contract$
DECLARE
  v_signature text;
  v_oid oid;
  v_definition text;
  v_config text[];
  v_signatures text[] := ARRAY[
    'public.advance_batch_stage(uuid,text)',
    'public.create_batch_with_stages(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamp with time zone,numeric,text,text[])',
    'public.move_batch_to_location(uuid,uuid,uuid,text)',
    'public.record_batch_harvest(uuid,numeric,text,text)',
    'public.record_biological_operation(uuid,uuid,text,timestamp with time zone,text,jsonb,text[])',
    'public.record_manual_measurement(jsonb,jsonb)',
    'public.record_manual_observation(jsonb,jsonb)',
    'public.release_batch(uuid)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_signatures LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'FAIL: expected RPC is missing: %', v_signature;
    END IF;

    SELECT p.proconfig, pg_get_functiondef(p.oid)
      INTO v_config, v_definition
    FROM pg_proc p
    WHERE p.oid = v_oid;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'FAIL: expected SECURITY DEFINER RPC changed: %', v_signature;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon can execute protected RPC: %', v_signature;
    END IF;

    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: authenticated lost required RPC access: %', v_signature;
    END IF;

    IF NOT coalesce(v_config @> ARRAY['search_path=pg_catalog, public'], false)
       AND NOT coalesce(v_config @> ARRAY['search_path=pg_catalog'], false)
       AND NOT coalesce(v_config @> ARRAY['search_path=pg_catalog, public, private'], false) THEN
      RAISE EXCEPTION 'FAIL: RPC search_path is not pinned to pg_catalog first: % (%)',
        v_signature, v_config;
    END IF;

    IF position('is_org_writer' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'FAIL: RPC does not call the tenant writer guard: %', v_signature;
    END IF;
  END LOOP;
END
$rpc_contract$;
