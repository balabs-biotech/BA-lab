import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, String, Set, Number, Date, Map, globalThis: {} };
for (const file of ["shared/biological-rule-registry.js", "shared/biological-rule-authoring.js"]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const authoring = context.globalThis.BALabsBiologicalRuleAuthoring;
const draft = {
  rule_id: "mycology.temperature.pleurotus",
  version: "1.0.0", status: "draft", domain: "mycology",
  target: { taxon_code: "ncbi:12345" },
  variable_code: "temperature", unit_code: "degC", min: 20, max: 24,
  sources: [{ type: "publication", citation: "Scientific source fixture" }],
};
const inserted = [];
const client = {
  auth: { async getUser() { return { data: { user: { id: "reviewer-uuid" } }, error: null }; } },
  from(table) {
    assert.equal(table, "biological_rules");
    const state = {};
    const builder = {
      insert(payload) { state.insert = payload; inserted.push(payload); return builder; },
      update(payload) { state.update = payload; return builder; },
      select(columns) { state.columns = columns; return builder; },
      eq(key, value) { (state.filters ||= []).push([key, value]); return builder; },
      async single() {
        const payload = state.insert;
        return { data: { id: "row-1", revision_seq: 1, ...payload, created_at: "2026-11-11T10:00:00Z" }, error: null };
      },
      async maybeSingle() {
        if (state.update) {
          const payload = { ...state.original, ...state.update };
          return { data: {
            id: "row-1", revision_seq: 1, organization_id: "org-A",
            rule_id: payload.rule.rule_id, version: payload.rule.version,
            status: payload.status, rule: payload.rule,
            reviewed_by: "reviewer-uuid", reviewed_at: payload.rule.review.reviewed_at,
          }, error: null };
        }
        state.original = { id: "row-1", organization_id: "org-A", rule_id: draft.rule_id, version: draft.version, status: "draft", rule: draft };
        return { data: state.original, error: null };
      },
    };
    return builder;
  },
};
const created = await authoring.createDraft({ client, organizationId: "org-A", rule: draft });
assert.equal(created.status, "created");
assert.equal(inserted[0].organization_id, "org-A");
assert.equal(inserted[0].status, "draft");

const published = await authoring.reviewDraft({
  client, organizationId: "org-A", ruleId: draft.rule_id, version: draft.version,
  reviewNote: "Reviewed against source.",
});
assert.equal(published.status, "published");
assert.equal(published.record.rule.status, "reviewed");
assert.equal(published.record.rule.review.reviewer_id, "reviewer-uuid");
assert.equal(published.record.reviewed_by, "reviewer-uuid");
assert.ok(Number.isFinite(Date.parse(published.record.rule.review.reviewed_at)));

const retired = await authoring.retireRule({
  client, organizationId: "org-A", rule: published.record.rule, newVersion: "2.0.0",
});
assert.equal(retired.status, "retired");
assert.equal(retired.record.status, "retired");
assert.equal(retired.record.rule.version, "2.0.0");

const invalid = await authoring.createDraft({
  client, organizationId: "org-A", rule: { ...draft, min: 40, max: 10 },
});
assert.equal(invalid.status, "invalid_rule");

const unauthenticated = await authoring.reviewDraft({
  client: { auth: { async getUser() { return { data: { user: null }, error: { message: "no session" } }; } } },
  organizationId: "org-A", ruleId: draft.rule_id, version: draft.version,
});
assert.equal(unauthenticated.status, "unauthenticated");

console.log("✓ Biological Rule Authoring: draft creation, authenticated review, immutable retirement version and validation");
