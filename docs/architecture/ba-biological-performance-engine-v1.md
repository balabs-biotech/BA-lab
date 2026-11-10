# Biological Performance Engine v1

## Purpose

Provide a provider-neutral, deterministic calculation layer for biological
performance indicators. It consumes normalized evidence records and does not
query Supabase, infer biological identity, or apply hidden quality policy.

## First implemented indicator

### Linear extent growth rate

For one organization and biological subject, use the earliest and latest
admissible observations for one explicitly selected `variable_code` (for example, `root_length` or `shoot_length`):

`(last_value - first_value) / elapsed_days`

The result retains:
- contributing measurement record IDs;
- excluded measurement record IDs;
- formula code and version;
- measurement period;
- accepted and excluded record counts;
- canonical input unit carried through as unit per day.

## Evidence and quality boundaries

- The database enum is `raw`, `controlled`, `validated`, and `excluded`.
  The caller explicitly supplies the admissible states; `excluded` is never
  accepted, even if mistakenly included in that policy.
- Records from other organizations, subjects, and metric codes are ignored.
- Duplicate source IDs are rejected.
- Input values must already be expressed in the variable's canonical unit.
  Mixed canonical units are rejected; no implicit conversion is performed.
- The database stores `raw_value/raw_unit_code` and optional
  `normalized_value/normalized_unit_code`. A future adapter must only use a
  normalized pair when its unit matches `variables.canonical_unit_code`, or
  use a raw pair when its unit is already exactly canonical.
- Timestamps must be timezone-aware.
- Fewer than two admissible observations, or a non-positive elapsed interval,
  returns `insufficient_evidence` with a null value.
- A calculated rate is descriptive. It does not establish why growth changed.

## Existing database mapping boundary

The current `measurements` table provides organization and record IDs,
`variable_code`, raw and optional normalized numeric values/units,
`measured_at`, `method`, `instrument`, `quality_state`, and links to
`culture_id`, `plant_culture_id`, `sample_id`, `experimental_unit_id`,
`event_id`, and `result_id`.

A database adapter must:
1. scope reads by `organization_id`;
2. resolve the subject from exactly one supported biological subject link;
3. pass the selected `variable_code` explicitly; do not invent a `growth_extent` database variable;
4. verify canonical units against the variable registry;
5. preserve sample, experimental-unit, event, result, method, and instrument
   provenance;
6. apply the analysis policy using the actual quality enum.

Observations are not silently converted into numeric measurements. Free-text
observations, QC labels, or event names are not substitutes for quantitative
growth extent.

## Deliberate scope boundary

This first increment does not calculate colonization duration, biological
yield, contamination rate, viability, strain rankings, or environmental
performance scores. Those indicators require explicit event semantics,
denominators, quality policies, and verified mappings from the existing
database schema. They must not be approximated from free-text observations or
from temporal environmental context.

## Integration contract

The calculation module is pure and provider-neutral. The database adapter and
quality-policy selection remain outside it. No database migration or new table
is required for this first indicator.
