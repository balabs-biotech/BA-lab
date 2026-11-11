import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("batch-tracker/bal-json-import.js", "utf8");

function element(id) {
  return {
    id, value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
    dataset: {}, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { return this.listeners.click?.(); },
    focus() {},
  };
}

function makeRecord(overrides = {}) {
  return {
    contract: "BA-LABS/JSON",
    contract_version: "1.0.0",
    record_type: "measurement",
    record_id: "d0d0d0d0-0000-4000-8000-000000000001",
    organization_id: "a0a0a0a0-0000-4000-8000-000000000001",
    created_at: "2026-11-11T10:00:00.000Z",
    data: {
      variable_code: "temperature",
      raw_value: 24.5,
      raw_unit_code: "degC",
      measured_at: "2026-11-11T09:59:00.000Z",
      context: { culture_id: "b0b0b0b0-0000-4000-8000-000000000001" },
    },
    provenance: { source: "ai_assisted", review_status: "unreviewed" },
    ...overrides,
  };
}

function harness({ domain = "mycology", organizationId = "a0a0a0a0-0000-4000-8000-000000000001", result = { status: "inserted", event_id: "e0e0e0e0-0000-4000-8000-000000000001" } } = {}) {
  const ids = ["balJsonImportPanel","balJsonImportSource","balJsonPreviewButton","balJsonImportButton","balJsonPreview","balJsonImportStatus"];
  const elements = new Map(ids.map(id => [id, element(id)]));
  const calls = [];
  const client = { functions: { async invoke(name, options) { calls.push({ name, options }); return { data: result, error: null }; } } };
  const document = { getElementById(id) { return elements.get(id) ?? null; } };
  const window = {
    BA_LABS_DOMAIN: domain,
    BA_LABS_SUPABASE_CLIENT: client,
    BA_LABS_GET_ORGANIZATION_ID: () => organizationId,
  };
  vm.runInNewContext(source, { document, window, console, JSON, String, RegExp, Promise, TextEncoder }, { filename: "batch-tracker/bal-json-import.js" });
  return { elements, calls };
}

{
  const { elements } = harness({ domain: "agronomy" });
  assert.equal(elements.get("balJsonImportPanel").hidden, true);
}

{
  const { elements } = harness();
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord());
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, false);
  assert.match(elements.get("balJsonPreview").textContent, /measurement/);
  assert.match(elements.get("balJsonImportStatus").textContent, /prêt/i);
}

{
  const { elements, calls } = harness();
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord());
  elements.get("balJsonPreviewButton").click();
  await elements.get("balJsonImportButton").click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "bal-json-ingest");
  assert.equal(calls[0].options.body.record_id, "d0d0d0d0-0000-4000-8000-000000000001");
  assert.match(elements.get("balJsonImportStatus").textContent, /enregistré/i);
}

{
  const { elements, calls } = harness();
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord({ organization_id: "c0c0c0c0-0000-4000-8000-000000000001" }));
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, true);
  assert.equal(calls.length, 0);
  assert.match(elements.get("balJsonImportStatus").textContent, /organisation/i);
}

{
  const { elements, calls } = harness();
  elements.get("balJsonImportSource").value = "{invalid";
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, true);
  assert.equal(calls.length, 0);
  assert.match(elements.get("balJsonImportStatus").dataset.state, /error/);
}

{
  const { elements, calls } = harness();
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord({ contract_version: "9.0.0" }));
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, true);
  assert.equal(calls.length, 0);
}

console.log("✓ BAL-JSON import UI: domain scope, preview, tenant guard, contract version and explicit authenticated submission");
