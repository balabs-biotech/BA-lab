import assert from "node:assert/strict";
import fs from "node:fs";

const root = "schemas/bal-json/v1/";
const record = JSON.parse(fs.readFileSync(root + "record.schema.json", "utf8"));
const measurement = JSON.parse(fs.readFileSync(root + "measurement.schema.json", "utf8"));
const observation = JSON.parse(fs.readFileSync(root + "observation.schema.json", "utf8"));

assert.equal(record.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(measurement.$schema, record.$schema);
assert.equal(observation.$schema, record.$schema);
assert.equal(record.$id, "https://schemas.ba-labs.dz/bal-json/v1/record.schema.json");
assert.equal(measurement.$id, "https://schemas.ba-labs.dz/bal-json/v1/measurement.schema.json");
assert.equal(observation.$id, "https://schemas.ba-labs.dz/bal-json/v1/observation.schema.json");

const refs = JSON.stringify(record);
assert.match(refs, new RegExp(measurement.$id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(refs, new RegExp(observation.$id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

for (const field of ["contract","contract_version","record_type","record_id","organization_id","created_at","data","provenance"]) {
  assert.ok(record.required.includes(field), "record schema must require " + field);
}
for (const field of ["variable_code","raw_value","raw_unit_code","measured_at","context"]) {
  assert.ok(measurement.required.includes(field), "measurement schema must require " + field);
}
for (const field of ["variable_code","value_text","observed_at","context"]) {
  assert.ok(observation.required.includes(field), "observation schema must require " + field);
}
assert.equal(record.properties.contract.const, "BA-LABS/JSON");
assert.equal(record.properties.contract_version.const, "1.0.0");
assert.deepEqual(measurement.dependentRequired, { normalized_value: ["normalized_unit_code"], normalized_unit_code: ["normalized_value"] });
assert.equal(measurement.properties.quality_state.const, "raw");
assert.equal(observation.properties.quality_state.const, "raw");
assert.equal(record.additionalProperties, false);
assert.equal(measurement.additionalProperties, false);
assert.equal(observation.additionalProperties, false);

for (const schema of [measurement, observation]) {
  const context = schema.properties.context;
  assert.ok(context.anyOf.some(rule => rule.required.includes("culture_id")));
  assert.ok(context.anyOf.some(rule => rule.required.includes("plant_culture_id")));
  assert.ok(context.anyOf.some(rule => rule.required.includes("batch_id")));
}
console.log("✓ BAL-JSON v1 schemas: IDs, versioned contract, typed payloads, traceability anchors and raw-only quality state");
