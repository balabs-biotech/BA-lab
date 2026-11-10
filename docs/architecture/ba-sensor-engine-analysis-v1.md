# Sensor Engine — descriptive analysis v1

## Boundary

The Sensor Engine reads existing IoT measurements through the read-only Supabase
repository and normalizes each row into a traceable sensor envelope. This
analysis stage consumes those envelopes; it does not create a second observation
store and does not mix IoT measurements with NASA POWER or Sentinel-2 rows.

## Computation

- Streams are grouped by physical sensor and variable.
- Canonical units must be homogeneous within each stream. No implicit conversion
  is performed.
- `quality_state=excluded` rows remain in counts and source lineage but are
  omitted from descriptive statistics.
- Raw, controlled and validated rows remain visible as separate quality counts.
- Min, max, arithmetic mean, median and population standard deviation are
  calculated over usable rows only.
- Sampling cadence is never inferred. If the caller supplies an expected
  interval, availability and gaps are calculated against that declared cadence.
- The time window is half-open: `[from_at, to_at_exclusive)`, in aware timestamps.
- No interpolation, imputation, daily weather aggregation or FAO-56 calculation
  is performed in this sensor-specific stage.

## Interpretation boundary

This module produces descriptive sensor summaries only. Biological interpretation
remains a separate layer and must receive the physical environment identity,
domain profile version and source provenance explicitly. A sensor summary must
never be represented as gridded weather-provider data.
