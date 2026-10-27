import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../batch-tracker/domain-engine.js", import.meta.url), "utf8");
const trackerSource = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
assert.match(trackerSource, /agronomy:\s*\{\s*cultureTitle: "Nouvelle culture agronomique"/,
  "Green Tech must use agronomy-specific culture entry labels");
assert.match(trackerSource, /mycology:\s*\{\s*cultureTitle: "Nouvelle culture fongique"/,
  "Mycology must use mycology-specific culture entry labels");
assert.match(trackerSource, /laboratory:\s*\{\s*cultureTitle: "Nouvelle culture de laboratoire"/,
  "Laboratory must use laboratory-specific culture entry labels");
assert.match(trackerSource, /filterMeasurementVariables\(\s*measurementVariables,\s*document\.body\.dataset\.domain\s*\)/,
  "measurement filters must receive the active workspace domain");
assert.match(trackerSource, /if \(cultureEntryTitle\) cultureEntryTitle\.textContent = entryLabels\.cultureTitle;/,
  "workspace labels must be selected from the active domain configuration");
assert.match(trackerSource, /if \(persist && organizationId\) \{[\s\S]*?await loadMeasurementReferences\(\);[\s\S]*?loadRecentMeasurements\(\)[\s\S]*?loadRecentObservations\(\)/,
  "switching workspaces while signed in must refresh domain-specific selectors and histories");
assert.match(trackerSource, /if \(activeDomain === "agronomy"\) \{\s*hideElement\(trackerCard\);\s*hideElement\(batchCard\);\s*showElement\(plantCard\);/,
  "Green Tech must switch to the plant registry after a live workspace change");
assert.match(trackerSource, /await loadCultureOptions\(\);\s*await loadLatestBatches\(\);/,
  "switching between Mycology and Laboratory must reload domain-scoped culture targets and batches");
assert.match(trackerSource, /const visibleCultureIds = new Set\(cultureOptions\.map\(culture => culture\.id\)\);\s*latestBatches = \(data \|\| \[\]\)\.filter\(batch =>\s*Boolean\(batch\.culture_id && visibleCultureIds\.has\(batch\.culture_id\)\)\s*\);/,
  "batch lists must be scoped to the active workspace's culture registry");
assert.match(trackerSource, /filterMeasurementVariables\(\s*\[variable\],\s*window\.BALabsDomainEngine\.normalizeDomain\(document\.body\.dataset\.domain\)\s*\)\.length/,
  "manual measurements and observations must reject variables outside the active workspace");
assert.match(trackerSource, /cultureOptions = \[\];\s*latestBatches = \[\];\s*renderMeasurementTargets\(\);/,
  "switching to Green Tech must clear stale biological targets before loading plant records");
assert.match(trackerSource, /else \{\s*showElement\(trackerCard\);\s*showElement\(batchCard\);\s*hideElement\(plantCard\);/,
  "Mycology and Laboratory must restore culture and batch modules after a live workspace change");
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
