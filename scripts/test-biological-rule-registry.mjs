import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("shared/biological-rule-registry.js", "utf8");
const context = { Object, Array, Number, String, Set, Date, globalThis: {} };
vm.runInNewContext(source, context, { filename: "shared/biological-rule-registry.js" });
const registry = context.globalThis.BALabsBiologicalRuleRegistry;

const reviewedRule = {
  rule_id: "mycology.pleurotus.ostreatus.incubation.temperature",
  version: "1.0.0",
  status: "reviewed",
  domain: "mycology",
  target: { taxon_code: "pleurotus_ostreatus", growth_stage: "incubation" },
  variable_code: "incubation_temperature",
  unit_code: "degC",
  min: 20,
  max: 24,
  sources: [{ type: "publication", citation: "Example reference to be replaced by a verified source", url: "https://example.org/reference" }],
  review: { reviewer_id: "reviewer-001", reviewed_at: "2026-11-11T10:00:00.000Z" },
};

assert.equal(registry.validate(reviewedRule).valid, true);
assert.equal(registry.validate({ ...reviewedRule, status: "draft" }).valid, true);
assert.equal(registry.isExecutable(reviewedRule), true);
assert.equal(registry.isExecutable({ ...reviewedRule, status: "draft" }), false);
assert.equal(registry.isExecutable({ ...reviewedRule, status: "retired" }), false);
assert.equal(registry.validate({ ...reviewedRule, min: 30, max: 20 }).valid, false);
assert.equal(registry.validate({ ...reviewedRule, sources: [] }).valid, false);
assert.equal(registry.validate({ ...reviewedRule, review: null }).valid, false);
assert.equal(registry.validate({ ...reviewedRule, target: { growth_stage: "incubation" } }).valid, false);
assert.equal(registry.validate({ ...reviewedRule, unit_code: "" }).valid, false);

const unverified = { ...reviewedRule, sources: [{ type: "publication", citation: "", url: "" }] };
assert.equal(registry.validate(unverified).valid, false);

console.log("✓ Biological Rule Registry: structure, source provenance, context targeting and reviewed-only execution gate");
