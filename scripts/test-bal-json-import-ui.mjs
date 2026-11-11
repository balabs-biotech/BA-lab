import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("batch-tracker/bal-json-import.js", "utf8");
const workspace = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const tracker = fs.readFileSync("batch-tracker/tracker.js", "utf8");
for (const page of ["batch-tracker/mycology/index.html", "batch-tracker/laboratory/index.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /bal-json-import\.js/, page + " must load the BAL-JSON client");
  assert.match(html, /20261111-bal-json-import-1/, page + " must invalidate cached workspace assets");
}
for (const id of ["balJsonImportPanel","balJsonImportSource","balJsonPreviewButton","balJsonImportButton","balJsonPreview","balJsonImportStatus"]) {
  assert.match(workspace, new RegExp('id="' + id + '"'), "workspace is missing " + id);
}
assert.match(tracker, /window\.BA_LABS_SUPABASE_CLIENT\s*=\s*supabaseClient/, "tracker must expose its authenticated Supabase client");
assert.match(tracker, /window\.BA_LABS_GET_ORGANIZATION_ID\s*=\s*\(\)\s*=>\s*organizationId/, "tracker must expose the active organization getter");

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
  let refreshCalls = 0;
  const client = { functions: { async invoke(name, options) { calls.push({ name, options }); return { data: result, error: null }; } } };
  const document = { getElementById(id) { return elements.get(id) ?? null; } };
  const window = {
    BA_LABS_DOMAIN: domain,
    BA_LABS_SUPABASE_CLIENT: client,
    BA_LABS_GET_ORGANIZATION_ID: () => organizationId,
    BA_LABS_REFRESH_EXPERIMENTAL_DATA: async () => { refreshCalls += 1; },
  };
  vm.runInNewContext(source, { document, window, console, JSON, String, RegExp, Promise, TextEncoder }, { filename: "batch-tracker/bal-json-import.js" });
  return { elements, calls, get refreshCalls() { return refreshCalls; } };
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
  const h = harness();
  const { elements, calls } = h;
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord());
  elements.get("balJsonPreviewButton").click();
  await elements.get("balJsonImportButton").click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "bal-json-ingest");
  assert.equal(calls[0].options.body.record_id, "d0d0d0d0-0000-4000-8000-000000000001");
  assert.match(elements.get("balJsonImportStatus").textContent, /enregistré/i);
  assert.equal(h.refreshCalls, 1, "successful import must refresh the experimental history");
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

{
  const { elements, calls } = harness();
  const invalid = makeRecord({ data: { ...makeRecord().data, raw_value: null } });
  elements.get("balJsonImportSource").value = JSON.stringify(invalid);
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, true, "null must not coerce to a numeric zero");
  assert.equal(calls.length, 0);
}

{
  const { elements, calls } = harness();
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord());
  elements.get("balJsonPreviewButton").click();
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord({ data: { ...makeRecord().data, raw_value: 26 } }));
  await elements.get("balJsonImportButton").click();
  assert.equal(calls.length, 0, "changed content must invalidate the reviewed preview");
  assert.equal(elements.get("balJsonImportButton").disabled, true);
  assert.match(elements.get("balJsonImportStatus").textContent, /changé depuis l’aperçu/i);
}

{
  const { elements, calls } = harness({ result: { status: "duplicate", event_id: "e0e0e0e0-0000-4000-8000-000000000001" } });
  elements.get("balJsonImportSource").value = JSON.stringify(makeRecord());
  elements.get("balJsonPreviewButton").click();
  await elements.get("balJsonImportButton").click();
  assert.equal(calls.length, 1);
  assert.match(elements.get("balJsonImportStatus").textContent, /déjà été importée/i);
}

console.log("✓ BAL-JSON import UI: domain scope, strict preview, tenant guard, stale-preview rejection, duplicate handling and explicit authenticated submission");
