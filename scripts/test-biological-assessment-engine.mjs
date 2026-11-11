import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { Object, Array, String, Set, Number, Date, globalThis: {} };
for (const file of [
  "shared/biological-rule-registry.js",
  "shared/biological-rule-resolver.js",
  "shared/biological-interpreter.js",
  "shared/biological-assessment-engine.js",
]) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const engine = context.globalThis.BALabsBiologicalAssessmentEngine;
const rule = {
  rule_id: "mycology.taxonomy.temperature",
  version: "1.0.0", status: "reviewed", domain: "mycology",
  target: { taxon_code: "ncbi:12345" },
  variable_code: "incubation_temperature", unit_code: "degC", min: 20, max: 24,
  sources: [{ type: "publication", citation: "Verified source fixture" }],
  review: { reviewer_id: "reviewer-1", reviewed_at: "2026-11-11T10:00:00.000Z" },
};
const measurement = {
  variable_code: "incubation_temperature",
  assessed_value: 22,
  assessed_unit_code: "degC",
  raw_value: 22,
  raw_unit_code: "degC",
};
const contextData = { culture_id: "culture-1", taxon_code: "ncbi:12345", strain_code: "PLEU-OST-01" };
const input = { domain: "mycology", measurement, context: contextData, rules: [rule] };

assert.equal(engine.version, "0.1.0");
const normal = engine.assess(input);
assert.equal(normal.status, "normal");
assert.equal(normal.engine_version, engine.version);
assert.equal(normal.resolution.status, "matched_rule");
assert.equal(normal.assessment.rule_id, rule.rule_id);
assert.equal(normal.raw_measurement_modified, false);

const outOfRange = engine.assess({ ...input, measurement: { ...measurement, assessed_value: 30 } });
assert.equal(outOfRange.status, "out_of_range");
assert.equal(outOfRange.engine_version, engine.version);

const missingStageRule = { ...rule, target: { taxon_code: "ncbi:12345", growth_stage: "incubation" } };
const missingStage = engine.assess({ ...input, rules: [missingStageRule] });
assert.equal(missingStage.status, "insufficient_context");
assert.equal(missingStage.assessment, null);

const ambiguous = engine.assess({ ...input, rules: [rule, { ...rule, rule_id: "duplicate" }] });
assert.equal(ambiguous.status, "ambiguous_rule");
assert.equal(ambiguous.assessment, null);

const noUnitConversion = engine.assess({
  ...input, measurement: { ...measurement, assessed_unit_code: "K" },
});
assert.equal(noUnitConversion.status, "no_matching_rule");
assert.equal(noUnitConversion.assessment, null);

console.log("✓ Biological Assessment Engine: resolver-to-interpreter orchestration, ambiguity and missing context fail closed");
