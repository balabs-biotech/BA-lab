-- Verify sensitive RPCs use a pinned catalog-only search_path.
do $$
declare
  v_iot regprocedure := 'public.ingest_iot_payload(uuid,text,text,jsonb)'::regprocedure;
  v_bio regprocedure := 'public.record_biological_operation(uuid,uuid,text,timestamp with time zone,text,jsonb,text[])'::regprocedure;
  v_iot_config text[];
  v_bio_config text[];
begin
  select p.proconfig into v_iot_config from pg_proc p where p.oid = v_iot::oid;
  select p.proconfig into v_bio_config from pg_proc p where p.oid = v_bio::oid;

  if not coalesce(v_iot_config @> array['search_path=pg_catalog'], false) then
    raise exception 'ingest_iot_payload must pin search_path to pg_catalog';
  end if;
  if not coalesce(v_bio_config @> array['search_path=pg_catalog'], false) then
    raise exception 'record_biological_operation must pin search_path to pg_catalog';
  end if;

  if has_function_privilege('anon', v_iot, 'EXECUTE')
     or has_function_privilege('authenticated', v_iot, 'EXECUTE')
     or not has_function_privilege('service_role', v_iot, 'EXECUTE') then
    raise exception 'ingest_iot_payload must remain service_role-only';
  end if;
  if has_function_privilege('anon', v_bio, 'EXECUTE')
     or not has_function_privilege('authenticated', v_bio, 'EXECUTE') then
    raise exception 'record_biological_operation execute grants changed unexpectedly';
  end if;
end
$$;
