# Sensor-to-biological interpretation bridge v1

The Sensor Engine and the biological interpretation layer remain separate.

## What the bridge does

The bridge accepts a completed `SensorAnalysis` and applies an explicitly
versioned `DomainProfile`:

- `normal` when the series is usable and has complete declared coverage;
- `insufficient_coverage` when declared sampling coverage is incomplete;
- `insufficient_history` when the series has no usable observations.

Rules still require an exact variable code, finding status and optional
biological context tags.

## What the bridge does not do

It does **not** infer a safe temperature, humidity, CO₂ concentration or any
species/strain threshold from source data. It therefore cannot silently turn a
descriptive mean into a biological diagnosis.

Threshold/event detection is a future, separately versioned layer. Its inputs
must be explicit, traceable and linked to a biological profile version.

## Consequence for CultureOps

A Pleurotus fruiting room, a GreenTech greenhouse and a laboratory incubator
can all use the same sensor pipeline. Their meaning diverges only when the
versioned biological/domain profile is applied.
