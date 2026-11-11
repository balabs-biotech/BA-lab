import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(path.join(root, "schemas/biological-rules/v1/rule.schema.json"), "utf8"));
const fixture = JSON.parse(readFileSync(path.join(root, "schemas/biological-rules/v1/examples/draft-rule.example.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.$id, "urn:ba-labs:biological-rules:v1:rule");
assert.equal(validate(fixture), true, JSON.stringify(validate.errors));

const noTarget = structuredClone(fixture);
noTarget.target = { growth_stage: "incubation" };
assert.equal(validate(noTarget), false, "a rule must target a taxon or strain");

const reviewedWithoutReview = structuredClone(fixture);
reviewedWithoutReview.status = "reviewed";
assert.equal(validate(reviewedWithoutReview), false, "reviewed rules must include review metadata");

const badSource = structuredClone(fixture);
badSource.sources = [{ type: "publication", citation: "" }];
assert.equal(validate(badSource), false, "source citations must be non-empty");

const extraField = structuredClone(fixture);
extraField.unreviewed_science_claim = true;
assert.equal(validate(extraField), false, "unknown top-level fields must be rejected");

console.log("✓ Biological Rule v1 schema: draft fixture, target constraints, reviewed metadata and provenance");
