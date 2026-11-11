import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, Set, String, Promise, globalThis: {} };
vm.runInNewContext(fs.readFileSync("shared/biological-assessment-store.js", "utf8"), context);
const store = context.globalThis.BALabsBiologicalAssessmentStore;
const calls = [];
const client = {
  auth: { async getUser() { return { data: { user: { id: "user-A" } }, error: null }; } },
  async rpc(name, args) { calls.push({ name, args }); return { data: "assessment-uuid", error: null }; },
  from(table) {
    const query = { table, filters: [], orders: [], max: null };
    const builder = {
      select(value) { query.select = value; return builder; },
      eq(key, value) { query.filters.push(["eq", key, value]); return builder; },
      in(key, value) { query.filters.push(["in", key, value]); return builder; },
      order(key, value) { query.orders.push([key, value]); return builder; },
      limit(value) { query.max = value; return builder; },
      then(resolve, reject) {
        calls.push({ name: "select", query });
        return Promise.resolve({ data: [{
          id: "assessment-1", organization_id: "org-A", source_measurement_id: "measurement-A",
          status: "normal", calculation_origin: "client_engine", server_verification: "not_recomputed",
          assessed_at: "2026-11-11T12:00:00Z",
        }], error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
};

const recorded = await store.record({
  client, organizationId: "org-A", domain: "mycology", measurementId: "measurement-A",
  ruleVersionId: "rule-version-A",
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
  result: { status: "normal", reason: "within_explicit_reviewed_range", engine_version: "0.1.0" },
  measurementSnapshot: { variable_code: "temperature", assessed_value: 22, assessed_unit_code: "degC" },
  contextSnapshot: { culture_id: "culture-A" },
  resolutionSnapshot: { status: "matched_rule" },
  resultSnapshot: { status: "normal", reason: "within_explicit_reviewed_range", engine_version: "0.1.0", raw_measurement_modified: false },
});
assert.equal(recorded.status, "recorded");
assert.equal(recorded.id, "assessment-uuid");
assert.equal(calls[0].name, "record_biological_assessment");
assert.equal(calls[0].args.p_context_snapshot.organization_id, "org-A");
assert.equal(calls[0].args.p_context_snapshot.domain, "mycology");
assert.equal(calls[0].args.p_rule_version_id, "rule-version-A");
assert.equal(calls[0].args.p_idempotency_key, "00000000-0000-4000-8000-000000000001");

const history = await store.loadHistoryBatch({ client, organizationId: "org-A", measurementIds: ["measurement-A"] });
assert.equal(history.status, "loaded");
assert.equal(history.records.length, 1);
const query = calls.at(-1).query;
assert.equal(query.table, "biological_assessments");
assert.ok(query.filters.some(([kind, key, value]) => kind === "eq" && key === "organization_id" && value === "org-A"));
assert.ok(query.filters.some(([kind, key, value]) => kind === "in" && key === "source_measurement_id" && value.includes("measurement-A")));
assert.equal(query.max, 500);

const denied = await store.record({
  client: { ...client, auth: { async getUser() { return { data: { user: null }, error: null }; } } },
  organizationId: "org-A", measurementId: "measurement-A",
  result: { status: "normal", reason: "x", engine_version: "0.1.0" },
  measurementSnapshot: {}, contextSnapshot: {}, resolutionSnapshot: {}, resultSnapshot: {},
});
assert.equal(denied.status, "unauthenticated");

console.log("✓ Biological Assessment Store: authenticated append-only RPC, tenant/domain evidence and scoped history");
