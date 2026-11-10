# NASA POWER daily observation adapter v1

## Scope

The Python adapter normalizes rows already persisted in
`public.environmental_observations`. It is a pure transformation: it does not
query Supabase, write rows, repair missing values, or infer measurements.

The adapter accepts only:
- provider: `NASA_POWER`
- dataset: `POWER_DAILY_AGRO`
- source parameter codes listed below
- source metadata containing `source_parameter`, `source_date` and
  `source_time_standard = "NASA POWER daily local solar time"`

## Versioned parameter map

| NASA POWER parameter | Stored canonical variable | Stored source unit | Conversion unit | Engine unit |
|---|---|---|---|---|
| T2M | air_temperature_mean | degC | degC | degC |
| T2M_MAX | air_temperature_max | degC | degC | degC |
| T2M_MIN | air_temperature_min | degC | degC | degC |
| PRECTOTCORR | precipitation_corrected | mm/day | mm | mm |
| ALLSKY_SFC_SW_DWN | solar_radiation_all_sky | kWh/m2/day | kWh/m2 | MJ/m2 |
| RH2M | relative_humidity_mean | % | % | % |
| WS2M | wind_speed_mean | m/s | m/s | m/s |

The daily suffix on precipitation and irradiation describes the provider's
daily quantity. The adapter treats the daily precipitation amount as a depth
in mm and converts daily irradiation using the equivalent area-energy unit:
1 kWh/m2 = 3.6 MJ/m2. It does not treat these as instantaneous rates.

NASA POWER's UV index is intentionally not mapped: the current canonical
registry has no corresponding variable definition.

## Temporal interpretation

The importer stores the daily date at 12:00 UTC as a stable database timestamp.
This timestamp is not a claim that the measurement occurred at noon UTC.
The adapter retains the provider's daily-local-solar-time declaration and
extracts the source date from metadata. A date mismatch or timezone-naive
timestamp is rejected.

## Normalized source contract

The adapter returns the provider-neutral `NormalizedEnvironmentalObservation` model from `ba_environmental_engine.sources.models`. In addition to canonical and original values/units, the model retains:

- `data_family` (NASA POWER daily rows must be `weather`);
- `spatial_resolution_m` when supplied, validated as a positive finite number;
- the complete provider `metadata` object as `source_metadata`;
- source row, organization and location identifiers.

Future provider adapters must return this same normalized model. Provider-specific parsing stays inside each adapter; calculations consume the normalized model and do not branch on provider names. No speculative adapter protocol or direct provider client is introduced until a second provider is implemented.

## Quality and duplicate policy

- Provider estimates remain labelled by their original quality flag.
- Unit normalization is not a quality assessment.
- The adapter does not impose universal physical ranges; variable-specific
  plausibility checks belong in a separate quality layer.
- Duplicate database conflict keys are reported with their count. Rows are
  never silently deduplicated or overwritten by this adapter.
- Source row UUID, tenant/location UUIDs, provider, dataset, parameter,
  original value/unit, timestamps, quality flag and source URL are retained.

## Explicit exclusions

No automatic conversion of provider labels outside this mapping; no guessed
parameter aliases; no imputation; no direct database writes; no satellite
scenes; no causal agronomic recommendations.
