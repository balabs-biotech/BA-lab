# Biological Performance Engine v1

## Purpose

Provide a provider-neutral, deterministic calculation layer for biological
performance indicators. It consumes normalized evidence records and does not
query Supabase, infer biological identity, or apply hidden quality policy.

## First implemented indicator

### Linear extent growth rate

For one organization and typed biological subject, use the earliest and latest
admissible measurements for one explicitly selected `variable_code`, such as
`root_length` or `shoot_length`:

`(last_value - first_value) / elapsed_days`

The output metric is `extent_growth_rate`, deliberately distinct from the
existing database variable `growth_rate` (specific growth rate, dimension
inverse time).

The result retains:
- contributing and excluded measurement record IDs;
- formula code and version;
- measurement period;
- accepted and excluded record counts;
- canonical output unit per day;
- whether each input value came from the raw or normalized database pair, plus its source unit.

## Evidence and quality boundaries

- The database enum is `raw`, `controlled`, `validated`, and `excluded`.
  The caller explicitly supplies admissible states; `excluded` is never
  accepted, even if mistakenly included in that policy.
- Records from other organizations, subject types, subjects, and variable
  codes are ignored.
- Duplicate source IDs are rejected.
- Input values must already be expressed in the variable's canonical unit.
  No implicit unit conversion is performed.
- The row adapter prefers `normalized_value` only when
  `normalized_unit_code` exactly matches the variable registry's canonical
  unit. Otherwise, it uses `raw_value` only when `raw_unit_code` exactly
  matches that canonical unit. If neither pair is canonical, the row is
  rejected.
- Timestamps must be timezone-aware.
- Fewer than two admissible measurements, or a non-positive elapsed interval,
  returns `insufficient_evidence` with a null value.
- A calculated rate is descriptive. It does not establish why growth changed.

## Database row adapter

`measurement_row_to_biological_measurement` maps one already tenant-scoped
Supabase measurement row into the pure calculation contract.

Subject resolution follows the measurement schema:
1. Prefer exactly one primary subject link: `culture_id` or
   `plant_culture_id`.
2. If neither primary link exists, require exactly one fallback link:
   `sample_id` or `experimental_unit_id`.
3. Reject simultaneous culture and plant-culture links, or unresolved rows.
4. Preserve sample, experimental-unit, event, result, method, and instrument
   identifiers even when a culture is the aggregation subject.

The adapter requires a variable registry mapping `variable_code` to
`variables.canonical_unit_code`. It does not query the registry or Supabase
itself; tenant scoping and retrieval remain the repository's responsibility.

## Deliberate scope boundary

This increment does not calculate colonization duration, biological yield,
contamination rate, viability, strain rankings, or environmental performance
scores. Those indicators require explicit event semantics, denominators,
quality policies, and verified mappings from existing tables. They must not be
approximated from free-text observations or temporal environmental context.

Observations are not silently converted into numeric measurements. Free-text
observations, QC labels, or event names are not substitutes for quantitative
extent measurements.

## Integration contract

The calculation module is pure and provider-neutral. The row adapter is also
pure: it validates one supplied row and a supplied variable registry. No
database migration or new table is required for this increment.
