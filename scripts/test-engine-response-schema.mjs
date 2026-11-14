import assert from "node:assert/strict";
import fs from "node:fs";

const schema = JSON.parse(fs.readFileSync("schemas/engine/v1/response.schema.json", "utf8"));
assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(schema.type, "object");
assert.equal(schema.properties.error.type, "object");
assert.equal(schema.properties.result.type, "object");

const [completed, failed] = schema.allOf;
for (const condition of [completed, failed]) {
  assert.equal(condition.if.type, "object", "conditional if must declare object type");
  assert.equal(condition.then.type, "object", "conditional then must declare object type");
  assert.equal(condition.if.properties.status.const === "completed" || condition.if.properties.status.const === "failed", true);
  assert.equal(condition.then.not.type, "object", "not schema must declare object type");
  const forbidden = condition.then.not.required[0];
  assert.ok(condition.then.not.properties[forbidden], "not.required property must be declared in the same schema");
  assert.ok(condition.then.properties[forbidden], "then must declare the mutually exclusive property");
}
assert.deepEqual(completed.then.required, ["result"]);
assert.deepEqual(completed.then.not.required, ["error"]);
assert.deepEqual(failed.then.required, ["error"]);
assert.deepEqual(failed.then.not.required, ["result"]);
console.log("✓ Engine response schema: strict conditional typing and mutually exclusive result/error branches");
