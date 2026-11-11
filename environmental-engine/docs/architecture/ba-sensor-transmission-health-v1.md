# BA Sensor Transmission Health v1

## Decision

Keep device transmission health separate from measurement quality and biological interpretation.

The current sensor analysis summarizes measurement rows grouped by sensor and variable. That is not a reliable device-heartbeat source:
- excluded measurements are still evidence that a device transmitted;
- one device message may contain multiple variable measurements;
- a device can transmit successfully without producing a usable measurement;
- a completely silent device has no row in the current measurement query.

Do not infer device silence from an empty measurement series.

## Existing authoritative evidence

The IoT registry already provides:
- `iot_devices.enabled`: whether a device is currently enabled;
- `iot_devices.created_at`: registry creation time;
- `iot_devices.last_seen_at`: updated by the atomic ingestion RPC after a processed message;
- `iot_ingest_receipts.device_id` and `received_at`: message-level receipt history.

For historical cadence analysis, use `iot_ingest_receipts.received_at`, not `last_seen_at`. The latter is only the latest successful ingestion and cannot reconstruct earlier gaps. Use the device registry to establish which profile-bound devices are expected.

## Proposed output contract

Add a separate `instrument_health.transmission_diagnostics` result, keyed by device ID (not variable code). Each assessment should contain:
- `device_id`, `device_code`, `status`;
- `expected_interval_seconds` and explicit `gap_tolerance_factor`;
- `receipt_count`, `maximum_gap_seconds`, `gap_count`;
- `last_received_at`, `trailing_silence_seconds`;
- `source_receipt_ids` or a bounded provenance summary;
- `evaluation_started_at`, `evaluated_at`.

Statuses:
- `normal`: evaluated and no interval exceeded the configured tolerance;
- `irregular`: one or more interior receipt gaps exceeded the configured tolerance;
- `silent`: the most recent receipt is older than the explicitly configured trailing-silence threshold;
- `insufficient_data`: the explicit expectation window has not yet exceeded the configured tolerance and there is not enough receipt evidence to classify the device;
- `not_evaluable`: no explicit cadence policy, device expectation, or valid evaluation window was supplied.

## Temporal rules

1. Cadence is never inferred from observed timestamps.
2. Expected interval and tolerance must be explicit policy inputs. No hidden default tolerance.
3. Interior gaps are calculated between ordered receipt timestamps for the same device.
4. Trailing silence is calculated against a server-generated `evaluated_at`, never a browser clock.
5. For a live/current evaluation, cap the observation window at `evaluated_at`; do not count future hours in the selected calendar day.
6. Historical intervals may report interior irregularity, but must not label a device currently silent based on an old period.
7. A device is eligible only when it is bound to the selected sensor profile and its activation/validity interval overlaps the evaluation interval.
8. Disabled devices and devices not yet created are not classified as silent.
9. A zero-receipt device can be `silent` only when the registry proves it was expected to transmit and the elapsed expectation window exceeds the explicit cadence tolerance. A shorter window remains `insufficient_data`.
10. Receipt diagnostics remain independent from measurement quality flags and biological signal persistence.

## Integration sequence

1. Add pure Python tests for ordered receipts, duplicate receipt IDs, multiple receipts at one timestamp, interior gaps, trailing silence, no receipts, disabled devices, and historical-vs-live evaluation.
2. Add a provider-neutral receipt/device contract to the environmental engine. Do not overload `SensorMeasurementEnvelope`.
3. Extend the authenticated Supabase gateway to load profile-bound device registry rows and bounded receipt history only after existing JWT and organization membership checks.
4. Pass normalized device/receipt evidence to the private engine API; validate tenant, environment, profile binding, timestamps, and row limits at the API boundary.
5. Add an optional UI policy for cadence/tolerance. Keep it separate from the existing expected measurement interval until their semantics are explicitly unified.
6. Render device-level transmission diagnostics separately from variable-level measurement summaries and flatline diagnostics.

## Current implementation boundary

The existing `gap_count` and `maximum_gap_seconds` are measurement-series statistics over non-excluded readings. They are useful descriptive indicators but are not a device heartbeat and must not be relabeled as transmission health.

The existing gateway returns `no_sensor_measurements_in_scope` when no measurement rows exist. This must be revised only together with the registry/receipt path; removing that guard alone would create an empty analysis request with no way to identify the silent devices.


## Implemented Python component

The first provider-neutral implementation is available in
`quality/sensor_transmission.py`:
- `SensorDeviceTransmission` models registry and profile expectation evidence;
- `SensorTransmissionReceipt` models a single ingestion receipt;
- `assess_sensor_transmissions` computes device-level interior gaps and optional current-window trailing silence;
- explicit cadence and tolerance policy are mandatory;
- disabled/unbound devices are `not_evaluable`;
- zero receipts become `silent` only after the explicit device expectation window exceeds the configured cadence tolerance; a shorter window remains `insufficient_data`;
- historical windows do not produce a current silence status;
- receipt IDs are retained as lineage and duplicates are rejected.

A dedicated test module covers regular cadence, interior gaps, current trailing silence,
historical windows, empty history, disabled/unbound devices, expectation-window bounds,
invalid policy and duplicate receipt IDs. The module and tests are committed, but the
Python test suite has not yet been executed in this environment. The API and gateway
integration remain pending.


## Transmission-only scope

The authenticated gateway may run transmission diagnostics even when the selected
period contains no measurement rows. It still requires a valid active sensor profile
and at least one profile-bound device, then loads the device registry and bounded
receipt history before calling the engine. The private API accepts an empty
`measurements` list only when the complete transmission policy/device/receipt
contract is present. This is necessary for a truly silent device to remain visible.

Current silence is evaluated only when the selected end date is the current date
in the profile timezone. Historical windows can report interior receipt gaps, but
cannot report a current trailing-silence status. The registry heartbeat is only
used as current evidence when there are no in-window receipts; it is not a
historical reconstruction source.
