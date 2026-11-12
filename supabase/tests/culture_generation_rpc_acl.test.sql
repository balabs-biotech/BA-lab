-- Ensure culture-generation RPC cannot be invoked by anonymous clients.
\set ON_ERROR_STOP on

DO $rpc_acl$
DECLARE
  v_function oid := to_regprocedure(
    'public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamp with time zone,jsonb)'
  );
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'FAIL: create_culture_with_generation is missing';
  END IF;

  IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute create_culture_with_generation';
  END IF;

  IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: authenticated lost execute on create_culture_with_generation';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = v_function) THEN
    RAISE EXCEPTION 'FAIL: create_culture_with_generation must remain SECURITY INVOKER';
  END IF;
END
$rpc_acl$;
