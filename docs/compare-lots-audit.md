# Audit and implementation plan — Compare My Lots

**Audit date:** 2026-10-22  
**Target:** BA Labs Batch Tracker, branch \`feat/compare-culture-lots\`  
**Production changes:** none; no SQL, migrations, data writes, or Edge Function deployments were performed.

## 1. Evidence reviewed

- Repository tree at \`main\`, shared workspace HTML, JavaScript engine, CSS, workspace entry pages, CI workflow, existing SQL migrations and SQL tests.
- Active Supabase project \`BALabs\` (\`axcouwiodqsauwnsiotn\`, PostgreSQL 17).
- Live catalog from \`information_schema\`, RLS policy definitions from \`pg_policies\`, migration history from Supabase, and read-only row counts.
- Supabase reports 36 applied migration versions; the repository contains 36 migration files. Version comparison found no applied version missing from the repository and no repository migration version absent from the applied history.
- Security advisors also returned existing warnings about three callable \`SECURITY DEFINER\` batch RPCs and disabled leaked-password protection. This feature does not change those functions or auth settings.

## 2. Relevant deployed schema

| Purpose | Deployed objects and fields |
|---|---|
| Biological cultures | \`cultures.id, code, culture_type, material_id, parent_culture_id, experiment_id, experimental_unit_id, environment_id, started_at, metadata\` |
| Production lots | \`batches.id, batch_code, name, batch_type, status, current_stage, culture_id, material_id, protocol_version_id, location_id, environment_id, started_at, completed_at, quantity_planned, quantity_actual, quantity_unit_code, metadata\` |
| Traceability / operations | \`events.id, event_type, occurred_at, culture_id, material_id, sample_id, experimental_unit_id, environment_id, payload, batch_id\` |
| Numeric measurements | \`measurements.id, variable_code, raw_value, raw_unit_code, normalized_value, normalized_unit_code, measured_at, method, instrument, quality_state, exclusion_reason, culture_id, sample_id, experimental_unit_id, event_id, result_id, metadata\` |
| Qualitative observations | \`observations.id, variable_code, value_text, observed_at, culture_id, sample_id, experimental_unit_id, event_id, quality_state, metadata\` |
| Experimental results | \`results.id, experiment_id, experimental_unit_id, code, result_type, value, quality_state, created_at\` |
| Reference catalogue | \`variables.code, label, dimension, canonical_unit_code, description\`; \`units.code, label, dimension, factor, offset_value, is_linear\` |
| Experimental design | \`experiments.project_id, code, name, design\`; \`experimental_units.experiment_id, unit_code, replicate_no, treatment_code, metadata\` |
| Batch workflow | \`batch_stages\` and \`batch_qc_checks\`, including stage status/timestamps and numeric QC values/units |

All listed operational tables have RLS enabled. Read policies for the comparison tables use \`private.is_org_member(organization_id)\`; reference catalog policies for \`variables\` and \`units\` allow authenticated reads. The client must retain an explicit \`organization_id\` filter and use the existing authenticated Supabase client. No privileged key is used.

## 3. Current data availability observed

At audit time: \`cultures=3\`, \`batches=0\`, \`events=3\`, \`measurements=0\`, \`observations=0\`, \`results=0\`, \`experiments=0\`, \`experimental_units=0\`. The reference catalogue contains 24 variables and 27 units.

This is a point-in-time count, not an experiment. The current production data cannot validate trends, correlations, or outlier behaviour. The UI must show the absence of data and must not fabricate sample records.

## 4. Design

1. Add a read-only comparison panel to the existing Statistics module.
2. Allow selection of two or more of the 30 most recently loaded production lots.
3. Resolve records through batch events first. Records linked only to a culture or sample are assigned only when that culture maps to exactly one batch in the organization and that batch is selected.
4. Query \`measurements\` and \`observations\` using existing organization-scoped RLS, paginating reads. Exclude records explicitly marked \`quality_state='excluded'\`; exclude numeric records with an \`exclusion_reason\`.
5. Filter by optional date bounds. Show counts, actual data period, median and min/max by variable and unit, missing recorded values by selected lot, qualitative observation counts, time-series charts, and IQR outlier flags. Outliers remain visible and are never automatically removed.
6. Calculate Pearson correlations only for pairs of different numeric variables with at least four paired lot-days, using daily means within the same lot. Label them exploratory and disclose that time, treatment and repeated measurements are not controlled.
7. Suggest next variables only from the existing catalogue; describe them as hypotheses to test, not causes.
8. Add dependency-free descriptive-statistics helpers and unit tests; run them in CI.

## 5. Interpretation and limits

- Compatible linear units are converted using the deployed unit factors/offsets. Kelvin/Celsius uses the standard affine conversion because the live catalogue currently records K with offset 0. Non-linear pH is never converted. If units cannot be converted safely from the available reference data, series remain separate.
- A missing value means “no recorded value found for this lot/variable/window,” not “a scheduled measurement was missed”; the schema does not currently define an expected measurement cadence.
- Culture-only and sample-only data are not assigned to a selected lot when the culture is associated with multiple batches in the organization.
- \`results\` are not included in the lot-level comparison in this version: their deployed keys link them to experiments and experimental units, not directly to a batch. Measurements or observations linked only to an \`experimental_unit_id\` are likewise not assigned to a lot unless an existing event/culture/sample link resolves them unambiguously. Joining by guess would be misleading.
- Correlation is not causal inference; no significance tests or treatment-effect claims are made.
- This implementation introduces no tables, columns, RPCs, views, Edge Functions, data duplication, or production migration.
