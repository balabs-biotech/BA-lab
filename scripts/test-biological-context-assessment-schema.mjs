import assert from "node:assert/strict";
import fs from "node:fs";

const path = "schemas/biological/v1/context-assessment.schema.json";
const schema = JSON.parse(fs.readFileSync(path, "utf8"));

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.$id, "https://schemas.ba-labs.dz/biological/v1/context-assessment.schema.json");
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.result_type.const, "biological.context_assessment");
assert.equal(schema.properties.result_version.const, "1.0.0");

for (const key of [
  "result_type", "result_version", "subject", "coverage",
  "observed_facts", "derived_features", "findings", "hypotheses"
]) {
  assert.ok(schema.required.includes(key), "assessment schema must require " + key);
}

assert.deepEqual(schema.properties.subject.required, [
  "organization_id", "subject_type", "subject_id", "biological_contexts"
]);
assert.equal(schema.properties.subject.properties.biological_contexts.items.$ref, "#/$defs/biologicalContext");
assert.equal(schema.$defs.biologicalContext.properties.genetic_reference.$ref, "#/$defs/geneticReference");
assert.deepEqual(schema.$defs.geneticReference.properties.status.enum, [
  "not_specified", "unresolved", "resolved"
]);
assert.equal(schema.$defs.biologicalContext.properties.valid_to.type.includes("null"), true);
assert.deepEqual(schema.properties.subject.properties.subject_type.enum, ["culture", "batch"]);
assert.equal(schema.properties.coverage.properties.requested_window.$ref, "#/$defs/timeWindow");
assert.equal(schema.properties.coverage.properties.excluded_record_count.type, "integer");
assert.equal(schema.$defs.observedFact.properties.source_record_ids.$ref, "#/$defs/sourceReferences");
assert.equal(schema.$defs.derivedFeature.properties.source_record_ids.$ref, "#/$defs/sourceReferences");
assert.deepEqual(schema.$defs.finding.properties.evidence_state.enum, [
  "supported", "limited", "conflicting", "insufficient_data"
]);
assert.equal(schema.$defs.hypothesis.properties.status.const, "unverified");
assert.equal(schema.$defs.hypothesis.required.includes("requires_validation"), true);

// The result payload deliberately has no uncalibrated confidence score.
assert.equal(Object.hasOwn(schema.properties, "confidence"), false);
assert.equal(Object.hasOwn(schema.$defs.finding.properties, "confidence"), false);

for (const definition of Object.values(schema.$defs)) {
  if (definition.type === "object") {
    assert.equal(definition.additionalProperties, false,
      "all object definitions must reject undeclared fields");
  }
}
console.log("✓ Biological context assessment v1 schema: traceable facts, derived features, evidence states and explicitly unverified hypotheses");
