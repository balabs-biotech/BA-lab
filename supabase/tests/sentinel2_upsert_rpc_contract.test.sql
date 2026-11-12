DO $$
DECLARE
  v_function regprocedure;
  v_source text;
  v_security_definer boolean;
BEGIN
  v_function := to_regprocedure(
    'public.upsert_satellite_environmental_observations(jsonb)'
  );
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Sentinel-2 persistence RPC is missing';
  END IF;

  SELECT p.prosrc, p.prosecdef
  INTO v_source, v_security_definer
  FROM pg_proc p
  WHERE p.oid = v_function;

  IF NOT v_security_definer THEN
    RAISE EXCEPTION 'Sentinel-2 persistence RPC must be SECURITY DEFINER';
  END IF;
  IF position('ON CONFLICT' IN upper(v_source)) = 0
     OR position('WHERE DATA_FAMILY = ''SATELLITE''' IN upper(v_source)) = 0 THEN
    RAISE EXCEPTION 'Sentinel-2 persistence RPC must infer the partial satellite unique index';
  END IF;
  IF position('SOURCE_RECORD_ID' IN upper(v_source)) = 0 THEN
    RAISE EXCEPTION 'Sentinel-2 persistence RPC must include scene identity in its conflict key';
  END IF;

  IF has_function_privilege(
    'authenticated',
    v_function,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated users must not execute the privileged Sentinel-2 persistence RPC';
  END IF;
  IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous users must not execute the privileged Sentinel-2 persistence RPC';
  END IF;
  IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Service role must execute the Sentinel-2 persistence RPC';
  END IF;
  v_function := to_regprocedure(
    'public.upsert_weather_environmental_observations(jsonb)'
  );
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'NASA POWER weather persistence RPC is missing';
  END IF;
  SELECT p.prosrc, p.prosecdef
  INTO v_source, v_security_definer
  FROM pg_proc p
  WHERE p.oid = v_function;
  IF NOT v_security_definer
     OR position('ON CONFLICT' IN upper(v_source)) = 0
     OR position('WHERE DATA_FAMILY = ''WEATHER''' IN upper(v_source)) = 0 THEN
    RAISE EXCEPTION 'Weather persistence RPC must infer the partial weather unique index';
  END IF;
  IF has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR has_function_privilege('anon', v_function, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Weather persistence RPC privileges are not restricted to service_role';
  END IF;

END
$;
