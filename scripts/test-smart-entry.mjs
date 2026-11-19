import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sourceCode = fs.readFileSync("batch-tracker/smart-entry.js", "utf8");
const handlers = new Map();

function element(id, options = []) {
  return {
    id, value: "", textContent: "", options, dataset: {}, hidden: false,
    listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    dispatchEvent() { return true; },
    focus() {},
    click() { this.listeners.click?.(); },
  };
}

function createHarness(domain = "mycology") {
  const elements = new Map();
  for (const id of ["smartEntryPanel", "smartEntrySource", "smartEntryApply", "smartEntryClear", "smartEntryStatus", "cultureCode", "cultureType", "protocol", "startedAt", "strain", "bioOperationNote"]) {
    elements.set(id, element(id));
  }
  elements.get("strain").options = [
    { value: "", textContent: "" },
    { value: "strain-p80", textContent: "Pleurotus ostreatus P80" },
  ];
  elements.get("cultureType").options = [
    { value: "", textContent: "" },
    { value: "grain", textContent: "Grain culture" },
    { value: "liquid", textContent: "Liquid culture" },
  ];
  elements.get("protocol").options = [
    { value: "", textContent: "" },
    { value: "internal", textContent: "Internal protocol" },
  ];
  const document = {
    getElementById(id) { return elements.get(id) ?? null; },
    querySelector() { return null; },
  };
  vm.runInNewContext(sourceCode, {
    document,
    Event: class Event { constructor(type, options) { this.type = type; this.options = options; } },
    window: { BA_LABS_DOMAIN: domain },
    console,
  }, { filename: "batch-tracker/smart-entry.js" });
  return { elements, document };
}


{
  const { elements } = createHarness("agronomy");
  assert.equal(elements.get("smartEntryPanel").hidden, true);
}

{
  const { elements } = createHarness();
  elements.get("smartEntrySource").value = JSON.stringify({
    strain: "Pleurotus ostreatus P80",
    cultureCode: "CULT-PO-P80-001",
    cultureType: "Grain culture",
    protocol: "Internal protocol",
    notes: "Test notes",
  });
  elements.get("smartEntryApply").click();
  assert.equal(elements.get("strain").value, "strain-p80");
  assert.equal(elements.get("cultureCode").value, "CULT-PO-P80-001");
  assert.equal(elements.get("cultureType").value, "grain");
  assert.equal(elements.get("protocol").value, "internal");
  assert.equal(elements.get("bioOperationNote").value, "Test notes");
  assert.match(elements.get("smartEntryStatus").textContent, /prérempli/);
}

{
  const { elements } = createHarness();
  elements.get("smartEntrySource").value = "Souche : Pleurotus ostreatus P80\nCode de culture : CULT-PO-P80-002\nType de culture : grain";
  elements.get("smartEntryApply").click();
  assert.equal(elements.get("cultureCode").value, "CULT-PO-P80-002");
  assert.equal(elements.get("cultureType").value, "grain");
}

{
  const { elements } = createHarness();
  elements.get("smartEntrySource").value = JSON.stringify({ cultureType: "culture" });
  elements.get("smartEntryApply").click();
  assert.equal(elements.get("cultureType").value, "");
  assert.match(elements.get("smartEntryStatus").textContent, /sélectionner manuellement/);
}

{
  const { elements } = createHarness();
  elements.get("smartEntrySource").value = JSON.stringify({
    cultureType: "a value that does not exist in the dropdown",
  });
  elements.get("smartEntryApply").click();
  assert.equal(elements.get("cultureType").value, "");
  assert.match(elements.get("smartEntryStatus").textContent, /sélectionner manuellement/);
}

{
  const { elements } = createHarness();
  elements.get("smartEntrySource").value = "{invalid json";
  elements.get("smartEntryApply").click();
  assert.equal(elements.get("smartEntryStatus").dataset.state, "error");
  assert.match(elements.get("smartEntryStatus").textContent, /JSON|Unexpected/i);
}

console.log("✓ Assisted entry: JSON, labelled notes, ambiguous dropdowns, invalid JSON, and Green Tech scope tested");
