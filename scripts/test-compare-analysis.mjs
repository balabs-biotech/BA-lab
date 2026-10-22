import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/compare-analysis.js", "utf8");
const context = { console, Intl, Math, Number, Set, Map, Array, Object };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "batch-tracker/compare-analysis.js" });
const api = context.BACompareAnalysis;
assert.ok(api, "analysis API is exported");
assert.equal(api.median([9, 1, 5]), 5);
assert.equal(api.median([8, 2, 6, 4]), 5);
assert.deepEqual(JSON.parse(JSON.stringify(api.summarize([1, 2, 3, 4]))), {
  n: 4, min: 1, max: 4, mean: 2.5, median: 2.5, q1: 1.75, q3: 3.25
});
assert.deepEqual(Array.from(api.detectOutlierIds([
  { id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 2 },
  { id: "d", value: 3 }, { id: "e", value: 100 }
])), ["e"]);
assert.equal(api.detectOutlierIds([{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 100 }]).length, 0);
assert.ok(Math.abs(api.pearson([{x:1,y:2},{x:2,y:4},{x:3,y:6},{x:4,y:8}]) - 1) < 1e-12);
assert.equal(api.pearson([{x:1,y:2},{x:2,y:2},{x:3,y:2},{x:4,y:2}]), null);
assert.equal(api.pearson([{x:1,y:2},{x:2,y:4},{x:3,y:6}]), null);
const kg = { code: "kg", dimension: "mass", factor: 1000, offset_value: 0, is_linear: true };
const g = { code: "g", dimension: "mass", factor: 1, offset_value: 0, is_linear: true };
assert.equal(api.convertUnit(1, kg, g, "mass"), 1000);
const kelvin = { code: "K", dimension: "temperature", factor: 1, offset_value: 0, is_linear: true };
const celsius = { code: "degC", dimension: "temperature", factor: 1, offset_value: 0, is_linear: true };
assert.ok(Math.abs(api.convertUnit(273.15, kelvin, celsius, "temperature")) < 1e-12);
assert.ok(Math.abs(api.convertUnit(0, celsius, kelvin, "temperature") - 273.15) < 1e-12);
const phA = { code: "pH-a", dimension: "pH", factor: 1, offset_value: 0, is_linear: false };
const phB = { code: "pH-b", dimension: "pH", factor: 1, offset_value: 0, is_linear: false };
assert.equal(api.convertUnit(7, phA, phB, "pH"), null);
const eventMap = new Map([["event-1", "batch-1"]]);
const cultureMap = new Map([["culture-1", "batch-1"]]);
const sampleMap = new Map([["sample-1", "batch-2"]]);
assert.equal(api.resolveBatchId({ event_id: "event-1", culture_id: "culture-2" }, eventMap, cultureMap, sampleMap), "batch-1");
assert.equal(api.resolveBatchId({ culture_id: "culture-1" }, eventMap, cultureMap, sampleMap), "batch-1");
assert.equal(api.resolveBatchId({ culture_id: "ambiguous-culture" }, eventMap, cultureMap, sampleMap), null);
assert.equal(api.resolveBatchId({ sample_id: "sample-1" }, eventMap, cultureMap, sampleMap), "batch-2");
assert.equal(api.resolveBatchId({ culture_id: "ambiguous-culture", sample_id: "sample-1" }, eventMap, cultureMap, sampleMap), null);
assert.equal(api.dateKey("2026-10-22T12:00:00"), "2026-10-22");
assert.equal(api.dateInRange("2026-10-22T12:00:00", "2026-10-22", "2026-10-22"), true);
assert.equal(api.dateInRange("2026-10-21T23:59:59", "2026-10-22", null), false);
assert.equal(api.dateInRange(null, null, null), true);
assert.equal(api.dateInRange(null, "2026-10-22", null), false);
console.log("✓ descriptive statistics, IQR outliers, Pearson guards, unit conversion, date filtering and unambiguous traceability tests passed");
