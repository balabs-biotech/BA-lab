-- Client roles must use validated RPCs instead of mutating audit tables directly.
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['events','measurements','observations','results','provenance'] loop
    foreach p in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege('authenticated', format('public.%I',t), p) then
        raise exception 'authenticated retains % privilege on public.%', p, t;
      end if;
      if has_table_privilege('anon', format('public.%I',t), p) then
        raise exception 'anon retains % privilege on public.%', p, t;
      end if;
    end loop;
  end loop;

  if not has_function_privilege('authenticated','public.record_manual_measurement(jsonb,jsonb,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.record_manual_observation(jsonb,jsonb,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.record_biological_operation(uuid,uuid,text,uuid,timestamp with time zone,text,jsonb,text[])','EXECUTE')
     or not has_function_privilege('authenticated','public.record_experiment_result(uuid,uuid,text,text,jsonb,text,uuid,timestamp with time zone)','EXECUTE')
     or not has_function_privilege('authenticated','public.create_experiment_with_units(uuid,text,text,jsonb,jsonb,uuid,timestamp with time zone)','EXECUTE') then
    raise exception 'Expected authenticated RPC execution grants are missing';
  end if;
end
$$;
