# Sensor Engine — existing storage and normalization boundary v1

## Decision

The Sensor Engine must read the existing IoT measurement pipeline. It must not create a second time-series table and must not write sensor readings to `environmental_observations`.

The repository already separates three storage concerns:

- `public.measurements`: quantitative laboratory, manual and IoT measurements. IoT rows are identified by `iot_device_id IS NOT NULL` and `metadata.source = 'iot'`.
- `public.iot_devices` and `public.iot_ingest_receipts`: device identity, environment binding, token hash and idempotent message receipts.
- `public.environmental_observations`: provider-derived weather and satellite observations, with provider/dataset/variable/time provenance. Its `data_family` constraint intentionally excludes sensor telemetry.

Manual qualitative records remain in `public.observations`; they are not a substitute for numeric sensor readings.

## Existing ingestion path

1. An ESP32 sends a bounded JSON payload to `supabase/functions/iot-ingest`.
2. The Edge Function hashes and validates the device token, validates the message and reading envelope, then calls `public.ingest_iot_payload`.
3. The SQL RPC resolves the enabled device, records an idempotency receipt and inserts each reading into `public.measurements` in the same transaction.
4. The inserted measurement carries `organization_id`, `environment_id`, `iot_device_id`, `variable_code`, `raw_value`, `raw_unit_code`, `measured_at`, `method`, `instrument`, `quality_state='raw'` and metadata containing source/message/device lineage.
5. `environment_context_profile_sensors` binds registered devices to a versioned sensor-origin environment profile. It is a configuration relation, not an observation store.

## Canonical read mapping

The Sensor Engine read adapter should query a tenant-scoped, time-bounded join:

| Canonical field | Existing source |
| --- | --- |
| observation_id | `measurements.id` |
| organization_id | `measurements.organization_id` |
| context_id | `measurements.environment_id` (physical environment UUID, never profile row UUID) |
| sensor_id | `measurements.iot_device_id` |
| location_id | `environments.location_id`, joined through organization + environment |
| variable_code | `measurements.variable_code` |
| observed_at | `measurements.measured_at` |
| value / unit_code | normalized pair when both exist; otherwise raw pair only when raw unit equals `variables.canonical_unit_code` |
| source_observation_ids | singleton list containing `measurements.id` for a raw sensor measurement |
| quality | `measurements.quality_state` plus `exclusion_reason`; preserve, do not silently upgrade |
| method / instrument | corresponding measurement columns |
| device metadata | `iot_devices.device_code`, `device_type`, `metadata` |
| profile membership | `environment_context_profile_sensors` joined to the active sensor profile |

The adapter must reject or quarantine rows with missing environment, device, location, timestamp timezone, non-finite value, missing unit, tenant mismatch, or a device not bound to the selected active sensor profile. It must not infer calibration from a device model or mark raw measurements as validated.

## Important contract gaps

The in-memory contracts already exist in `contexts/measurement.py`:

- `SensorDescriptor`
- `EnvironmentalMeasurement`
- calibration status enum
- explicit source lineage and derived-formula lineage

The database schema is not yet a complete one-to-one representation of those contracts:

1. `iot_devices` has `device_type` and free-form `metadata`, but no first-class manufacturer, model, serial number, installation/removal dates or calibration fields.
2. `measurements` has raw/normalized values and a quality state, but no explicit calibration snapshot or sensor channel identifier.
3. `measurements.iot_device_id` is the device identity; do not create a parallel sensor registry merely to satisfy the Python name `sensor_id`.
4. The active profile's sensor bindings must be checked for the requested analysis interval. A device being registered in an environment is not sufficient evidence that it was bound to the profile at the observation time.
5. The current ingestion allow-list covers temperature, relative humidity, substrate moisture and CO2. Other variables (EC, illuminance, pH, pressure, etc.) require deliberate catalogue, unit and validation support before ingestion.

## Security and execution boundary

- Device tokens and receipt records remain service-role only.
- The Edge Function verifies the device token and organization/device binding before invoking the atomic RPC.
- The Sensor Engine should receive only tenant-scoped rows selected by the trusted server path; never expose service-role credentials to the browser or ESP32.
- Preserve organization-scoped joins on every relation.
- Keep NASA POWER/outdoor weather and Sentinel satellite records on their provider-specific paths. Do not relabel them as sensor readings.
- Sensor Engine failure must return an unavailable sensor-source result without blocking Weather Engine or Satellite Engine output.

## Next implementation slice

1. Add a pure Python adapter from the joined database row shape to the existing `EnvironmentalMeasurement` contract, preserving quality and device lineage in a wrapper.
2. Add tests for canonical-vs-raw unit selection, tenant/environment/device mismatch, inactive profile membership, invalid timestamps and quality-state preservation.
3. Add a server-side query/repository that loads measurements for a selected environment, profile and inclusive date window.
4. Only after those tests pass, consider additive schema changes for calibration/install lifecycle and broader variable support.

No new database table is required for the first Sensor Engine read path.
