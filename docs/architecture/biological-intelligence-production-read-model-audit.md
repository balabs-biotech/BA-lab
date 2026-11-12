# BIE v1 — production read-model audit

Audit date: 2026-11-12
Target project: Supabase `BALabs` (`axcouwiodqsauwnsiotn`)
Scope: read-only inspection of the live PostgreSQL schema, migration history, RLS policies, row counts and deployed Edge Functions.

## 1. Executive finding

The production database already contains the biological traceability and environmental observation foundations required by BIE. The next step is **not** to add another culture, batch, measurement or environmental-observation schema. BIE should consume these records through the existing BAL-Core/engine orchestration contracts.

There is, however, a clear source-versus-production boundary:

- Production has the biological and environmental source tables and NASA POWER/Sentinel-related ingestion functions.
- The current production migration history does not contain the engine execution-ledger migrations dated 2026-11-12.
- The production Edge Function inventory does not include `engine-orchestrator`.
- Those execution components exist in the open parent PR #283 branch, not as a verified production deployment.
- No production biological context assessments or engine execution results were found in the audited table inventory.

Therefore the BIE design contract and output schema are repository artifacts; there is no evidence yet of a live production BIE execution path.

## 2. Existing source model

The following production tables were inspected directly through `information_schema.columns`, foreign-key metadata and `pg_policies`.

| Table | Existing role | Important fields / links |
|---|---|---|
| `cultures` | Mycology/lab culture identity and lineage | `organization_id`, `id`, `material_id`, `parent_culture_id`, `experiment_id`, `experimental_unit_id`, `protocol_version_id`, `environment_id`, `started_at`, `metadata` |
| `batches` | Production batch lifecycle | `batch_code`, `batch_type`, `status`, `current_stage`, `material_id`, optional `culture_id`, `location_id`, `environment_id`, planned/started/completed timestamps, quantities |
| `measurements` | Local/instrumental or manually entered quantitative measurements | raw and normalized values/units, `measured_at`, method, instrument, `quality_state`, exclusion reason, links to culture/sample/experimental unit/event/result/environment/device/plant culture |
| `environmental_observations` | External/provider-derived environmental time series | `location_id`, `data_family`, provider/dataset/variable codes, value/unit, observed/retrieved timestamps, spatial resolution, quality flag, source URL, metadata |
| `biological_contexts` | Time-bounded biological subject context | domain, culture or plant-culture reference, environment, organism kind, taxon/strain/cultivar codes, culture stage, substrate, production system, tags, validity window |
| `environments` / `locations` | Physical context and spatial anchor | tenant-scoped environment and location IDs; location stores coordinates and coordinate provenance |
| `experiments` / `experimental_units` / `results` | Experimental design, treatment/replicate and result context | experiment design JSON, unit code/replicate/treatment, structured result JSON and quality state |
| `events` | Append-style biological/production event context | event type/time and optional links to culture, batch, plant culture, material, sample, experimental unit, location and environment |
| `strains` / `organisms` | Organism and strain registry | scientific name, taxonomic source/id, strain code, designation, origin, supplier and metadata |
| `domain_interpretation_profiles` | Versioned domain-specific rule registry | domain, profile code/version, JSON rules, status and validity window |
| `environment_context_profiles` | Versioned sensor/context profile | environment, profile code/version, context type, label, timezone, origin, status and validity window |

The data model already separates local `measurements` from provider-derived `environmental_observations`. BIE must preserve this distinction. Gridded climate estimates must not be presented as in-situ sensor readings.

## 3. Production row-count snapshot

Read-only counts at audit time:

| Table | Rows |
|---|---:|
| `environmental_observations` | 1,366 |
| `cultures` | 3 |
| `events` | 3 |
| `batches` | 0 |
| `measurements` | 0 |
| `biological_contexts` | 0 |
| `experiments` | 0 |
| `experimental_units` | 0 |
| `results` | 0 |
| `plant_cultures` | 0 |
| `iot_devices` | 0 |

These are database-wide counts, not claims about data completeness or experimental validation. They show that environmental ingestion is the most populated analytical source today, while the local measurement and experiment pathways have not yet accumulated production records. BIE must return sparse/insufficient coverage rather than fabricate biological conclusions when subject-level evidence is absent.


### 3.1 Environmental series detail

The 1,366 environmental rows are all tagged `quality_flag = gridded_estimate`. They belong to one provider/dataset pair: `NASA_POWER / POWER_DAILY_AGRO`, with six daily weather variables:

| Variable | Rows | Unit |
|---|---:|---|
| `air_temperature_max` | 199 | degC |
| `air_temperature_mean` | 199 | degC |
| `air_temperature_min` | 199 | degC |
| `precipitation_corrected` | 199 | mm/day |
| `relative_humidity_mean` | 198 | % |
| `wind_speed_mean` | 198 | m/s |
| `solar_radiation_all_sky` | 174 | kWh/m2/day |

The series begin on 2026-09-23; the most recent observation in this snapshot is 2026-11-08. The shorter radiation series demonstrates that variable coverage is not uniform and must be computed per variable, not inferred from the overall row count.

Five location records currently carry the same latitude/longitude coordinate (36.2034889, 5.4303972) while retaining distinct semantic labels (site, greenhouse, production, QC, laboratory). The NASA POWER observations are therefore location-keyed in the database, but they are not five independent microclimate sensor networks. The BIE adapter must retain provider, dataset, spatial resolution and `gridded_estimate` quality provenance, and must not treat these records as direct measurements of conditions inside each room.

The three existing culture records have `environment_id = NULL`; their environment → location relationship is consequently unresolved. Until an explicit, historically valid culture-to-environment link exists, BIE may report site-level weather context as a separate contextual series, but must not state that it measured the culture's actual incubation or fruiting conditions.

