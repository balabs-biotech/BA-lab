
insert into public.engine_registry (
  engine_code, domain, display_name, description,
  contract_version, implementation_version, execution_mode, entrypoint,
  input_schema, output_schema, capabilities, config,
  timeout_seconds, max_attempts, status, health_status
)
values (
  'environmental.nasapower.dailyimport',
  'environmental',
  'NASA POWER Daily Import',
  'Imports gridded daily agroclimate observations into environmental_observations after verifying authenticated organization membership and write role.',
  '1.0',
  '7',
  'edge_function',
  'nasa-power-agroclimate',
  '{"type":"object","required":["location_id","start_date","end_date"],"properties":{"location_id":{"type":"string","format":"uuid"},"start_date":{"type":"string","format":"date"},"end_date":{"type":"string","format":"date"},"refresh":{"type":"boolean"}}}'::jsonb,
  '{"type":"object","required":["ok","provider","location_id"],"properties":{"ok":{"type":"boolean"},"cached":{"type":"boolean"},"provider":{"const":"NASA POWER"},"records":{"type":"integer"},"variables":{"type":"array","items":{"type":"string"}}}}'::jsonb,
  array['weather_context','daily_agroclimate','temperature','precipitation','humidity','wind','solar_radiation','uv_index','cache_validation'],
  '{"provider":"NASA_POWER","dataset":"POWER_DAILY_AGRO","observation_table":"environmental_observations","endpoint":"nasa-power-agroclimate","gridded_estimate":true,"not_local_measurement":true}'::jsonb,
  45, 2, 'active', 'unknown'
)
on conflict (engine_code) do update
set domain = excluded.domain,
    display_name = excluded.display_name,
    description = excluded.description,
    contract_version = excluded.contract_version,
    implementation_version = excluded.implementation_version,
    execution_mode = excluded.execution_mode,
    entrypoint = excluded.entrypoint,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    capabilities = excluded.capabilities,
    config = excluded.config,
    timeout_seconds = excluded.timeout_seconds,
    max_attempts = excluded.max_attempts,
    status = excluded.status,
    updated_at = now();
;
