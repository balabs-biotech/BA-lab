import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../batch-tracker/domain-engine.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window });

const engine = window.BALabsDomainEngine;
assert.ok(engine, "domain engine must register on window");
assert.deepEqual(Array.from(engine.domains), ["agronomy", "mycology", "laboratory"]);

const types = [
  { code: "agar" }, { code: "grain_spawn" }, { code: "tomato" }, { code: "other" }
];
assert.deepEqual(
  Array.from(engine.filterCultureTypes(types, "agronomy"), item => item.code),
  [],
  "Green Tech must not expose mycology culture types"
);
assert.deepEqual(
  Array.from(engine.filterCultureTypes(types, "mycology"), item => item.code),
  ["agar", "grain_spawn", "other"],
  "Mycology must expose only its allowed culture types"
);
assert.deepEqual(
  Array.from(engine.filterCultureTypes(types, "laboratory"), item => item.code),
  ["agar", "grain_spawn", "tomato", "other"],
  "Laboratory must retain all culture types"
);

const variables = [
  { code: "ph" }, { code: "root_length" }, { code: "od600" }, { code: "viability" }
];
assert.deepEqual(
  Array.from(engine.filterMeasurementVariables(variables, "agronomy"), item => item.code),
  ["ph", "root_length"]
);
assert.deepEqual(
  Array.from(engine.filterMeasurementVariables(variables, "mycology"), item => item.code),
  ["ph", "od600", "viability"]
);
assert.deepEqual(
  Array.from(engine.filterMeasurementVariables(variables, "laboratory"), item => item.code),
  ["ph", "root_length", "od600", "viability"]
);
assert.equal(engine.normalizeDomain("unknown"), "laboratory");

console.log("Domain engine contracts passed.");
