-- Complete the measurement-to-device FK after the IoT registry migration.
-- Production already has this relationship; this is idempotent there and fixes clean replay order.
do $migration$
begin
  if to_regclass('public.iot_devices') is null then
    raise exception 'public.iot_devices must exist before adding measurements_org_iot_device_fk';
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
end
$migration$;
