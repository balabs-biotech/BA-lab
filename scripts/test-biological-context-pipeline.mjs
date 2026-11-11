import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, String, Set, Number, Date, globalThis: {} };
for (const file of [
  "shared/biological-rule-registry.js",
  "shared/biological-rule-resolver.js",
  "shared/biological-context-adapter.js",
]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const adapter = context.globalThis.BALabsBiologicalContextAdapter;
const resolver = context.globalThis.BALabsBiologicalRuleResolver;
const snapshot = {
  organization_id: "org-1",
  culture: { organization_id: "org-1", id: "culture-1", material_id: "material-1", environment_id: null },
  material: { organization_id: "org-1", id: "material-1", strain_id: "strain-1" },
  strain: { organization_id: "org-1", id: "strain-1", strain_code: "PLEU-OST-01", organism_id: "organism-1" },
  organism: { id: "organism-1", taxonomy_id: "ncbi:12345", scientific_name: "Pleurotus ostreatus" },
  environment: null,
};
const built = adapter.build(snapshot);
const rule = {
  rule_id: "mycology.taxonomy-range",
  version: "1.0.0",
  status: "reviewed",
  domain: "mycology",
  target: { taxon_code: "ncbi:12345" },
  variable_code: "incubation_temperature",
  unit_code: "degC",
  min: 20,
  max: 24,
  sources: [{ type: "publication", citation: "Verified source fixture" }],
  review: { reviewer_id: "reviewer-1", reviewed_at: "2026-11-11T10:00:00.000Z" },
};
const resolved = resolver.resolve({
  domain: "mycology",
  variable_code: "incubation_temperature",
  unit_code: "degC",
  context: built.context,
  rules: [rule],
});
assert.equal(resolved.status, "matched_rule");
assert.equal(resolved.rule.rule_id, rule.rule_id);

const stageSpecific = { ...rule, rule_id: "mycology.stage-range", target: { taxon_code: "ncbi:12345", growth_stage: "incubation" } };
const unresolved = resolver.resolve({
  domain: "mycology",
  variable_code: "incubation_temperature",
  unit_code: "degC",
  context: built.context,
  rules: [stageSpecific],
});
assert.equal(unresolved.status, "insufficient_context",
  "a rule requiring a growth stage must not run while BAL-Core has no structured stage");
assert.equal(built.context.strain_code, "PLEU-OST-01");
assert.equal("growth_stage" in built.context, false);

console.log("✓ Context-to-rule pipeline: exact taxonomy match and safe block when stage data is absent");
