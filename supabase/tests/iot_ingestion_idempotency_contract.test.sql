-- Contract test: IoT ingestion must distinguish identical retries from payload conflicts.
\set ON_ERROR_STOP on

do $$
declare
  v_definition text;
  v_proc regprocedure := 'public.ingest_iot_payload(uuid,text,text,jsonb)'::regprocedure;
begin
  select pg_get_functiondef(v_proc) into v_definition;

  if v_definition not ilike '%message_id_payload_mismatch%' then
    raise exception 'FAIL: IoT RPC does not reject message ID reuse with different payload';
  end if;
  if v_definition not ilike '%existing_payload_sha256 is distinct from p_payload_sha256%' then
    raise exception 'FAIL: IoT RPC does not compare stored and incoming payload hashes';
  end if;
  if not has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'FAIL: service_role cannot execute IoT ingestion RPC';
  end if;
  if has_function_privilege('anon', v_proc, 'EXECUTE')
     or has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'FAIL: client role can execute privileged IoT ingestion RPC';
  end if;
end
$$;

select 'IoT idempotency contract passed' as result;
