# Sensor and measurement lineage contract v1

## Sensor descriptor

A sensor descriptor gives a sensor a stable UUID and binds it to one
organization, location and environmental context. It records manufacturer,
model, optional serial number, declared measured-variable codes, installation
window and calibration metadata.

Calibration states are explicit: `calibrated`, `expired`,
`not_calibrated`, and `not_applicable`. A sensor marked calibrated must
include `calibrated_at`. If both calibration timestamps are supplied,
`calibration_due_at` must be later than `calibrated_at`.

This descriptor records declared calibration status; it is not a calibration
certificate and does not independently verify sensor accuracy.

## Environmental measurement

A measurement records:
- observation, organization, location and environmental-context UUIDs;
- origin (`sensor`, `weather_provider`, `satellite`, `manual`, `derived`);
- sensor UUID when the origin is a sensor;
- variable code, numeric value, unit code and timezone-aware observation time;
- source observation UUIDs for lineage;
- formula code and version for derived values.

Derived observations must cite at least one unique source observation ID and
must carry a formula code and version. Non-derived observations cannot claim
formula metadata. Sensor-origin measurements require a sensor ID; other origins
must not claim one.

## Validation boundary

These are immutable Pydantic contracts with unknown fields forbidden.
Cross-record checks still belong in the ingestion/service layer: verify that
the sensor exists, belongs to the same organization/location/context, was
installed at the observation time, declares the measured variable, and that
every source observation exists and is accessible to the same organization.
The Pydantic model alone cannot establish those database facts.

The current contract does not persist data, validate calibration certificates,
or assert sensor placement quality. It establishes the lineage fields required
for those later controls.