## 4. Tenant isolation and write boundaries

All inspected source tables have RLS enabled.

- `cultures`, `batches`, `measurements`, `events`, `experiments`, `experimental_units`, `results`, `environments` and `biological_contexts` expose organization-member reads and organization-writer mutations through the existing `private.is_org_member(organization_id)` / `private.is_org_writer(organization_id)` policy helpers.
- `environmental_observations` has an authenticated organization-member SELECT policy in the inspected policy set; no direct client write policy was present. Preserve provider ingestion as a trusted backend responsibility.
- `domain_interpretation_profiles` is member-readable and writer-managed.
- BIE source resolution must use the caller-scoped client for reads, and must not trust browser-supplied source payloads or tenant identifiers without membership/scope verification.

This audit did not attempt to weaken, replace or modify any policy.

## 5. Engine infrastructure: branch versus production

The open parent PR #283 contains the following implementation artifacts:

- `public.engine_executions` migration;
- `public.engine_execution_results` migration and service-only completion RPC;
- authenticated `engine-orchestrator` Edge Function;
- versioned Python worker and registered `environmental.timeseries.qc@0.2.0` engine;
- support for both `measurement` and location-scoped `environmental_observation` inputs.

The live production migration history inspected on 2026-11-12 ends with the 2026-11-11 biological-profile registry migrations; it does **not** include the two engine-execution migrations above. The live Edge Function inventory contains the existing Notion, IoT, NASA POWER and Sentinel functions, but no `engine-orchestrator`.

Consequently, the parent PR's execution ledger and orchestration code must not be described as production-active. PR #283 is open, Draft, and its current GitHub metadata reports `mergeable=false`; reconcile that branch and its CI before treating it as a deployable dependency.

## 6. BIE input adapter mapping

For the first culture-condition context assessment, the existing read model should be composed as follows:

1. **Subject identity:** `cultures` or `batches`; use `plant_cultures` for the GreenTech domain. Do not assume a batch always has a culture or vice versa.
2. **Biological identity/context:** `materials` → `strains` → `organisms`, plus `biological_contexts` where present. Resolve the valid context row for the analysis window; do not infer historical strain identity from current metadata.
3. **Environment anchor:** subject `environment_id` → `environments` → `locations`. If the only location is indirect or ambiguous, report the missing link.
4. **Local observations:** `measurements`, filtered by organization, subject/scope, quality state and time window. Preserve raw and normalized values/units and exclusion reasons.
5. **External observations:** `environmental_observations`, filtered by organization, location, data family, provider/dataset and time window. Do not merge different locations or provider/dataset identities in one series unless an explicit engine contract allows it.
6. **Operations and experimental context:** `events`, `experiments`, `experimental_units`, `results` and `batches` as linked by exact IDs.
7. **Interpretation rules:** resolve the active, versioned `domain_interpretation_profiles` for the requested domain and effective date. A profile is configuration, not evidence.

Every adapter should return both the selected rows and a coverage report: expected/available variables, source counts, time span, gaps, missing links, quality-state exclusions, provider/dataset identities and spatial resolution where relevant.

## 7. Gaps to close before executable BIE

1. **Promote the parent execution foundation:** resolve PR #283 mergeability/CI, then apply its migrations and deploy the authenticated orchestrator only after production secrets and a real worker endpoint are deliberately configured.
2. **Add a biological source adapter:** the current parent orchestrator is an environmental QC dispatch path. It must be extended with explicit culture/batch subject resolution and scope checks before BIE can consume it. Do not pass arbitrary client-defined record IDs as a substitute for subject-level authorization.
3. **Define the temporal join:** establish a deterministic policy for matching culture/batch lifecycle windows, time-bounded `biological_contexts`, local measurements and gridded environmental observations.
4. **Handle sparse current data:** build deterministic coverage/gap features first. The live counts indicate that many subject-level assessments will initially be `insufficient_data`.
5. **Validate real cases:** add test fixtures for culture-only, batch-only, linked culture+batch, missing biological context, missing environment, mixed provider/dataset, excluded measurements, time gaps and cross-tenant IDs.
6. **Only then add biological interpretation:** do not rank strains or prescribe environmental changes from the current sparse dataset.


## 7.1 First deterministic BIE engine (feature branch only)

The BIE branch now includes `biological.context.features@0.1.0` and a Python registry manifest. It consumes a caller-authorized immutable engine snapshot for one culture, requires an explicit timezone-aware analysis window, rejects measurements outside the selected culture scope and external weather rows outside the selected location scope, and computes descriptive mean/minimum/maximum/count features plus temporal gaps. Every emitted fact and feature retains source record IDs.

The engine returns empty findings and hypotheses and emits `biological_interpretation_not_performed`. It is a deterministic feature layer, not a biological inference engine. Batch subjects are explicitly rejected until batch-linked measurement and lifecycle semantics are implemented. The current Supabase orchestrator allowlist does not include this engine, and the culture/environment source adapter is not implemented; therefore it is registered in the Python branch but not yet callable through the application or production.

## 8. Architectural decision

**Reuse the existing production source schema. Reuse the engine ledger/orchestrator from PR #283 after its branch is reconciled and deployed. Build a BIE-specific, read-only subject adapter and deterministic context features on top.**

Do not create duplicate `biological_measurements`, `culture_environment_readings`, `bie_jobs` or `bie_results` tables. The existing measurement/observation distinction, versioned engine contracts and execution result store are sufficient foundations once the parent branch is promoted.

## 9. Audit limitations

This was a read-only schema, migration-history, RLS-policy, deployed-function and row-count audit. It did not inspect every row's scientific validity, every database function body, every storage policy, or every external provider payload. Row counts are a snapshot and will change. No migration, policy, production function or production data was modified during this audit.
