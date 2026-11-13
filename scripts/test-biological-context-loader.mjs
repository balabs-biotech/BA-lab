import assert from "node:assert/strict";
import { loadAuthenticatedBiologicalContextSnapshot, loadAuthenticatedPlantBiologicalContextSnapshot } from "../supabase/functions/_shared/biological-context-loader.ts";

class MockQuery {
  constructor(table, datasets, counts) {
    this.table = table; this.datasets = datasets; this.counts = counts; this.filters = []; this.max = Infinity;
    counts[table] = (counts[table] ?? 0) + 1;
  }
  select() { return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
  gte(key, value) { this.filters.push((row) => row[key] >= value); return this; }
  lt(key, value) { this.filters.push((row) => row[key] < value); return this; }
  order() { return this; }
  limit(value) { this.max = value; return this; }
  rows() { return (this.datasets[this.table] ?? []).filter((row) => this.filters.every((fn) => fn(row))).slice(0, this.max); }
  async maybeSingle() { return { data: this.rows()[0] ?? null, error: null }; }
  then(resolve, reject) { return Promise.resolve({ data: this.rows(), error: null }).then(resolve, reject); }
}
function clientFor(datasets, counts = {}) {
  return { from(table) { return new MockQuery(table, datasets, counts); }, counts };
}

const org = "11111111-1111-4111-8111-111111111111";
const cultureId = "22222222-2222-4222-8222-222222222222";
const envA = "33333333-3333-4333-8333-333333333333";
const envB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const locationA = "44444444-4444-4444-8444-444444444444";
const locationB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const measurementId = "55555555-5555-4555-8555-555555555555";
const weatherId = "66666666-6666-4666-8666-666666666666";
const window = { start: "2026-11-10T00:00:00Z", end: "2026-11-11T00:00:00Z", timezone: "Africa/Algiers" };
const base = {
  cultures: [{ id: cultureId, organization_id: org, environment_id: envB }],
  biological_contexts: [{ id: "77777777-7777-4777-8777-777777777777", organization_id: org,
    culture_id: cultureId, environment_id: envA, organism_kind: "fungus", taxon_code: "PLEURO",
    strain_code: "HK35", cultivar_code: null, culture_stage: "fruiting", substrate_code: "straw",
    production_system: "monotub", context_tags: ["test-context"],
    valid_from: "2026-11-01", valid_to: "2026-11-12" }],
  strains: [{ id: "99999999-9999-4999-8999-999999999999", organization_id: org,
    strain_code: "HK35", organism_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    designation: "HK35", origin: "reference collection", source_description: "verified strain record" }],
  organisms: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab", scientific_name: "Pleurotus ostreatus",
    common_name: "Oyster mushroom", taxonomy_source: "NCBI", taxonomy_id: "FungiDB:example" }],
  measurements: [{ id: measurementId, organization_id: org, culture_id: cultureId, environment_id: envA,
    variable_code: "air_temperature", raw_value: 295, raw_unit_code: "K", normalized_value: 22,
    normalized_unit_code: "degC", measured_at: "2026-11-10T08:00:00Z", quality_state: "valid", metadata: {} }],
  environments: [
    { id: envA, organization_id: org, location_id: locationA },
    { id: envB, organization_id: org, location_id: locationB },
  ],
  locations: [
    { id: locationA, organization_id: org },
    { id: locationB, organization_id: org },
  ],
  environmental_observations: [{ id: weatherId, organization_id: org, location_id: locationA,
    data_family: "weather", provider_code: "NASA_POWER", dataset_code: "POWER_DAILY",
    variable_code: "T2M", value: 19, unit_code: "degC", observed_at: "2026-11-10T00:00:00Z",
    retrieved_at: "2026-11-11T00:00:00Z", metadata: {} }],
};
const counts = {};
const snapshot = await loadAuthenticatedBiologicalContextSnapshot({
  userClient: clientFor(base, counts), organizationId: org, cultureId, window,
});
assert.equal(snapshot.scope.environment_id, envA);
assert.equal(snapshot.scope.location_id, locationA);
assert.equal(snapshot.input.records.length, 2);
assert.equal(snapshot.parameters.biological_context_supplied, true);
assert.equal(snapshot.parameters.biological_contexts.length, 1);
assert.equal(snapshot.parameters.biological_contexts[0].culture_stage, "fruiting");
assert.equal(snapshot.parameters.biological_contexts[0].genetic_reference.status, "resolved");
assert.equal(snapshot.parameters.biological_contexts[0].genetic_reference.scientific_name, "Pleurotus ostreatus");
assert.deepEqual(snapshot.parameters.biological_contexts[0].context_tags, ["test-context"]);
assert.equal(counts.strains, 1);
assert.equal(counts.organisms, 1);
assert.equal(counts.environmental_observations, 1);

