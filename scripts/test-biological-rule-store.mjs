import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, String, Set, Number, Date, Map, globalThis: {} };
for (const file of ["shared/biological-rule-registry.js", "shared/biological-rule-store.js"]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const store = context.globalThis.BALabsBiologicalRuleStore;
const reviewed = (ruleId, version = "1.0.0", status = "reviewed") => ({
  rule_id: ruleId, version, status, domain: "mycology", target: { taxon_code: "ncbi:123" },
  variable_code: "temperature", unit_code: "degC", min: 18, max: 24,
  sources: [{ type: "publication", citation: "Source fixture" }],
  ...(status === "reviewed" ? { review: { reviewer_id: "reviewer-1", reviewed_at: "2026-11-11T10:00:00Z" } } : {}),
});
const row = (rule, createdAt, id = rule.rule_id) => ({
  id, organization_id: "org-A", rule_id: rule.rule_id, version: rule.version,
  status: rule.status, domain: rule.domain, variable_code: rule.variable_code,
  unit_code: rule.unit_code, rule, created_at: createdAt,
});
const rows = [
  row(reviewed("rule-active", "2.0.0"), "2026-11-11T12:00:00Z", "z"),
  row(reviewed("rule-active", "1.0.0"), "2026-11-10T12:00:00Z", "a"),
  row(reviewed("rule-retired", "2.0.0", "retired"), "2026-11-11T11:00:00Z", "r2"),
  row(reviewed("rule-retired", "1.0.0"), "2026-11-10T11:00:00Z", "r1"),
  row(reviewed("rule-draft", "1.0.0", "draft"), "2026-11-11T10:00:00Z", "d"),
  row(reviewed("rule-corrupt", "2.0.0"), "2026-11-11T09:00:00Z", "c2"),
  row(reviewed("rule-corrupt", "1.0.0"), "2026-11-10T09:00:00Z", "c1"),
];
rows[5].rule = { ...rows[5].rule, version: "wrong-version" };
const calls = [];
const client = {
  from(table) {
    const query = { table, filters: [], orders: [] };
    calls.push(query);
    const builder = {
      select(columns) { query.columns = columns; return builder; },
      eq(column, value) { query.filters.push(["eq", column, value]); return builder; },
      in(column, value) { query.filters.push(["in", column, value]); return builder; },
      order(column, options) { query.orders.push([column, options]); return builder; },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
    };
    return builder;
  },
};
const result = await store.loadExecutableRules({
  client, organizationId: "org-A", domain: "mycology",
  variableCode: "temperature", unitCode: "degC",
});
assert.equal(result.status, "loaded");
assert.deepEqual(Array.from(result.rules, rule => rule.rule_id), ["rule-active"]);
assert.deepEqual(Array.from(result.rejected_rule_ids), ["rule-corrupt"]);
assert.ok(!result.rules.some(rule => rule.rule_id === "rule-retired"));
assert.ok(!result.rules.some(rule => rule.rule_id === "rule-draft"));
assert.ok(calls[0].filters.some(([kind, key, value]) => kind === "eq" && key === "organization_id" && value === "org-A"));
assert.ok(calls[0].filters.some(([kind, key, value]) => kind === "in" && key === "status" && value.includes("retired")));
assert.equal((await store.loadExecutableRules({ client, organizationId: "", domain: "mycology", variableCode: "temperature", unitCode: "degC" })).status, "insufficient_context");

console.log("✓ Biological Rule Store: tenant scope, latest version, retirement suppression and fail-closed validation");
