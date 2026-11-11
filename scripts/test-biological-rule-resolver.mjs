import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, Number, String, Set, Date, globalThis: {} };
for (const file of ["shared/biological-rule-registry.js", "shared/biological-rule-resolver.js"]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const resolver = context.globalThis.BALabsBiologicalRuleResolver;
const rule = {
  rule_id: "mycology.pleurotus.ostreatus.incubation.temperature",
  version: "1.0.0", status: "reviewed", domain: "mycology",
  target: { taxon_code: "pleurotus_ostreatus", growth_stage: "incubation" },
  variable_code: "incubation_temperature", unit_code: "degC", min: 20, max: 24,
  sources: [{ type: "publication", citation: "Verified source placeholder for resolver test" }],
  review: { reviewer_id: "reviewer-001", reviewed_at: "2026-11-11T10:00:00.000Z" },
};
const input = {
  domain: "mycology", variable_code: "incubation_temperature", unit_code: "degC",
  context: { culture_id: "culture-1", taxon_code: "pleurotus_ostreatus", growth_stage: "incubation" },
  rules: [rule],
};

assert.equal(resolver.version, "0.1.0");
assert.equal(resolver.resolve(input).status, "matched_rule");
assert.equal(resolver.resolve({ ...input, context: { culture_id: "culture-1" } }).status, "insufficient_context");
assert.equal(resolver.resolve({ ...input, context: { ...input.context, taxon_code: "other_taxon" } }).status, "no_matching_rule");
assert.equal(resolver.resolve({ ...input, rules: [{ ...rule, status: "draft" }] }).status, "no_matching_rule");
assert.equal(resolver.resolve({ ...input, unit_code: "K" }).status, "no_matching_rule");
assert.equal(resolver.resolve({ ...input, rules: [rule, { ...rule, rule_id: "another-rule" }] }).status, "ambiguous_rule");
assert.equal(resolver.resolve({ ...input, domain: "" }).status, "insufficient_context");

console.log("✓ Biological Rule Resolver: exact selection, reviewed-only filtering, missing context and ambiguity fail-closed");
