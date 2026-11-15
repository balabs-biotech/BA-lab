
create table if not exists public.engine_registry (
  id uuid primary key default gen_random_uuid(),
  engine_code text not null unique
    check (engine_code ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)*$'),
  domain text not null
    check (domain in ('mycology','greentech','lab','environmental','core')),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  description text,
  contract_version text not null check (length(contract_version) between 1 and 32),
  implementation_version text not null check (length(implementation_version) between 1 and 64),
  execution_mode text not null default 'worker'
    check (execution_mode in ('worker','edge_function','scheduled')),
  entrypoint text not null check (length(trim(entrypoint)) between 1 and 200),
  input_schema jsonb not null default '{"type":"object"}'::jsonb
    check (jsonb_typeof(input_schema) = 'object'),
  output_schema jsonb not null default '{"type":"object"}'::jsonb
    check (jsonb_typeof(output_schema) = 'object'),
  capabilities text[] not null default '{}',
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  timeout_seconds integer not null default 120
    check (timeout_seconds between 5 and 3600),
  max_attempts integer not null default 3
    check (max_attempts between 1 and 20),
  status text not null default 'draft'
    check (status in ('draft','active','disabled','retired')),
  health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','degraded','unavailable')),
  last_healthcheck_at timestamptz,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engine_registry_scope_code_unique unique (organization_id, engine_code)
);

create index if not exists engine_registry_domain_status_idx
  on public.engine_registry(domain, status);
create index if not exists engine_registry_org_idx
  on public.engine_registry(organization_id);

alter table public.engine_registry enable row level security;

drop policy if exists engine_registry_select on public.engine_registry;
create policy engine_registry_select on public.engine_registry
  for select to authenticated
  using (
    organization_id is null
    or private.is_org_member(organization_id)
  );

revoke all on public.engine_registry from anon, authenticated;
grant select on public.engine_registry to authenticated;
grant all on public.engine_registry to service_role;

insert into public.engine_registry (
  engine_code, domain, display_name, description,
  contract_version, implementation_version, execution_mode, entrypoint,
  input_schema, output_schema, capabilities, config,
  timeout_seconds, max_attempts, status
)
values
(
  'core.orchestrator', 'core', 'Core Orchestrator',
  'Dispatches versioned engine jobs and records execution outcomes.',
  '1.0', '1.0.0', 'worker', 'core.orchestrator:run',
  '{"type":"object","required":["engine_code","contract_version","payload"]}'::jsonb,
  '{"type":"object","required":["status"]}'::jsonb,
  array['job_dispatch','retry','lease_management','execution_audit'],
  '{"supports_idempotency":true,"supports_correlation_id":true}'::jsonb,
  90, 3, 'active'
),
(
  'mycology.interpreter', 'mycology', 'Mycology Interpreter',
  'Interprets mycological culture observations against versioned biological profiles.',
  '1.0', '0.1.0', 'worker', 'engines.mycology:run',
  '{"type":"object","required":["culture_id","observations"]}'::jsonb,
  '{"type":"object","required":["findings","evidence","confidence"]}'::jsonb,
  array['culture_interpretation','growth_context','fruiting_context','strain_context'],
  '{"profile_registry":"domain_interpretation_profiles"}'::jsonb,
  180, 3, 'draft'
),
(
  'greentech.interpreter', 'greentech', 'GreenTech Interpreter',
  'Interprets plant culture observations and environmental measurements.',
  '1.0', '0.1.0', 'worker', 'engines.greentech:run',
  '{"type":"object","required":["plant_culture_id","observations"]}'::jsonb,
  '{"type":"object","required":["findings","evidence","confidence"]}'::jsonb,
  array['plant_culture_interpretation','growth_context','environment_context'],
  '{"profile_registry":"domain_interpretation_profiles"}'::jsonb,
  180, 3, 'draft'
),
(
  'lab.interpreter', 'lab', 'Laboratory Interpreter',
  'Interprets laboratory culture observations, measurements and conservation context.',
  '1.0', '0.1.0', 'worker', 'engines.lab:run',
  '{"type":"object","required":["sample_id","observations"]}'::jsonb,
  '{"type":"object","required":["findings","evidence","confidence"]}'::jsonb,
  array['laboratory_interpretation','culture_monitoring','conservation_context'],
  '{"profile_registry":"domain_interpretation_profiles"}'::jsonb,
  180, 3, 'draft'
),
(
  'environmental.context', 'environmental', 'Environmental Context Engine',
  'Normalizes and contextualizes weather, satellite and sensor observations.',
  '1.0', '0.1.0', 'worker', 'engines.environmental:run',
  '{"type":"object","required":["location_id","time_window"]}'::jsonb,
  '{"type":"object","required":["context","sources","quality"]}'::jsonb,
  array['weather_context','satellite_context','ndvi_context','sensor_context'],
  '{"observation_table":"environmental_observations","context_profiles":"environment_context_profiles"}'::jsonb,
  240, 3, 'draft'
)
on conflict (engine_code) do update
set domain = excluded.domain,
    display_name = excluded.display_name,
    description = excluded.description,
    contract_version = excluded.contract_version,
    execution_mode = excluded.execution_mode,
    entrypoint = excluded.entrypoint,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    capabilities = excluded.capabilities,
    config = excluded.config,
    timeout_seconds = excluded.timeout_seconds,
    max_attempts = excluded.max_attempts,
    updated_at = now();

;
