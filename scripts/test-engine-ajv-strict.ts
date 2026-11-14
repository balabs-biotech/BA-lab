import Ajv2020 from "npm:ajv@8.17.1/dist/2020.js";
import addFormats from "npm:ajv-formats@3.0.1";
import requestSchema from "../schemas/engine/v1/request.schema.json" with { type: "json" };
import responseSchema from "../schemas/engine/v1/response.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

for (const [name, schema] of [
  ["request.schema.json", requestSchema],
  ["response.schema.json", responseSchema],
]) {
  ajv.compile(schema);
  console.log(`✓ AJV strict compilation: ${name}`);
}
