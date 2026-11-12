import assert from "node:assert/strict";
import { buildBiologicalContextSnapshot } from "../supabase/functions/_shared/biological-context-snapshot.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const cultureId = "22222222-2222-4222-8222-222222222222";
const environmentId = "33333333-3333-4333-8333-333333333333";
const locationId = "44444444-4444-4444-8444-444444444444";

const culture = { id: cultureId, organization_id: organizationId, environment_id: environmentId };
const environment = { id: environmentId, organization_id: organizationId, location_id: locationId };
const measurements = [{
  id: "55555555-5555-4555-8555-555555555555",
  organization_id: organizationId,
  culture_id: cultureId,
  variable_code: "air_temperature",
  raw_value: 295.15,
  raw_unit_code: "K",
  normalized_value: 22,
  normalized_unit_code: "degC",
  measured_at: "2026-11-10T08:00:00Z",
  quality_state: "valid",
  method: "digital_probe",
  metadata: { device: "probe-01" },
}];
const environmentalObservations = [{
  id: "66666666-6666-4666-8666-666666666666",
  organization_id: organizationId,
  location_id: locationId,
  data_family: "weather",
  provider_code: "NASA_POWER",
  dataset_code: "POWER_DAILY_AGRO",
  variable_code: "air_temperature_mean",
  value: 19.5,
  unit_code: "degC",
  observed_at: "2026-11-10T00:00:00Z",
  spatial_resolution_m: 50000,
  quality_flag: "gridded_estimate",
}];
const window = {
  start: "2026-11-10T00:00:00Z",
  end: "2026-11-11T00:00:00Z",
  timezone: "Africa/Algiers",
};

const snapshot = await buildBiologicalContextSnapshot({
  organizationId, culture, environment, measurements, environmentalObservations, window,
});
assert.equal(snapshot.scope.culture_id, cultureId);
assert.equal(snapshot.scope.environment_id, environmentId);
assert.equal(snapshot.scope.location_id, locationId);
assert.equal(snapshot.input.records.length, 2);
assert.deepEqual(snapshot.input.record_ids, snapshot.input.records.map((record) => record.record_id));
assert.equal(snapshot.input.records[0].record_type, "environmental_observation");
assert.equal(snapshot.input.records[1].record_type, "measurement");
assert.equal(snapshot.input.records[0].data.quality_flag, "gridded_estimate");
assert.equal(snapshot.input.records[1].context.culture_id, cultureId);
assert.match(snapshot.input.snapshot_sha256, /^[a-f0-9]{64}$/);
assert.ok(snapshot.input.records.every((record) => /^[a-f0-9]{64}$/.test(record.payload_sha256)));

const repeated = await buildBiologicalContextSnapshot({
  organizationId, culture, environment, measurements, environmentalObservations, window,
});
assert.equal(repeated.input.snapshot_sha256, snapshot.input.snapshot_sha256,
  "identical authorized source rows must produce a deterministic snapshot hash");

await assert.rejects(() => buildBiologicalContextSnapshot({
  organizationId,
  culture,
  environment: { ...environment, id: "77777777-7777-4777-8777-777777777777" },
  measurements,
  environmentalObservations,
  window,
}), /culture_environment_not_resolved/);

await assert.rejects(() => buildBiologicalContextSnapshot({
  organizationId,
  culture,
  environment,
  measurements: [{ ...measurements[0], culture_id: "88888888-8888-4888-8888-888888888888" }],
  environmentalObservations: [],
  window,
}), /measurement_culture_scope_mismatch/);

await assert.rejects(() => buildBiologicalContextSnapshot({
  organizationId,
  culture,
  environment,
  measurements: [],
  environmentalObservations: [{ ...environmentalObservations[0], location_id: "99999999-9999-4999-8999-999999999999" }],
  window,
}), /environmental_observation_location_scope_mismatch/);

const unlinked = await buildBiologicalContextSnapshot({
  organizationId,
  culture: { ...culture, environment_id: null },
  environment: null,
  measurements,
  environmentalObservations: [],
  window,
});
assert.equal(Object.hasOwn(unlinked.scope, "location_id"), false);
assert.equal(unlinked.input.records.length, 1);
assert.equal(unlinked.parameters.environment_link_state, "unlinked");

console.log("✓ BIE source adapter: tenant, culture and environment links; mixed-source provenance; deterministic hashes; unlinked culture handling");
