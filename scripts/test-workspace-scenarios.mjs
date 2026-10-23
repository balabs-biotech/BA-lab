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