// A newly created culture may have no biological context, measurements,
// environment history or weather observations. The authenticated loader
// must still produce a valid empty snapshot and must not infer the mutable
// current environment from cultures.environment_id.
const emptyCultureData = {
  cultures: [{ id: cultureId, organization_id: org, environment_id: envB }],
  biological_contexts: [],
  measurements: [],
  environments: [],
  locations: [],
  environmental_observations: [],
};
const emptyCultureCounts = {};
const emptyCultureSnapshot = await loadAuthenticatedBiologicalContextSnapshot({
  userClient: clientFor(emptyCultureData, emptyCultureCounts),
  organizationId: org,
  cultureId,
  window,
});
assert.deepEqual(emptyCultureSnapshot.input.records, []);
assert.deepEqual(emptyCultureSnapshot.input.record_ids, []);
assert.equal(emptyCultureSnapshot.scope.culture_id, cultureId);
assert.equal(Object.hasOwn(emptyCultureSnapshot.scope, "environment_id"), false);
assert.equal(emptyCultureSnapshot.parameters.biological_context_supplied, false);
assert.equal(emptyCultureSnapshot.parameters.environment_link_state, "missing");
assert.equal(emptyCultureSnapshot.parameters.profile_context_stable, false);
assert.equal(emptyCultureSnapshot.parameters.profile_domain, null);
assert.equal(emptyCultureCounts.environmental_observations ?? 0, 0,
  "an empty culture must not trigger an unscoped weather query");
assert.equal(emptyCultureCounts.strains ?? 0, 0);
assert.equal(emptyCultureCounts.organisms ?? 0, 0);

const ambiguousData = structuredClone(base);
ambiguousData.biological_contexts.push({
  id: "88888888-8888-4888-8888-888888888888", organization_id: org, culture_id: cultureId,
  environment_id: envB, valid_from: "2026-11-10", valid_to: null,
});
const ambiguousCounts = {};
const ambiguous = await loadAuthenticatedBiologicalContextSnapshot({
  userClient: clientFor(ambiguousData, ambiguousCounts), organizationId: org, cultureId,
  window: { ...window, end: "2026-11-13T00:00:00Z" },
});
assert.equal(ambiguous.context_resolution.window.status, "ambiguous");
assert.equal(ambiguous.input.records.length, 1);
assert.equal(ambiguousCounts.environmental_observations ?? 0, 0,
  "weather query must not run if the analysis window has no unique historical location");

await assert.rejects(() => loadAuthenticatedBiologicalContextSnapshot({
  userClient: clientFor(base), organizationId: "99999999-9999-4999-8999-999999999999", cultureId, window,
}), /culture_not_found_or_inaccessible/);

const tooManyContexts = structuredClone(base);
tooManyContexts.biological_contexts = Array.from({ length: 501 }, (_, index) => ({
  ...base.biological_contexts[0],
  id: "77777777-7777-4777-8777-" + String(index).padStart(12, "0"),
}));
await assert.rejects(() => loadAuthenticatedBiologicalContextSnapshot({
  userClient: clientFor(tooManyContexts), organizationId: org, cultureId, window,
}), /biological_analysis_context_limit_exceeded/);

console.log("✓ BIE authenticated loader: caller-scoped reads, tenant filters, bounded queries and weather gating");

