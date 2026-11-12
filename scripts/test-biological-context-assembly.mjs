import assert from "node:assert/strict";
import { assembleResolvedBiologicalContextSnapshot } from "../supabase/functions/_shared/biological-context-assembly.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const cultureId = "22222222-2222-4222-8222-222222222222";
const envA = "33333333-3333-4333-8333-333333333333";
const envB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const locationA = "44444444-4444-4444-8444-444444444444";
const locationB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const contexts = [
  { id: "55555555-5555-4555-8555-555555555555", organization_id: organizationId,
    culture_id: cultureId, environment_id: envA, valid_from: "2026-11-01", valid_to: "2026-11-12" },
  { id: "66666666-6666-4666-8666-666666666666", organization_id: organizationId,
    culture_id: cultureId, environment_id: envB, valid_from: "2026-11-12", valid_to: null },
];
const environments = [
  { id: envA, organization_id: organizationId, location_id: locationA },
  { id: envB, organization_id: organizationId, location_id: locationB },
];
const culture = { id: cultureId, organization_id: organizationId, environment_id: envB };
const measurements = [{
  id: "77777777-7777-4777-8777-777777777777",
  organization_id: organizationId, culture_id: cultureId, environment_id: envA,
  variable_code: "air_temperature", raw_value: 295, raw_unit_code: "K",
  normalized_value: 22, normalized_unit_code: "degC", measured_at: "2026-11-10T08:00:00Z",
}];
const weather = [{
  id: "88888888-8888-4888-8888-888888888888", organization_id: organizationId,
  location_id: locationA, data_family: "weather", provider_code: "NASA_POWER",
  dataset_code: "POWER_DAILY", variable_code: "T2M", value: 19, unit_code: "degC",
  observed_at: "2026-11-10T00:00:00Z",
}];
const singleWindow = { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" };
const assembled = await assembleResolvedBiologicalContextSnapshot({
  organizationId, culture, contexts, environments, measurements,
  environmentalObservations: weather, window: singleWindow,
});
assert.equal(assembled.scope.environment_id, envA,
  "historical context, not current culture FK, selects the environment");
assert.equal(assembled.scope.location_id, locationA);
assert.equal(assembled.input.records.length, 2);
assert.equal(assembled.input.records.find((row) => row.record_type === "measurement").context.environment_id, envA);
assert.equal(assembled.context_resolution.window.status, "resolved");
assert.deepEqual(assembled.excluded_environmental_observation_ids, []);

const conflictingMeasurement = await assembleResolvedBiologicalContextSnapshot({
  organizationId, culture, contexts, environments,
  measurements: [{ ...measurements[0], environment_id: envB }],
  environmentalObservations: weather, window: singleWindow,
});
const conflictingRecord = conflictingMeasurement.input.records.find((row) => row.record_type === "measurement");
assert.equal(conflictingRecord.context.environment_resolution.status, "conflict");
assert.equal(conflictingRecord.context.environment_id, null,
  "a conflicting raw FK must not be restored after temporal resolution rejects it");

const spanning = await assembleResolvedBiologicalContextSnapshot({
  organizationId, culture, contexts, environments, measurements,
  environmentalObservations: weather,
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-13T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(spanning.context_resolution.window.status, "ambiguous");
assert.equal(spanning.input.records.length, 1,
  "weather must be excluded when the requested window spans multiple locations");
assert.equal(spanning.parameters.environment_link_state, "ambiguous");
assert.deepEqual(spanning.excluded_environmental_observation_ids, [weather[0].id]);

console.log("✓ BIE context assembly: historical environment wins; weather requires one unambiguous window location");
