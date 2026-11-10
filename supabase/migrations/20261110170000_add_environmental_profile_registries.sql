-- Versioned, tenant-scoped registries used by persisted environmental interpretation.
-- Profiles are created as drafts, activated once, and immutable after activation.
-- Retiring an active version closes its validity interval without rewriting its content.

create table public.environment_context_profiles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  environment_id uuid not null,
  profile_code text not null check (length(btrim(profile_code)) between 1 and 100),
  profile_version text not null check (length(btrim(profile_version)) between 1 and 32),
  context_type text not null check (context_type in ('outdoor', 'greenhouse', 'fruiting_chamber', 'laboratory')),
  label text not null check (length(btrim(label)) between 1 and 120),
  timezone text not null check (length(btrim(timezone)) between 1 and 64),
  origin text not null check (origin in ('sensor', 'weather_provider', 'satellite', 'manual')),
  valid_from date not null,
  valid_to date,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  primary key (organization_id, id),
  constraint environment_context_profiles_environment_fk
    foreign key (organization_id, environment_id)
    references public.environments (organization_id, id) on delete restrict,
  constraint environment_context_profiles_version_key
    unique (organization_id, environment_id, profile_code, profile_version),
  constraint environment_context_profiles_sensor_parent_key
    unique (organization_id, id, environment_id),
  constraint environment_context_profiles_validity_check
    check (valid_to is null or valid_to >= valid_from),
  constraint environment_context_profiles_gridded_origin_check
    check (origin not in ('weather_provider', 'satellite') or context_type = 'outdoor')
);


-- Normalize sensor bindings so tenant and environment identity are enforced by
-- composite foreign keys rather than an unvalidated UUID array.
alter table public.iot_devices
  add constraint iot_devices_org_environment_id_key
  unique (organization_id, environment_id, id);

create table public.environment_context_profile_sensors (
  organization_id uuid not null,
  profile_id uuid not null,
  environment_id uuid not null,
  sensor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id, sensor_id),
  constraint environment_context_profile_sensors_profile_fk
    foreign key (organization_id, profile_id, environment_id)
    references public.environment_context_profiles (organization_id, id, environment_id)
    on delete cascade,
  constraint environment_context_profile_sensors_device_fk
    foreign key (organization_id, environment_id, sensor_id)
    references public.iot_devices (organization_id, environment_id, id)
    on delete restrict
);

create index environment_context_profile_sensors_device_idx
  on public.environment_context_profile_sensors (organization_id, environment_id, sensor_id);

alter table public.environment_context_profile_sensors enable row level security;
create policy environment_context_profile_sensors_select
  on public.environment_context_profile_sensors
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy environment_context_profile_sensors_insert
  on public.environment_context_profile_sensors
  for insert to authenticated
  with check (
    private.is_org_writer(organization_id)
    and exists (
      select 1 from public.environment_context_profiles p
       where p.organization_id = environment_context_profile_sensors.organization_id
         and p.id = environment_context_profile_sensors.profile_id
         and p.environment_id = environment_context_profile_sensors.environment_id
         and p.status = 'draft'
         and p.origin = 'sensor'
    )
  );
create policy environment_context_profile_sensors_delete
  on public.environment_context_profile_sensors
  for delete to authenticated
  using (
    private.is_org_writer(organization_id)
    and exists (
      select 1 from public.environment_context_profiles p
       where p.organization_id = environment_context_profile_sensors.organization_id
         and p.id = environment_context_profile_sensors.profile_id
         and p.environment_id = environment_context_profile_sensors.environment_id
         and p.status = 'draft'
    )
  );

revoke all on public.environment_context_profile_sensors from public, anon;
grant select, insert, delete on public.environment_context_profile_sensors to authenticated;
grant select, insert, update, delete on public.environment_context_profile_sensors to service_role;

create unique index environment_context_profiles_one_active_per_environment_idx
  on public.environment_context_profiles (organization_id, environment_id)
  where status = 'active';
create index environment_context_profiles_environment_validity_idx
  on public.environment_context_profiles (organization_id, environment_id, valid_from, valid_to);

create table public.domain_interpretation_profiles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  domain text not null,
  profile_code text not null check (length(btrim(profile_code)) between 1 and 100),
  profile_version text not null check (length(btrim(profile_version)) between 1 and 32),
  rules jsonb not null default '[]'::jsonb,
  valid_from date not null,
  valid_to date,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  primary key (organization_id, id),
  constraint domain_interpretation_profiles_domain_check
    check (domain in ('mycology', 'greentech', 'lab')),
  constraint domain_interpretation_profiles_version_key
    unique (organization_id, domain, profile_code, profile_version),
  constraint domain_interpretation_profiles_validity_check
    check (valid_to is null or valid_to >= valid_from),
  constraint domain_interpretation_profiles_rules_array_check
    check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 500),
  constraint domain_interpretation_profiles_rules_objects_check
    check (not jsonb_path_exists(rules, '$[*] ? (@.type() != "object")'))
);

