-- Contract checks for the writer-only sensor drift management read model.
\set ON_ERROR_STOP on

do $$
declare
  v_function oid := to_regprocedure('public.list_sensor_drift_management_devices(uuid,uuid)');
  v_definition text;
begin
  if v_function is null then
    raise exception 'FAIL: sensor drift management read model is missing';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE') then
    raise exception 'FAIL: anonymous/public execution must remain disabled';
  end if;

  if not has_function_privilege('authenticated', v_function, 'EXECUTE')
     or not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'FAIL: authenticated and service-role execution grants are required';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  if position('private.is_org_writer' in v_definition) = 0
     or position('auth.uid() is null' in v_definition) = 0
     or position('p.status = ''active''' in v_definition) = 0
     or position('p.origin = ''sensor''' in v_definition) = 0
     or position('d.enabled' in v_definition) = 0
     or position('left join public.iot_devices' in v_definition) = 0
     or position('environment_context_profile_sensors' in v_definition) = 0 then
    raise exception 'FAIL: read model must be writer-only and expose enabled state only for devices bound to the active sensor profile';
  end if;

  if (select prosecdef from pg_proc where oid = v_function) is not true then
    raise exception 'FAIL: read model must execute with controlled definer privileges';
  end if;
end
$$;

select 'PASS: sensor drift management read model contract' as result;
