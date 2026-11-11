import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const record = readJson("schemas/bal-json/v1/record.schema.json");
const measurement = readJson("schemas/bal-json/v1/measurement.schema.json");
const observation = readJson("schemas/bal-json/v1/observation.schema.json");

assert.equal(record.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(record.$id, "https://ba-labs.com/schemas/bal-json/v1/record.schema.json");
assert.deepEqual(record.required, [
  "contract", "contract_version", "record_type", "record_id",
  "organization_id", "created_at", "data", "provenance"
]);
assert.deepEqual(record.properties.contract, { const: "BA-LABS/JSON" });
assert.deepEqual(record.properties.contract_version, { const: "1.0.0" });
assert.deepEqual(record.properties.record_type.enum, ["measurement", "observation"]);
assert.ok(record.allOf.some((rule) => rule.if?.properties?.record_type?.const === "measurement"));
assert.ok(record.allOf.some((rule) => rule.if?.properties?.record_type?.const === "observation"));
assert.equal(record.allOf[0].then.properties.data.$ref, "urn:ba-labs:bal-json:v1:measurement");
assert.equal(record.allOf[1].then.properties.data.$ref, "urn:ba-labs:bal-json:v1:observation");
assert.equal(record.properties.provenance.$ref, "#/$defs/provenance");
assert.equal(record.additionalProperties, false);

assert.ok(measurement.required.includes("variable_code"));
assert.ok(measurement.required.includes("raw_value"));
assert.ok(measurement.required.includes("raw_unit_code"));
assert.ok(measurement.properties.raw_value.type === "number");
assert.ok(measurement.properties.normalized_value.type === "number");
assert.ok(measurement.properties.quality_state.enum.includes("excluded"));
assert.ok(measurement.additionalProperties === false);

assert.ok(observation.required.includes("variable_code"));
assert.ok(observation.required.includes("value_text"));
assert.ok(observation.required.includes("observed_at"));
assert.ok(observation.additionalProperties === false);

const example = readJson("schemas/bal-json/v1/examples/mycology-measurement.json");
const observationExample = readJson("schemas/bal-json/v1/examples/laboratory-observation.json");
assert.equal(example.contract, "BA-LABS/JSON");
assert.equal(example.contract_version, "1.0.0");
assert.equal(example.record_type, "measurement");
assert.equal(example.data.variable_code, "temperature");
assert.equal(example.data.raw_unit_code, "degC");
assert.equal(example.provenance.source, "sensor");
assert.equal(observationExample.record_type, "observation");
assert.equal(observationExample.data.variable_code, "colony_morphology");
assert.equal(observationExample.data.context.culture_id, example.data.context.culture_id);
assert.equal(observation.properties.context.$ref, "urn:ba-labs:bal-json:v1:measurement#/$defs/context");

console.log("✓ BAL-JSON v1 schema structure and canonical mycology measurement fixture");
