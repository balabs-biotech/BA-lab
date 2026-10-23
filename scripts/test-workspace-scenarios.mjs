import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const engine = fs.readFileSync("batch-tracker/tracker.js", "utf8");
const marker = "function renderMeasurementTargets()";
const start = engine.indexOf(marker);
if (start < 0) throw new Error("renderMeasurementTargets() not found");
const open = engine.indexOf("{", start);
let depth = 0;
let end = -1;
for (let i = open; i < engine.length; i++) {
  if (engine[i] === "{") depth++;
  if (engine[i] === "}") {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end < 0) throw new Error("Could not extract renderMeasurementTargets()");
const functionSource = engine.slice(start, end);


function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(name + "() not found");
  const signatureEnd = source.indexOf(") {", start);
  if (signatureEnd < 0) throw new Error("Could not find body for " + name + "()");
  const open = signatureEnd + 2;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("Could not extract " + name + "()");
}

function callHelper(name, args, domain) {
  const source = extractFunction(engine, name);
  return vm.runInNewContext(
    `${source}; ${name}(...injected.args, injected.domain)`,
    { injected: { args, domain }, document: { body: { dataset: { domain } } } }
  );
}

function fakeElement(tag) {
  return {
    tag, value: "", textContent: "", label: "", children: [],
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; this.value = ""; },
    get options() {
      const flatten = nodes => nodes.flatMap(node =>
        node.tag === "optgroup" ? flatten(node.children) : [node]
      );
      return flatten(this.children);
    }
  };
}

function scenario(domain, previous = "") {
  const measurementTargetSelect = fakeElement("select");
  measurementTargetSelect.value = previous;
  const document = {
    body: { dataset: { domain } },
    createElement: fakeElement
  };
  const cultureOptions = domain === "mycology"
    ? [{ id: "fungus-1", code: "MYC-001", culture_type: "agar" }]
    : domain === "laboratory"
      ? [{ id: "lab-1", code: "LAB-001", culture_type: "liquid" }]
      : [];
  const plantCultureOptions = [
    { id: "plant-1", code: "DF1", cultivar_name: "Marmande", crop_type: "tomato" }
  ];
  const latestBatches = [
    { id: "batch-1", batch_code: "BT-001", name: "Test batch", batch_type: "TRICHODERMA" }
  ];
  vm.runInNewContext(
    `const measurementTargetSelect = injected.select;
     const document = injected.document;
     const cultureOptions = injected.cultures;
     const plantCultureOptions = injected.plants;
     const latestBatches = injected.batches;
     ${functionSource}
     renderMeasurementTargets();`,
    { injected: { select: measurementTargetSelect, document, cultures: cultureOptions, plants: plantCultureOptions, batches: latestBatches } }
  );
  return {
    select: measurementTargetSelect,
    values: measurementTargetSelect.options.map(option => option.value),
    labels: measurementTargetSelect.children.filter(node => node.tag === "optgroup").map(node => node.label),
    placeholder: measurementTargetSelect.children[0]?.textContent
  };
}

const greenTech = scenario("agronomy");
assert.deepEqual(greenTech.values, ["", "plant:plant-1"]);
assert.deepEqual(greenTech.labels, ["Unités végétales · Green Tech"]);
assert.equal(greenTech.select.value, ""); // Explicit target choice is required.
assert.match(greenTech.placeholder, /cible de cet univers/);

const mycology = scenario("mycology");
assert.deepEqual(mycology.values, ["", "culture:fungus-1"]);
assert.deepEqual(mycology.labels, ["Cultures mycologiques"]);
assert.equal(mycology.select.value, ""); // Explicit target choice is required.
assert.ok(!mycology.values.some(value => value.startsWith("plant:") || value.startsWith("batch:")));

const laboratory = scenario("laboratory");
assert.deepEqual(laboratory.values, ["", "culture:lab-1", "batch:batch-1"]);
assert.deepEqual(laboratory.labels, ["Cultures de laboratoire", "Lots de laboratoire"]);
assert.equal(laboratory.select.value, ""); // Explicit target choice is required.
assert.ok(!laboratory.values.some(value => value.startsWith("plant:")));

const preserve = scenario("agronomy", "plant:plant-1");
assert.equal(preserve.select.value, "plant:plant-1");
const rejectCrossUniversePrevious = scenario("agronomy", "batch:batch-1");
assert.equal(rejectCrossUniversePrevious.select.value, "plant:plant-1");

console.log("✓ Scenario Green Tech: only plant units are selectable");
console.log("✓ Scenario Mycology: only biological culture targets are selectable");
console.log("✓ Scenario Laboratory: lab cultures and production batches are selectable");
console.log("✓ Scenario navigation: valid selection is preserved; cross-universe selection is discarded");