create unique index domain_interpretation_profiles_one_active_per_domain_idx
  on public.domain_interpretation_profiles (organization_id, domain)
  where status = 'active';
create index domain_interpretation_profiles_domain_validity_idx
  on public.domain_interpretation_profiles (organization_id, domain, valid_from, valid_to);

alter table public.environment_context_profiles enable row level security;
alter table public.domain_interpretation_profiles enable row level security;

create policy environment_context_profiles_select
  on public.environment_context_profiles
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy environment_context_profiles_insert
  on public.environment_context_profiles
  for insert to authenticated
  with check (private.is_org_writer(organization_id) and status = 'draft');
create policy environment_context_profiles_update
  on public.environment_context_profiles
  for update to authenticated
  using (private.is_org_writer(organization_id))
  with check (private.is_org_writer(organization_id));
create policy environment_context_profiles_delete
  on public.environment_context_profiles
  for delete to authenticated
  using (private.is_org_writer(organization_id) and status = 'draft');

create policy domain_interpretation_profiles_select
  on public.domain_interpretation_profiles
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy domain_interpretation_profiles_insert
  on public.domain_interpretation_profiles
  for insert to authenticated
  with check (private.is_org_writer(organization_id) and status = 'draft');
create policy domain_interpretation_profiles_update
  on public.domain_interpretation_profiles
  for update to authenticated
  using (private.is_org_writer(organization_id))
  with check (private.is_org_writer(organization_id));
create policy domain_interpretation_profiles_delete
  on public.domain_interpretation_profiles
  for delete to authenticated
  using (private.is_org_writer(organization_id) and status = 'draft');

revoke all on public.environment_context_profiles, public.domain_interpretation_profiles from public, anon;
grant select, insert, update, delete on public.environment_context_profiles to authenticated;
grant select, insert, update, delete on public.domain_interpretation_profiles to authenticated;
grant select, insert, update, delete on public.environment_context_profiles to service_role;
grant select, insert, update, delete on public.domain_interpretation_profiles to service_role;

-- One lifecycle guard is shared by both registries. A published version can only
-- transition to retired; retiring closes its effective interval automatically.
create or replace function private.guard_versioned_environmental_profile()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'published_environmental_profile_is_immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'environmental_profile_must_start_as_draft'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'draft' then
    if new.status not in ('draft', 'active') then
      raise exception 'invalid_environmental_profile_lifecycle_transition'
        using errcode = '23514';
    end if;
    if new.status = 'active' then
      new.activated_at := now();
    end if;
    return new;
  end if;

  if old.status = 'active'
     and new.status = 'retired'
     and (to_jsonb(new) - array['status', 'retired_at', 'valid_to'])
         = (to_jsonb(old) - array['status', 'retired_at', 'valid_to']) then
    new.retired_at := now();
    new.valid_to := greatest(old.valid_from, current_date);
    return new;
  end if;

  raise exception 'published_environmental_profile_is_immutable'
    using errcode = '23514';
end;
$$;

create or replace function private.validate_environment_context_profile()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_location_id uuid;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'environment_profile_timezone_must_be_iana'
      using errcode = '23514';
  end if;

  select e.location_id into v_location_id
    from public.environments e
   where e.organization_id = new.organization_id
     and e.id = new.environment_id;
  if not found or v_location_id is null then
    raise exception 'environment_profile_requires_physical_location'
      using errcode = '23514';
  end if;

  if new.status = 'active' and new.origin = 'sensor' and not exists (
    select 1 from public.environment_context_profile_sensors s
     where s.organization_id = new.organization_id
       and s.profile_id = new.id
       and s.environment_id = new.environment_id
  ) then
    raise exception 'sensor_environment_profile_requires_at_least_one_sensor'
      using errcode = '23514';
  end if;

  if new.status = 'active' and new.origin <> 'sensor' and exists (
    select 1 from public.environment_context_profile_sensors s
     where s.organization_id = new.organization_id
       and s.profile_id = new.id
       and s.environment_id = new.environment_id
  ) then
    raise exception 'non_sensor_environment_profile_cannot_bind_sensors'
      using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    select 1
      from public.environment_context_profiles p
     where p.organization_id = new.organization_id
       and p.environment_id = new.environment_id
       and p.id <> new.id
       and p.status <> 'draft'
       and daterange(p.valid_from, coalesce(p.valid_to, 'infinity'::date), '[]')
           && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'environment_profile_validity_overlaps_existing_version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.guard_environment_context_profile_sensor()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $
