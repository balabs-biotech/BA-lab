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
console.log("✓ median, descriptive statistics, IQR outliers and Pearson guard tests passed");
