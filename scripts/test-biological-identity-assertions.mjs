import assert from "node:assert/strict";
import { loadAuthenticatedBiologicalIdentityAssertions } from "../supabase/functions/_shared/biological-identity-assertions.ts";
const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organismId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const strainId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const source = {
  organization_id: organizationId, reference_id: "source.taxonomy", reference_version: "1.0.0",
  content_sha256: "a".repeat(64), status: "validated", reviewed_at: "2026-11-01T00:00:00Z",
};
const assertion = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", organization_id: organizationId,
  assertion_code: "strain.identity.designation", assertion_version: "1.0.0",
  subject_type: "strain", organism_id: organismId, strain_id: strainId,
  assertion_type: "strain.designation", assertion_value: "P80",
  source_reference_id: source.reference_id, source_reference_version: source.reference_version,
  evidence_level: "documented", content_sha256: "b".repeat(64), status: "validated",
  reviewed_at: "2026-11-02T00:00:00Z", valid_from: "2026-01-01", valid_to: null,
};
const calls = [];
const client = { from(table) {
  calls.push(["from", table]);
  const query = {
    select() { return this; }, eq(...args) { calls.push([table, "eq", ...args]); return this; },
    in(...args) { calls.push([table, "in", ...args]); return this; },
    limit() { return Promise.resolve({ error: null, data: table === "biological_identity_assertions" ? [assertion] : [source] }); },
  };
  return query;
}};
const result = await loadAuthenticatedBiologicalIdentityAssertions({
  userClient: client, organizationId,
  biologicalContexts: [{ genetic_reference: { organism_id: organismId, strain_id: strainId } }],
  windowStartDate: "2026-11-01", windowLastIncludedDate: "2026-11-03",
});
assert.equal(result.state, "documented");
assert.equal(result.assertions.length, 1);
assert.equal(result.assertions[0].assertion_value, "P80");
assert.equal(result.datasets.length, 1);
assert.deepEqual(calls.filter((call) => call[0] === "from").map((call) => call[1]), [
  "biological_identity_assertions", "biological_reference_registry",
]);
assert.ok(calls.some((call) => call[0] === "biological_identity_assertions" &&
  call[1] === "eq" && call[2] === "organization_id" && call[3] === organizationId));
const absent = await loadAuthenticatedBiologicalIdentityAssertions({
  userClient: client, organizationId, biologicalContexts: [],
  windowStartDate: "2026-11-01", windowLastIncludedDate: "2026-11-03",
});
assert.equal(absent.state, "not_documented");
await assert.rejects(loadAuthenticatedBiologicalIdentityAssertions({
  userClient: client, organizationId, biologicalContexts: [],
  windowStartDate: "not-a-date", windowLastIncludedDate: "2026-11-03",
}), /biological_identity_context_invalid/);
console.log("Biological identity assertion resolver contract passed");
