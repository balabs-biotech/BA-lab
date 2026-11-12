import assert from "node:assert/strict";
import { resolveBiologicalContext } from "../supabase/functions/_shared/biological-context-resolver.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const cultureId = "22222222-2222-4222-8222-222222222222";
const envA = "33333333-3333-4333-8333-333333333333";
const envB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const locationA = "44444444-4444-4444-8444-444444444444";
const locationB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const environments = [
  { id: envA, organization_id: organizationId, location_id: locationA },
  { id: envB, organization_id: organizationId, location_id: locationB },
];
const window = {
  start: "2026-11-10T00:00:00Z",
  end: "2026-11-13T00:00:00Z",
  timezone: "Africa/Algiers",
};
const contexts = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    organization_id: organizationId,
    culture_id: cultureId,
    environment_id: envA,
    valid_from: "2026-11-01",
    valid_to: "2026-11-12",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    organization_id: organizationId,
    culture_id: cultureId,
    environment_id: envB,
    valid_from: "2026-11-12",
    valid_to: null,
  },
];

const resolved = resolveBiologicalContext({
  organizationId,
  cultureId,
  currentEnvironmentId: envB,
  contexts,
  environments,
  measurements: [
    { id: "m-old", measured_at: "2026-11-10T08:00:00Z", environment_id: envA },
    { id: "m-new", measured_at: "2026-11-12T08:00:00Z", environment_id: envB },
  ],
  window,
});
assert.deepEqual(resolved.measurements.map((item) => item.environment_id), [envA, envB]);
assert.equal(resolved.measurements[0].status, "resolved");
assert.equal(resolved.measurements[1].status, "resolved");
assert.equal(resolved.window.status, "ambiguous",
  "a window spanning two environments must not be collapsed to the culture's current environment");

const endsAtTransition = resolveBiologicalContext({
  organizationId, cultureId, currentEnvironmentId: envB, contexts, environments,
  measurements: [],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T23:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(endsAtTransition.window.status, "resolved",
  "an exclusive window end exactly at the context transition must not include the next context");
assert.equal(endsAtTransition.window.environment_id, envA);

const mismatch = resolveBiologicalContext({
  organizationId, cultureId, currentEnvironmentId: envB, contexts, environments,
  measurements: [{ id: "m-conflict", measured_at: "2026-11-10T08:00:00Z", environment_id: envB }],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(mismatch.measurements[0].status, "conflict");
assert.equal(mismatch.measurements[0].reason, "measurement_environment_context_mismatch");

const ambiguous = resolveBiologicalContext({
  organizationId, cultureId, currentEnvironmentId: null,
  contexts: [contexts[0], { ...contexts[0], id: "77777777-7777-4777-8777-777777777777", environment_id: envB }],
  environments, measurements: [{ id: "m1", measured_at: "2026-11-10T08:00:00Z", environment_id: null }],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(ambiguous.measurements[0].status, "ambiguous");

const directMeasurementLink = resolveBiologicalContext({
  organizationId, cultureId, currentEnvironmentId: envB, contexts: [], environments,
  measurements: [{ id: "m-direct", measured_at: "2026-11-10T08:00:00Z", environment_id: envA }],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(directMeasurementLink.measurements[0].environment_id, envA,
  "an explicit historical measurement FK takes precedence over the current culture FK");
assert.equal(directMeasurementLink.measurements[0].status, "resolved");

const noContext = resolveBiologicalContext({
  organizationId, cultureId, currentEnvironmentId: envB, contexts: [], environments,
  measurements: [{ id: "m-unlinked", measured_at: "2026-11-10T08:00:00Z", environment_id: null }],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(noContext.measurements[0].status, "missing");
assert.equal(noContext.measurements[0].reason, "historical_environment_not_resolved");

console.log("✓ BIE temporal resolver: dated context, explicit measurement FK, conflict and ambiguity handling");

const plantCultureId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const plantContext = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  organization_id: organizationId,
  culture_id: null,
  plant_culture_id: plantCultureId,
  environment_id: envA,
  valid_from: "2026-11-01",
  valid_to: "2026-11-12",
};
const plantResolution = resolveBiologicalContext({
  organizationId, plantCultureId, contexts: [plantContext], environments,
  measurements: [{ id: "plant-m1", measured_at: "2026-11-10T08:00:00Z", environment_id: envA }],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(plantResolution.measurements[0].status, "resolved");
assert.equal(plantResolution.window.status, "resolved");
assert.equal(plantResolution.window.environment_id, envA);
const wrongPlant = resolveBiologicalContext({
  organizationId, plantCultureId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  contexts: [plantContext], environments, measurements: [],
  window: { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" },
});
assert.equal(wrongPlant.window.status, "missing",
  "plant contexts must never resolve across plant_culture_id boundaries");
console.log("✓ BIE temporal resolver: GreenTech plant_culture_id isolation and dated environment resolution");