const plantCultureId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const plantMeasurementId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const plantData = {
  plant_cultures: [{
    id: plantCultureId, organization_id: org, environment_id: envB,
    species_name: "Solanum lycopersicum", cultivar_name: "Yellow Pear",
    crop_type: "tomato", substrate: "Technosoil", started_at: "2026-10-01T08:00:00Z",
  }],
  biological_contexts: [{
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", organization_id: org,
    plant_culture_id: plantCultureId, culture_id: null, domain: "greentech",
    environment_id: envA, organism_kind: "plant", taxon_code: "Solanum lycopersicum",
    cultivar_code: "Yellow Pear", culture_stage: "vegetative",
    substrate_code: "Technosoil", production_system: "greenhouse",
    context_tags: ["greentech-trial"], valid_from: "2026-11-01", valid_to: null,
  }],
  measurements: [{
    id: plantMeasurementId, organization_id: org, plant_culture_id: plantCultureId,
    culture_id: null, environment_id: envA, variable_code: "air_temperature",
    raw_value: 297, raw_unit_code: "K", normalized_value: 24,
    normalized_unit_code: "degC", measured_at: "2026-11-10T08:00:00Z",
    quality_state: "valid", metadata: {},
  }],
  environments: base.environments,
  locations: base.locations,
  environmental_observations: base.environmental_observations,
};
const plantCounts = {};
const plantSnapshot = await loadAuthenticatedPlantBiologicalContextSnapshot({
  userClient: clientFor(plantData, plantCounts), organizationId: org, plantCultureId, window,
});
assert.equal(plantSnapshot.scope.plant_culture_id, plantCultureId);
assert.equal(Object.hasOwn(plantSnapshot.scope, "culture_id"), false);
assert.equal(plantSnapshot.input.records.length, 2);
const plantMeasurement = plantSnapshot.input.records.find((row) => row.record_type === "measurement");
assert.equal(plantMeasurement.context.plant_culture_id, plantCultureId);
assert.equal(Object.hasOwn(plantMeasurement.context, "culture_id"), false);
assert.equal(plantSnapshot.parameters.biological_contexts[0].organism_kind, "plant");
assert.equal(plantSnapshot.parameters.biological_contexts[0].cultivar_code, "Yellow Pear");
assert.equal(plantCounts.plant_cultures, 1);
assert.equal(plantCounts.environmental_observations, 1);
await assert.rejects(() => loadAuthenticatedPlantBiologicalContextSnapshot({
  userClient: clientFor(plantData), organizationId: "99999999-9999-4999-8999-999999999999", plantCultureId, window,
}), /plant_culture_not_found_or_inaccessible/);


const unlinkedPlantData = structuredClone(plantData);
unlinkedPlantData.biological_contexts = [];
unlinkedPlantData.measurements = [];
const unlinkedPlantCounts = {};
const unlinkedPlant = await loadAuthenticatedPlantBiologicalContextSnapshot({
  userClient: clientFor(unlinkedPlantData, unlinkedPlantCounts),
  organizationId: org, plantCultureId, window,
});
assert.equal(unlinkedPlant.scope.environment_id, undefined,
  "the plant record's mutable current environment must not be used as a historical fallback");
assert.equal(unlinkedPlant.parameters.environment_link_state, "missing");
assert.equal(unlinkedPlantCounts.environmental_observations ?? 0, 0);

const mixedPlantContext = structuredClone(plantData);
mixedPlantContext.biological_contexts[0].culture_id = cultureId;
await assert.rejects(() => loadAuthenticatedPlantBiologicalContextSnapshot({
  userClient: clientFor(mixedPlantContext), organizationId: org, plantCultureId, window,
}), /plant_biological_context_scope_mismatch/);
const mixedPlantMeasurement = structuredClone(plantData);
mixedPlantMeasurement.measurements[0].culture_id = cultureId;
await assert.rejects(() => loadAuthenticatedPlantBiologicalContextSnapshot({
  userClient: clientFor(mixedPlantMeasurement), organizationId: org, plantCultureId, window,
}), /plant_culture_measurement_scope_mismatch/);

console.log("✓ BIE GreenTech loader: authenticated plant scope, temporal contexts, measurement and weather provenance");
