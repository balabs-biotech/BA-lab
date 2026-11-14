import assert from "node:assert/strict";
import { buildBiologicalReferenceAssertions, loadAuthenticatedBiologicalReferenceAssertions } from "../supabase/functions/_shared/biological-reference-assertions.ts";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const context = { taxon_code: "NCBI:pleurotus_ostreatus", strain_code: "P80", substrate_code: "wheat_straw" };
const source = {
  id: sourceId, organization_id: org, reference_id: "ba-labs.synthetic.source",
  reference_version: "1.0.0", content_sha256: "a".repeat(64),
  status: "validated", reviewed_at: "2026-11-01T00:00:00Z",
};
const assertion = {
  organization_id: org, assertion_code: "pleurotus.ostreatus.substrate.reported",
  assertion_version: "1.0.0", subject_type: "taxon", subject_ref: context.taxon_code,
  predicate_code: "substrate.association", object_value: { substrate: "wheat_straw", relation: "reported" },
  unit_code: null, reference_registry_id: sourceId, source_locator: "section-4",
  evidence_level: "L0", applicability: { scope: "synthetic fixture" },
  uncertainty: { assessment: "not_assessed" }, status: "validated",
  reviewed_at: "2026-11-02T00:00:00Z",
};
const built = await buildBiologicalReferenceAssertions({
  organizationId: org, contexts: [context], assertions: [assertion], references: [source],
});
assert.equal(built.state, "documented");
assert.equal(built.assertions.length, 1);
assert.equal(built.assertions[0].source.reference_id, source.reference_id);
assert.equal(built.assertions[0].source_locator, "section-4");
assert.equal(built.assertions[0].evidence_level, "L0");
assert.equal(built.datasets[0].provider, "BA_LABS_BIOLOGICAL_REFERENCE_ASSERTION");
assert.match(built.assertions[0].content_sha256, /^[0-9a-f]{64}$/);

const draft = await buildBiologicalReferenceAssertions({
  organizationId: org, contexts: [context], assertions: [{ ...assertion, status: "draft" }], references: [source],
});
assert.equal(draft.state, "not_documented");
assert.equal(draft.assertions.length, 0);

const otherTenant = await buildBiologicalReferenceAssertions({
  organizationId: org, contexts: [context],
  assertions: [{ ...assertion, organization_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
  references: [source],
});
assert.equal(otherTenant.assertions.length, 0);

await assert.rejects(buildBiologicalReferenceAssertions({
  organizationId: org, contexts: [context], assertions: [assertion],
  references: [{ ...source, status: "retired" }],
}), /biological_reference_assertion_source_not_validated/);

const second = {
  ...assertion, assertion_code: "pleurotus.ostreatus.substrate.alternative",
  object_value: { substrate: "coffee_waste", relation: "reported" },
};
const conflict = await buildBiologicalReferenceAssertions({
  organizationId: org, contexts: [context], assertions: [assertion, second], references: [source],
});
assert.equal(conflict.state, "conflicting");

const calls = [];
const client = { from(table) {
  const q = {
    select() { return this; }, eq(...args) { calls.push([table, "eq", ...args]); return this; },
    in(...args) { calls.push([table, "in", ...args]); return this; },
    limit() { return Promise.resolve({ error: null, data: table === "biological_reference_assertions" ? [assertion] : [source] }); },
  };
  return q;
}};
const loaded = await loadAuthenticatedBiologicalReferenceAssertions({
  userClient: client, organizationId: org, biologicalContexts: [context],
});
assert.equal(loaded.state, "documented");
assert.ok(calls.some((call) => call[0] === "biological_reference_assertions" &&
  call[1] === "eq" && call[2] === "organization_id" && call[3] === org));
assert.ok(calls.some((call) => call[0] === "biological_reference_assertions" &&
  call[1] === "eq" && call[2] === "status" && call[3] === "validated"));
const absent = await loadAuthenticatedBiologicalReferenceAssertions({
  userClient: client, organizationId: org, biologicalContexts: [{}],
});
assert.equal(absent.state, "not_applicable");
console.log("Biological reference assertion resolver contract passed");