declare
  v_status text;
  v_origin text;
  v_organization_id uuid;
  v_profile_id uuid;
  v_environment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_profile_id := old.profile_id;
    v_environment_id := old.environment_id;
  else
    v_organization_id := new.organization_id;
    v_profile_id := new.profile_id;
    v_environment_id := new.environment_id;
  end if;

  select p.status, p.origin into v_status, v_origin
    from public.environment_context_profiles p
   where p.organization_id = v_organization_id
     and p.id = v_profile_id
     and p.environment_id = v_environment_id;

  if not found or v_status <> 'draft' or v_origin <> 'sensor' then
    raise exception 'environment_profile_sensor_binding_requires_sensor_draft'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$;

create or replace function private.validate_domain_interpretation_profile()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_rule jsonb;
begin
  if jsonb_typeof(new.rules) <> 'array' then
    raise exception 'domain_profile_rules_must_be_a_json_array'
      using errcode = '23514';
  end if;

  for v_rule in select value from jsonb_array_elements(new.rules)
  loop
    if not (v_rule ?& array[
      'rule_id', 'variable_code', 'finding_status', 'required_context_tags',
      'signal_code', 'severity', 'message_code'
    ])
       or jsonb_typeof(v_rule->'rule_id') <> 'string'
       or length(btrim(v_rule->>'rule_id')) not between 1 and 100
       or jsonb_typeof(v_rule->'variable_code') <> 'string'
       or length(btrim(v_rule->>'variable_code')) not between 1 and 120
       or jsonb_typeof(v_rule->'finding_status') <> 'string'
       or v_rule->>'finding_status' not in (
         'normal', 'suspect', 'insufficient_history',
         'insufficient_coverage', 'indeterminate'
       )
       or jsonb_typeof(v_rule->'required_context_tags') <> 'array'
       or jsonb_path_exists(v_rule->'required_context_tags', '$[*] ? (@.type() != "string")')
       or jsonb_typeof(v_rule->'signal_code') <> 'string'
       or length(btrim(v_rule->>'signal_code')) not between 1 and 100
       or jsonb_typeof(v_rule->'severity') <> 'string'
       or v_rule->>'severity' not in ('info', 'low', 'moderate', 'high', 'critical')
       or jsonb_typeof(v_rule->'message_code') <> 'string'
       or length(btrim(v_rule->>'message_code')) not between 1 and 120
       or (v_rule ? 'recommendation_code' and v_rule->'recommendation_code' <> 'null'::jsonb
           and (jsonb_typeof(v_rule->'recommendation_code') <> 'string'
                or length(v_rule->>'recommendation_code') > 120)) then
      raise exception 'domain_profile_rule_does_not_match_interpretation_contract'
        using errcode = '23514';
    end if;
  end loop;

  if exists (
    select 1
      from jsonb_array_elements(new.rules) as rule(value)
     group by rule.value->>'rule_id'
    having count(*) > 1
  ) then
    raise exception 'domain_profile_rule_ids_must_be_unique'
      using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    select 1
      from public.domain_interpretation_profiles p
     where p.organization_id = new.organization_id
       and p.domain = new.domain
       and p.id <> new.id
       and p.status <> 'draft'
       and daterange(p.valid_from, coalesce(p.valid_to, 'infinity'::date), '[]')
           && daterange(new.valid_from, coalesce(new.valid_to, 'infinity'::date), '[]')
  ) then
    raise exception 'domain_profile_validity_overlaps_existing_version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger environment_context_profiles_version_guard
  before insert or update or delete on public.environment_context_profiles
  for each row execute function private.guard_versioned_environmental_profile();
create trigger domain_interpretation_profiles_version_guard
  before insert or update or delete on public.domain_interpretation_profiles
  for each row execute function private.guard_versioned_environmental_profile();

create trigger environment_context_profile_sensors_guard
  before insert or update or delete on public.environment_context_profile_sensors
  for each row execute function private.guard_environment_context_profile_sensor();

create trigger environment_context_profiles_validate
  before insert or update on public.environment_context_profiles
  for each row execute function private.validate_environment_context_profile();
create trigger domain_interpretation_profiles_validate
  before insert or update on public.domain_interpretation_profiles
  for each row execute function private.validate_domain_interpretation_profile();

revoke all on function private.guard_versioned_environmental_profile() from public, anon, authenticated;
revoke all on function private.validate_environment_context_profile() from public, anon, authenticated;
revoke all on function private.guard_environment_context_profile_sensor() from public, anon, authenticated;
revoke all on function private.validate_domain_interpretation_profile() from public, anon, authenticated;

comment on table public.environment_context_profiles is
  'Versioned, immutable-after-activation environment metadata required to construct the environmental engine EnvironmentContext.';
comment on table public.domain_interpretation_profiles is
  'Tenant-scoped, versioned domain rules validated against the environmental engine interpretation contract; no defaults are seeded.';
comment on column public.domain_interpretation_profiles.rules is
  'JSON array matching InterpretationRule fields; rule IDs are unique within one immutable profile version.';
