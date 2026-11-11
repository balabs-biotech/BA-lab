import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

const recordSchema = readJson("schemas/bal-json/v1/record.schema.json");
const measurementSchema = readJson("schemas/bal-json/v1/measurement.schema.json");
const observationSchema = readJson("schemas/bal-json/v1/observation.schema.json");
const measurementExample = readJson("schemas/bal-json/v1/examples/mycology-measurement.json");
const observationExample = readJson("schemas/bal-json/v1/examples/laboratory-observation.json");

assert.equal(recordSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(recordSchema.$id, "urn:ba-labs:bal-json:v1:record");
assert.equal(recordSchema.properties.contract.const, "BA-LABS/JSON");
assert.equal(recordSchema.properties.contract_version.const, "1.0.0");
assert.deepEqual(recordSchema.properties.record_type.enum, ["measurement", "observation"]);
assert.equal(recordSchema.allOf[0].then.properties.data.$ref, measurementSchema.$id);
assert.equal(recordSchema.allOf[1].then.properties.data.$ref, observationSchema.$id);
assert.equal(observationSchema.properties.context.$ref, measurementSchema.$id + "#/$defs/context");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(measurementSchema);
ajv.addSchema(observationSchema);
const validateRecord = ajv.compile(recordSchema);

assert.equal(validateRecord(measurementExample), true, JSON.stringify(validateRecord.errors));
assert.equal(validateRecord(observationExample), true, JSON.stringify(validateRecord.errors));

const missingUnit = structuredClone(measurementExample);
delete missingUnit.data.raw_unit_code;
assert.equal(validateRecord(missingUnit), false, "measurement without a raw unit must be rejected");

const excludedWithoutReason = structuredClone(measurementExample);
excludedWithoutReason.data.quality_state = "excluded";
assert.equal(validateRecord(excludedWithoutReason), false, "excluded measurement without a reason must be rejected");

const missingContext = structuredClone(measurementExample);
missingContext.data.context = { environment_id: measurementExample.data.context.environment_id };
assert.equal(validateRecord(missingContext), false, "environment-only context must not identify a biological record");

const materialOnly = structuredClone(measurementExample);
materialOnly.data.context = { material_id: "6b6c2b3d-4a6f-4b3e-8a1f-5b4c3d2e1f00" };
assert.equal(validateRecord(materialOnly), false, "material-only context is not accepted by the current manual-write RPC contract");

const sampleOnly = structuredClone(measurementExample);
sampleOnly.data.context = { sample_id: "7b6c2b3d-4a6f-4b3e-8a1f-5b4c3d2e1f00" };
assert.equal(validateRecord(sampleOnly), false, "sample-only context is not accepted by the current manual-write RPC contract");

const unsupportedAnchor = structuredClone(measurementExample);
unsupportedAnchor.data.context.sample_id = "7b6c2b3d-4a6f-4b3e-8a1f-5b4c3d2e1f00";
assert.equal(validateRecord(unsupportedAnchor), false, "unsupported sample reference must not be silently dropped when another anchor is present");

const emptyObservation = structuredClone(observationExample);
emptyObservation.data.value_text = "";
assert.equal(validateRecord(emptyObservation), false, "empty qualitative observation must be rejected");

const unknownRecordType = structuredClone(observationExample);
unknownRecordType.record_type = "prediction";
assert.equal(validateRecord(unknownRecordType), false, "unknown record types must be rejected");

console.log("✓ BAL-JSON v1 Draft 2020-12 schemas compile and valid/invalid fixtures behave as specified");
