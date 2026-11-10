# Sensor Engine — canonical row adapter contract

The pure adapter `sources.sensor.normalize_iot_measurement_row` maps a joined
`public.measurements` row to the existing `EnvironmentalMeasurement` Pydantic
contract. It performs no Supabase I/O and creates no parallel observation store.

## Required query aliases

The trusted repository query must return the measurement columns plus:

- `device_organization_id`, `device_environment_id`
- `environment_organization_id`, `location_id`
- `device_code`, `device_type`
- `canonical_unit_code` from `variables`
- `profile_origin`, `profile_status`, `profile_valid_from`, `profile_valid_to`
- `profile_timezone`
- `profile_sensor_bound`: true only when the exact device is bound to the selected active profile.

The query must be tenant-scoped and bounded by the requested observation interval.
All joins must include organization identity where the schema supports it.

## Normalization rules

1. Prefer `normalized_value` and `normalized_unit_code` together.
2. Otherwise use the raw pair only when `raw_unit_code` exactly equals
   `variables.canonical_unit_code`; never guess a conversion.
3. Preserve quality state and exclusion reason; never promote quality.
4. Require IoT source metadata, matching tenant/environment/device, active sensor
   profile, and exact device-to-profile binding.
5. Evaluate profile validity dates in the profile's IANA timezone. The profile
   validity columns are calendar dates, not UTC timestamps.
6. Preserve method, instrument, device identity and source metadata.
7. Use physical `environment_id` as `context_id`, never the profile row UUID.

The adapter deliberately does not discard excluded rows. Orchestration must decide
whether to omit them from a calculation while retaining diagnostics and provenance.

## Scope

This is the normalization boundary only. A Supabase repository/query layer,
calibration snapshot support, and end-to-end API integration remain separate work.
No database migration is required for this adapter.
