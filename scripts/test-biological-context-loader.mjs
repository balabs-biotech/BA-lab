import assert from "node:assert/strict";
import { loadAuthenticatedBiologicalContextSnapshot } from "../supabase/functions/_shared/biological-context-loader.ts";

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
    culture_id: cultureId, environment_id: envA, valid_from: "2026-11-01", valid_to: "2026-11-12" }],
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
assert.equal(counts.environmental_observations, 1);

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
