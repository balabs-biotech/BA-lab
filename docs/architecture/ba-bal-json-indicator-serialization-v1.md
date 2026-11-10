# BAL-JSON v1 indicator serialization boundary

**Status:** implementation contract for the environmental-engine serialization milestone  
**Scope:** pure Python conversion from calculation results and normalized source observations into the validated BAL-JSON v1 envelope  
**Non-goals:** database writes, Supabase orchestration, source acquisition, quality re-screening, interpolation, and agronomic interpretation

## 1. Boundary

The calculation modules remain provider-neutral and return typed Python results. A separate serialization layer builds a `BALAnalysis` document from:
- one bounded analysis scope;
- normalized source observations already selected and screened by the caller;
- calculated daily reference indicators and/or rolling climate indicators;
- explicit analysis metadata (analysis ID, generation timestamp, engine version).

The serializer must not fetch observations, query Supabase, infer authorization, or change scientific values.

## 2. Source identity and summary

A single BAL-JSON analysis must be scoped to exactly one organization and one location. Source observations included in the analysis must be within the declared analysis date range.

Build `source_summary` by grouping consumed observations by `(provider_code, dataset_code, data_family)`. For each group:
- list only variables actually consumed by emitted indicators;
- count unique source observation IDs, not the number of indicator references;
- use the minimum and maximum observed dates;
- use the latest retrieval timestamp;
- preserve spatial resolution only when it is unambiguous for the group;
- retain source URLs as a sorted unique list;
- classify NASA POWER gridded weather as `gridded_estimate`; do not label gridded estimates as measurements.

Mixed quality classes within one source group must be represented as `mixed`, not silently reduced to the most favourable class.

## 3. Indicator provenance

BAL-JSON v1 currently records indicator input variable codes and units, but not the exact source observation IDs consumed. The serialization contract therefore requires a backward-compatible optional `source_observation_ids` field on each `IndicatorInput` (empty only when the calculation API does not expose row-level lineage). Daily FAO-56 indicators must populate it for every required input variable.

Do not infer row-level lineage for rolling summaries from a date-to-value mapping. Until rolling aggregation accepts source lineage as an input, its serialized inputs may identify variables and units, but must not fabricate observation IDs. This limitation must be explicit in the result warnings or serializer documentation.

## 4. Daily FAO-56 mapping

The daily reference pipeline emits two primary indicators:
- `net_radiation_fao56_daily`: value = `net_radiation.net_radiation_mj_m2_day`, unit = `MJ/m2/day`, method = the net-radiation formula profile;
- `reference_et0_fao56_daily`: value = `et0.reference_evapotranspiration_mm_day`, unit = `mm/day`, method = the ET0 formula profile.

Both indicators use the observed date as both period bounds and `daily` as the period aggregation. The required input variables are the six variables defined by the daily pipeline. Each input's canonical unit and source observation ID must be retained.

Coverage for a daily calculation is variable completeness: expected = six required variables; observed = the number present; ratio = observed / expected. An `insufficient_data` calculation must serialize with `value=null`, preserve the actual missing-variable list in machine-readable warnings, and never be represented as zero.

Formula diagnostics (including cloudiness-ratio clamping and negative ET0 review) must be retained as quality flags/warnings. The serializer must not discard them or reinterpret them as provider quality flags.

## 5. Rolling climate mapping

For each `ClimateWindowIndicator`:
- use its variable code and canonical unit;
- use the inclusive `period_start` and `period_end`;
- map the aggregation method directly;
- map coverage expected/observed/ratio from the existing `DailyCoverage` result;
- preserve `insufficient_data` as null value plus explicit status;
- never recompute coverage or fill missing dates in the serializer.

The method version must identify the rolling aggregation contract version, not the Python package version.

## 6. Validation and determinism

The serializer must:
- reject mixed organization/location scopes and observations outside the analysis scope;
- reject duplicate source observation IDs with conflicting normalized values or identity;
- require timezone-aware `generated_at`;
- sort source summaries, variables, URLs, warnings, and source IDs deterministically;
- validate the final object through `BALAnalysis` before returning it;
- keep raw provider metadata and private notes out of BAL-JSON;
- never emit NaN or infinity.

## 7. Tests required before integration

- Daily complete FAO-56 result maps to two available indicators with exact source IDs, units, periods, method profiles, and source summary.
- Missing daily inputs map to null-valued insufficient indicators with correct variable coverage and explicit missing-variable warnings.
- NASA POWER source rows are classified as gridded estimates.
- Mixed tenant/location input is rejected.
- Out-of-scope observations are rejected.
- Rolling indicator coverage and status are copied without recomputation or imputation.
- Formula diagnostics survive serialization.
- Repeated identical inputs produce deterministically ordered output.
- The resulting payload validates through `BALAnalysis`.

## 8. Explicit follow-on

To make rolling climate indicators fully row-traceable, extend the rolling aggregation input contract with per-date source observation references in a separate change. Do not overload the current date-to-float mapping or manufacture lineage in this serializer.
