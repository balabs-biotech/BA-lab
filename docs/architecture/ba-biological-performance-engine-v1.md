# Biological Performance Engine v1

## Purpose

Provide a provider-neutral, deterministic calculation layer for biological
performance indicators. It consumes normalized evidence records and does not
query Supabase, infer biological identity, or apply hidden quality policy.

## First implemented indicator

### Net growth rate

For one organization and biological subject, use the earliest and latest admissible
`growth_extent` observations:

`(last_value - first_value) / elapsed_days`

The result retains:
- source measurement record IDs;
- formula code and version;
- inclusive measurement period;
- accepted and excluded record counts;
- canonical input canonical unit carried through as unit per day.

## Evidence and quality boundaries

- The caller must explicitly supply accepted quality states. The calculation
  module does not assume the database enum or treat `raw`, `verified`, or
  other states as admissible by default.
- Records from other organizations, subjects, and metric codes are ignored.
- Duplicate source IDs are rejected.
- Mixed units are rejected; no implicit unit conversion is performed.
- Timestamps must be timezone-aware.
- Fewer than two admissible observations, or a non-positive elapsed interval,
  returns `insufficient_evidence` with a null value.
- A calculated rate is descriptive. It does not establish why growth changed.

## Deliberate scope boundary

This first increment does not calculate colonization duration, biological
yield, contamination rate, viability, strain rankings, or environmental
performance scores. Those indicators require explicit event semantics,
denominators, quality policies, and verified mappings from the existing
database schema. They must not be approximated from free-text observations or
from temporal environmental context.

## Integration contract

A future database adapter may map verified rows from existing measurements,
observations, results, batches, and events into
`BiologicalMeasurement`. That adapter must preserve tenant and subject
identity and choose admissible quality states from the actual schema and
analysis policy. The pure calculation function remains independent of the
database and UI.
