-- Link device-originated measurements to their physical environment and device.
-- Additive migration: existing manual measurements remain valid (NULL linkage).

alter table public.measurements
  add column if not exists environment_id uuid,
  add column if not exists iot_device_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_org_environment_fk'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_org_environment_fk
      foreign key (organization_id, environment_id)
      references public.environments(organization_id, id)
      on delete set null (environment_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'measurements_org_iot_device_fk'
      and conrelid = 'public.measurements'::regclass
  ) then
    alter table public.measurements
      add constraint measurements_org_iot_device_fk
      foreign key (organization_id, iot_device_id)
      references public.iot_devices(organization_id, id)
      on delete set null (iot_device_id);
  end if;
end $$;

create index if not exists measurements_iot_environment_time_idx
  on public.measurements (organization_id, environment_id, measured_at desc)
  where iot_device_id is not null;

create index if not exists measurements_iot_device_time_idx
  on public.measurements (organization_id, iot_device_id, measured_at desc)
  where iot_device_id is not null;

comment on column public.measurements.environment_id is
  'Physical environment associated with the measurement; populated for environment-level IoT readings.';
comment on column public.measurements.iot_device_id is
  'Originating registered IoT device; NULL for manually entered measurements.';
