import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const registrySource = fs.readFileSync("shared/biological-rule-registry.js", "utf8");
const source = fs.readFileSync("shared/biological-interpreter.js", "utf8");
const context = { Object, Array, Number, String, Set, globalThis: {} };
vm.runInNewContext(registrySource, context, { filename: "shared/biological-rule-registry.js" });
vm.runInNewContext(source, context, { filename: "shared/biological-interpreter.js" });
const engine = context.globalThis.BALabsBiologicalInterpreter;

const rule = {
  rule_id: "mycology-incubation-temperature-demo",
  status: "reviewed",
  target: { taxon_code: "pleurotus_ostreatus", growth_stage: "incubation" },
  sources: [{ type: "publication", citation: "Reviewed protocol v1" }],
  review: { reviewer_id: "reviewer-001", reviewed_at: "2026-11-11T10:00:00.000Z" },
  version: "1.0.0",
  variable_code: "incubation_temperature",
  unit_code: "degC",
  min: 20,
  max: 24,
  applies_to: { growth_stage: "incubation" },
};

const base = {
  assessed_value: 22,
  assessed_unit_code: "degC",
  variable_code: "incubation_temperature",
  context: {
    culture_id: "b0b0b0b0-0000-4000-8000-000000000001",
    strain_id: "c0c0c0c0-0000-4000-8000-000000000001",
    growth_stage: "incubation",
    taxon_code: "pleurotus_ostreatus",
  },
};

assert.equal(engine.version, "0.1.0");
assert.equal(engine.assessMeasurement({ measurement: base, rule }).status, "normal");
assert.equal(engine.assessMeasurement({ measurement: { ...base, assessed_value: 26 }, rule }).status, "out_of_range");
assert.equal(engine.assessMeasurement({ measurement: base, rule: null }).status, "insufficient_context");
assert.equal(engine.assessMeasurement({ measurement: base, rule: { ...rule, status: "draft" } }).status, "not_assessed");
assert.equal(engine.assessMeasurement({ measurement: { ...base, context: { culture_id: base.context.culture_id } }, rule }).status, "insufficient_context");
assert.equal(engine.assessMeasurement({ measurement: { ...base, assessed_unit_code: "K" }, rule }).status, "not_assessed");
assert.equal(engine.assessMeasurement({ measurement: base, rule: { ...rule, applies_to: { growth_stage: "fruiting" } } }).status, "not_assessed");
assert.equal(engine.assessMeasurement({ measurement: base, rule: { ...rule, target: { taxon_code: "pleurotus_pulmonarius" } } }).status, "not_assessed");

const result = engine.assessMeasurement({ measurement: base, rule });
assert.equal(result.rule_id, rule.rule_id);
assert.equal(result.rule_version, rule.version);
assert.equal(result.evidence.assessed_value, 22);
assert.equal(result.evidence.assessed_unit_code, "degC");
assert.equal(result.raw_measurement_modified, false);

console.log("✓ Biological Interpreter v0.1: explicit rule, context gating, unit gating, traceable evidence and no raw-data mutation");
