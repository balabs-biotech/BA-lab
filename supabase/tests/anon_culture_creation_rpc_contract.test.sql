-- Run after the full migration replay against disposable CI PostgreSQL.
\set ON_ERROR_STOP on

DO $assertions$
DECLARE
  rpc regprocedure := to_regprocedure(
    'public.create_culture_with_generation(uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,jsonb)'
  );
BEGIN
  IF rpc IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.create_culture_with_generation is missing';
  END IF;

  IF has_function_privilege('anon', rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute the write-capable culture creation RPC';
  END IF;

  IF has_function_privilege('authenticated', rpc, 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: authenticated lost execute access to the culture creation RPC';
  END IF;
END
$assertions$;
