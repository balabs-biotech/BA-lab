-- Strengthen tenant referential integrity and activated profile immutability.
alter table public.environment_context_profiles
  add constraint environment_context_profiles_org_id_unique unique (organization_id, id);

alter table public.environment_context_profile_sensors
  add constraint environment_context_profile_sensors_profile_tenant_fk
  foreign key (organization_id, profile_id)
  references public.environment_context_profiles(organization_id, id)
  on delete cascade;

create or replace function private.guard_activated_profile_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status in ('active', 'retired') then
    raise exception 'activated profile versions cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists environment_context_profiles_no_delete on public.environment_context_profiles;
create trigger environment_context_profiles_no_delete
before delete on public.environment_context_profiles
for each row execute function private.guard_activated_profile_delete();

drop trigger if exists domain_interpretation_profiles_no_delete on public.domain_interpretation_profiles;
create trigger domain_interpretation_profiles_no_delete
before delete on public.domain_interpretation_profiles
for each row execute function private.guard_activated_profile_delete();

create or replace function private.guard_profile_sensor_binding_draft_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_profile_id uuid;
  target_status text;
begin
  target_profile_id := case when tg_op = 'DELETE' then old.profile_id else new.profile_id end;
  select status into target_status
  from public.environment_context_profiles
  where id = target_profile_id;
  if target_status is distinct from 'draft' then
    raise exception 'sensor bindings can only change while the profile is draft';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists environment_context_profile_sensors_draft_only on public.environment_context_profile_sensors;
create trigger environment_context_profile_sensors_draft_only
before insert or update or delete on public.environment_context_profile_sensors
for each row execute function private.guard_profile_sensor_binding_draft_only();