function recordScenario(record, eventsById, domain, cultures, plants, batches) {
  const source = extractFunction(engine, "belongsToActiveWorkspace");
  return vm.runInNewContext(
    `${source}; belongsToActiveWorkspace(injected.record, injected.events)`,
    {
      injected: { record, events: eventsById },
      document: { body: { dataset: { domain } } },
      cultureOptions: cultures,
      plantCultureOptions: plants,
      latestBatches: batches
    }
  );
}

const typeCatalogue = [
  "agar", "plate", "slant", "broth", "flask", "other_liquid", "grain_spawn", "substrate", "fermentation", "other",
  "organoid", "suspension", "micropropagation", "solid"
].map(code => ({ code }));
const mycologyTypes = Array.from(callHelper("workspaceCultureTypes", [typeCatalogue], "mycology"), item => item.code);
const labTypes = Array.from(callHelper("workspaceCultureTypes", [typeCatalogue], "laboratory"), item => item.code);
const agronomyTypes = Array.from(callHelper("workspaceCultureTypes", [typeCatalogue], "agronomy"), item => item.code);
assert.ok(mycologyTypes.includes("agar") && mycologyTypes.includes("broth"));
assert.ok(mycologyTypes.includes("grain_spawn") && mycologyTypes.includes("substrate"));
assert.ok(!mycologyTypes.includes("organoid") && !mycologyTypes.includes("micropropagation"));
assert.equal(labTypes.length, typeCatalogue.length);
assert.deepEqual(agronomyTypes, []);

const variableCatalogue = [
  "ph", "temperature", "electrical_conductivity", "relative_humidity",
  "substrate_moisture", "co2_concentration", "cfu", "cfu_per_ml",
  "colony_count", "od600", "root_length", "illuminance", "generation_time"
].map(code => ({ code }));
const agronomyVariables = Array.from(callHelper("workspaceMeasurementVariables", [variableCatalogue], "agronomy"), item => item.code);
const mycologyVariables = Array.from(callHelper("workspaceMeasurementVariables", [variableCatalogue], "mycology"), item => item.code);
const labVariables = Array.from(callHelper("workspaceMeasurementVariables", [variableCatalogue], "laboratory"), item => item.code);
assert.ok(agronomyVariables.includes("ph") && agronomyVariables.includes("substrate_moisture"));
assert.ok(!agronomyVariables.includes("cfu") && !agronomyVariables.includes("od600"));
assert.ok(mycologyVariables.includes("cfu") && mycologyVariables.includes("od600"));
assert.ok(!mycologyVariables.includes("root_length"));
assert.equal(labVariables.length, variableCatalogue.length);

assert.ok(engine.includes('query = query.eq("plant_culture_id", plantCultureId)'));
assert.ok(engine.includes('targetLabel.textContent = domain === "agronomy" ? "Unité végétale"'));
assert.ok(engine.includes('batchField.hidden = domain !== "laboratory"'));
assert.ok(engine.includes('if (!plantCultureId && !cultureId && !batchId)'));
assert.ok(engine.includes('query = query.in("plant_culture_id", plantIds)'));
assert.ok(engine.includes('query = query.or(scopeClauses.join(","))'));
assert.ok(engine.includes("else noWorkspaceTargets = true"));
assert.ok(engine.includes("noWorkspaceTargets || (batchId && !batchEventIds.length)"));
console.log("✓ Scenario choices: culture formats and measurement variables are domain-specific");
console.log("✓ Scenario AgriTech statistics: plant filters query plant_culture_id and hide laboratory batches");

const cultureRows = [{ id: "myc-1", code: "MYC-1" }, { id: "lab-1", code: "LAB-1" }];
const plantRows = [{ id: "plant-1", code: "DF1" }];
const batchRows = [{ id: "batch-1", batch_code: "BT-1" }];
assert.equal(recordScenario({ plant_culture_id: "plant-1" }, {}, "agronomy", [], plantRows, []), true);
assert.equal(recordScenario({ culture_id: "myc-1" }, {}, "agronomy", cultureRows, plantRows, batchRows), false);
assert.equal(recordScenario({ culture_id: "myc-1" }, {}, "mycology", [cultureRows[0]], plantRows, batchRows), true);
assert.equal(recordScenario({ plant_culture_id: "plant-1" }, {}, "mycology", [cultureRows[0]], plantRows, batchRows), false);
assert.equal(recordScenario({ event_id: "event-1" }, { "event-1": { batch_id: "batch-1" } }, "laboratory", [cultureRows[1]], plantRows, batchRows), true);
assert.equal(recordScenario({ event_id: "event-1" }, { "event-1": { batch_id: "batch-1" } }, "mycology", [cultureRows[0]], plantRows, batchRows), false);
console.log("✓ Scenario histories: plant, mycology and lab records stay within their own workspace");
