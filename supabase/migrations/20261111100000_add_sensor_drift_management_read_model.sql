-- Narrow writer-only read model for configuring verified sensor reference pairs.
-- Browser clients never receive direct SELECT privileges on the IoT device registry.
create or replace function public.list_sensor_drift_management_devices(
  p_organization_id uuid,
  p_environment_id uuid
)
returns table (
  profile_id uuid,
  profile_code text,
  profile_version text,
  profile_status text,
  profile_valid_from date,
  profile_valid_to date,
  sensor_id uuid,
  device_code text,
  device_type text,
  device_enabled boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if auth.uid() is null
     or p_organization_id is null
     or p_environment_id is null
     or not private.is_org_writer(p_organization_id) then
    raise exception 'sensor_drift_management_writer_required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.environments e
     where e.organization_id = p_organization_id
       and e.id = p_environment_id
  ) then
    raise exception 'sensor_drift_management_environment_not_found'
      using errcode = '22023';
  end if;

  return query
  select p.id, p.profile_code, p.profile_version, p.status, p.valid_from, p.valid_to,
         d.id, d.device_code, d.device_type, d.enabled
    from public.environment_context_profiles p
    left join public.environment_context_profile_sensors ps
      on ps.organization_id = p.organization_id
     and ps.profile_id = p.id
     and ps.environment_id = p.environment_id
    left join public.iot_devices d
      on d.organization_id = ps.organization_id
     and d.environment_id = ps.environment_id
     and d.id = ps.sensor_id
   where p.organization_id = p_organization_id
     and p.environment_id = p_environment_id
     and p.origin = 'sensor'
     and p.status in ('active', 'retired')
     and p.id = (
       select candidate.id
         from public.environment_context_profiles candidate
        where candidate.organization_id = p_organization_id
          and candidate.environment_id = p_environment_id
          and candidate.origin = 'sensor'
          and candidate.status in ('active', 'retired')
        order by (candidate.status = 'active') desc,
                 candidate.valid_from desc, candidate.activated_at desc nulls last
        limit 1
     )
   order by d.device_code nulls last, d.id;
end;
$$;

revoke all on function public.list_sensor_drift_management_devices(uuid, uuid)
  from public, anon;
grant execute on function public.list_sensor_drift_management_devices(uuid, uuid)
  to authenticated, service_role;

comment on function public.list_sensor_drift_management_devices(uuid, uuid) is
  'Writer-only read model for sensor drift policy management; exposes only devices bound to the active sensor context profile, never raw IoT registry access.';
