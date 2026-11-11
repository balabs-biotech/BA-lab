-- Explicit, versioned target/reference sensor pairs for relative drift screening.
-- A single-sensor trend is not sufficient evidence of instrument drift.
-- Policies are tenant/environment bound and immutable after activation.

create table public.sensor_drift_reference_policies (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  environment_id uuid not null,
  target_sensor_id uuid not null,
  reference_sensor_id uuid not null,
  variable_code text not null references public.variables(code) on delete restrict,
  valid_from date not null,
  valid_to date,
  maximum_pair_offset_seconds integer not null,
  minimum_pairs integer not null,
  minimum_duration_seconds integer not null,
  maximum_abs_drift_rate_per_hour double precision not null,
  reference_binding_verified boolean not null default false,
  reference_verification_method text,
  reference_verification_evidence text,
  reference_verified_at timestamptz,
  reference_verified_by uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  primary key (organization_id, id),
  constraint sensor_drift_reference_policies_environment_fk
    foreign key (organization_id, environment_id)
    references public.environments (organization_id, id) on delete cascade,
  constraint sensor_drift_reference_policies_target_device_fk
    foreign key (organization_id, environment_id, target_sensor_id)
    references public.iot_devices (organization_id, environment_id, id) on delete restrict,
  constraint sensor_drift_reference_policies_reference_device_fk
    foreign key (organization_id, environment_id, reference_sensor_id)
    references public.iot_devices (organization_id, environment_id, id) on delete restrict,
  constraint sensor_drift_reference_policies_distinct_sensors_check
    check (target_sensor_id <> reference_sensor_id),
  constraint sensor_drift_reference_policies_validity_check
    check (valid_to is null or valid_to >= valid_from),
  constraint sensor_drift_reference_policies_pair_offset_check
    check (maximum_pair_offset_seconds between 1 and 86400),
  constraint sensor_drift_reference_policies_minimum_pairs_check
    check (minimum_pairs between 3 and 5000),
  constraint sensor_drift_reference_policies_minimum_duration_check
    check (minimum_duration_seconds between 1 and 2592000),
  constraint sensor_drift_reference_policies_maximum_rate_check
    check (
      maximum_abs_drift_rate_per_hour > 0
      and maximum_abs_drift_rate_per_hour < 'Infinity'::double precision
    ),
  constraint sensor_drift_reference_policies_verification_check
    check (
      (not reference_binding_verified and reference_verified_at is null and reference_verified_by is null)
      or (
        reference_binding_verified
        and reference_verification_method in (
          'co_located', 'calibration_certificate', 'manufacturer_reference', 'other'
        )
        and length(btrim(coalesce(reference_verification_evidence, ''))) between 1 and 2000
        and reference_verified_at is not null
        and reference_verified_by is not null
      )
    )
);

create unique index sensor_drift_reference_policies_one_active_target_variable_idx
  on public.sensor_drift_reference_policies (
    organization_id, environment_id, target_sensor_id, variable_code
  )
  where status = 'active';

create index sensor_drift_reference_policies_scope_idx
  on public.sensor_drift_reference_policies (
    organization_id, environment_id, valid_from, valid_to
  );

alter table public.sensor_drift_reference_policies enable row level security;

create policy sensor_drift_reference_policies_select
  on public.sensor_drift_reference_policies
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy sensor_drift_reference_policies_insert
  on public.sensor_drift_reference_policies
  for insert to authenticated
  with check (private.is_org_writer(organization_id) and status = 'draft');

create policy sensor_drift_reference_policies_update
  on public.sensor_drift_reference_policies
  for update to authenticated
  using (private.is_org_writer(organization_id))
  with check (private.is_org_writer(organization_id));

create policy sensor_drift_reference_policies_delete
  on public.sensor_drift_reference_policies
  for delete to authenticated
  using (private.is_org_writer(organization_id) and status = 'draft');

revoke all on public.sensor_drift_reference_policies from public, anon;
grant select, insert, update, delete on public.sensor_drift_reference_policies to authenticated;
grant select, insert, update, delete on public.sensor_drift_reference_policies to service_role;

-- Reuse the same draft -> active -> retired immutable-version lifecycle used by
-- environmental and biological interpretation profiles.
create trigger sensor_drift_reference_policies_version_guard
  before insert or update or delete on public.sensor_drift_reference_policies
  for each row execute function private.guard_versioned_environmental_profile();

create or replace function private.validate_sensor_drift_reference_policy()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'active' and not new.reference_binding_verified then
    raise exception 'sensor_drift_reference_must_be_verified_before_activation'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.reference_binding_verified then
    raise exception 'sensor_drift_reference_must_be_verified_after_draft_creation'
      using errcode = '23514';
  elsif tg_op = 'UPDATE' and new.reference_binding_verified and not old.reference_binding_verified then
    -- Verification is a distinct, auditable step. Activation must be a later update.
    if new.status <> 'draft' then
      raise exception 'sensor_drift_reference_must_remain_draft_during_verification'
        using errcode = '23514';
    end if;
    if auth.uid() is null then
      raise exception 'authenticated_reference_verifier_required'
        using errcode = '42501';
    end if;
    new.reference_verified_at := now();
    new.reference_verified_by := auth.uid();
  elsif tg_op = 'UPDATE' and old.reference_binding_verified and (
    new.organization_id is distinct from old.organization_id
    or new.environment_id is distinct from old.environment_id
    or new.target_sensor_id is distinct from old.target_sensor_id
    or new.reference_sensor_id is distinct from old.reference_sensor_id
    or new.variable_code is distinct from old.variable_code
  ) then
    -- The evidence attests to this exact physical binding; changing it requires
    -- a new draft and a new verification record.
    raise exception 'sensor_drift_reference_binding_cannot_change_after_verification'
      using errcode = '23514';
  elsif new.reference_binding_verified and (
    new.reference_verification_method is distinct from old.reference_verification_method
    or new.reference_verification_evidence is distinct from old.reference_verification_evidence
    or new.reference_verified_at is distinct from old.reference_verified_at
    or new.reference_verified_by is distinct from old.reference_verified_by
  ) then
    raise exception 'sensor_drift_reference_verification_is_immutable'
      using errcode = '23514';
  elsif tg_op = 'UPDATE' and old.reference_binding_verified and not new.reference_binding_verified then
    raise exception 'sensor_drift_reference_verification_cannot_be_revoked'
      using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    select 1
      from public.sensor_drift_reference_policies p
     where p.organization_id = new.organization_id
       and p.environment_id = new.environment_id
       and p.target_sensor_id = new.target_sensor_id
       and p.variable_code = new.variable_code
       and p.id <> new.id
       and p.status <> 'draft'
       and daterange(p.valid_from, coalesce(p.valid_to, 'infinity'::date), '[]')
           && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'sensor_drift_reference_policy_validity_overlaps_existing_version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger sensor_drift_reference_policies_validate
  before insert or update on public.sensor_drift_reference_policies
  for each row execute function private.validate_sensor_drift_reference_policy();

revoke all on function private.validate_sensor_drift_reference_policy()
  from public, anon, authenticated;

comment on table public.sensor_drift_reference_policies is
  'Versioned, tenant/environment-scoped target/reference sensor pairs and explicit relative-drift policies. A reference requires auditable verification before activation.';
comment on column public.sensor_drift_reference_policies.reference_verification_evidence is
  'Human-readable evidence locator or verification note; do not store calibration certificates or other sensitive documents inline.';
