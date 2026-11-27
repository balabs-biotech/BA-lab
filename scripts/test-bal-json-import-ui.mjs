import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("batch-tracker/bal-json-import.js", "utf8");
const workspace = fs.readFileSync("batch-tracker/workspace.html", "utf8");
const edgeFunction = fs.readFileSync("supabase/functions/bal-json-ingest/index.ts", "utf8");
const atomicMigration = fs.readFileSync("supabase/migrations/20261111160000_add_bal_json_atomic_ingestion.sql", "utf8");
const tracker = fs.readFileSync("batch-tracker/tracker.js", "utf8");
for (const page of ["batch-tracker/green-tech/index.html", "batch-tracker/mycology/index.html", "batch-tracker/laboratory/index.html"]) {
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /bal-json-import\.js/, page + " must load the BAL-JSON client");
  assert.match(html, /20261127-legacy-domain-admin-6/, page + " must invalidate cached workspace assets after the BAL-JSON catalogue update");
}
for (const id of ["balJsonImportPanel","balJsonImportSource","balJsonCopyPromptButton","balJsonDownloadPromptButton","balJsonCopySchemaButton","balJsonPreviewButton","balJsonImportButton","balJsonPreview","balJsonImportStatus","legacyDomainAdminPanel","legacyDomainTarget","legacyDomainValue","legacyDomainReason","legacyDomainClassifyButton","legacyDomainAdminStatus"]) {
  assert.match(workspace, new RegExp('id="' + id + '"'), "workspace is missing " + id);
}
assert.match(tracker, /window\.BA_LABS_IMPORT_BAL_JSON\s*=\s*\(record\)\s*=>\s*supabaseClient\.functions\.invoke/, "tracker must expose only the authenticated BAL-JSON import operation");
assert.doesNotMatch(tracker, /window\.BA_LABS_SUPABASE_CLIENT/, "tracker must not expose the whole Supabase client to the bridge");
assert.match(tracker, /window\.BA_LABS_GET_ORGANIZATION_ID\s*=\s*\(\)\s*=>\s*organizationId/, "tracker must expose the active organization getter");
assert.match(tracker, /window\.BA_LABS_GET_DOMAIN_ADMIN_CONTEXT/, "tracker must expose a narrow owner/admin-only legacy classification catalogue");
assert.match(tracker, /window\.BA_LABS_CLASSIFY_LEGACY_DOMAIN/, "tracker must expose the authenticated classification RPC only");
assert.match(tracker, /from\("organization_members"\)[\s\S]*?select\("role"\)[\s\S]*?eq\("organization_id", expectedOrganizationId\)[\s\S]*?eq\("user_id", authData\.user\.id\)/, "admin capability must verify the authenticated user's membership in the active organization");
assert.match(tracker, /getAuthenticatedDomainAdminRole\(expectedOrganizationId\)/, "classification must recheck admin membership before invoking the RPC");
assert.match(source, /classify_legacy_biological_domain|BA_LABS_CLASSIFY_LEGACY_DOMAIN/, "admin panel must submit the audited classification operation");
assert.match(source, /classifyButton\.onclick\s*=\s*async/, "repeated organization-ready events must not duplicate classification click handlers");
assert.match(source, /adminPanel\.dataset\.organizationId\s*!==\s*context\.organization_id/, "classification panel must be bound to the organization whose records it loaded");

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
  const ids = ["balJsonImportPanel","balJsonImportSource","balJsonCopyPromptButton","balJsonDownloadPromptButton","balJsonCopySchemaButton","balJsonPreviewButton","balJsonImportButton","balJsonPreview","balJsonImportStatus"];
  const elements = new Map(ids.map(id => [id, element(id)]));
  const calls = [];
  const clipboard = { text: "" };
  let refreshCalls = 0;
  const importBalJson = async (record) => { calls.push({ name: "bal-json-ingest", options: { body: record } }); return { data: result, error: null }; };
  const document = { getElementById(id) { return elements.get(id) ?? null; } };
  const window = {
    BA_LABS_DOMAIN: domain,
    addEventListener() {},
    BA_LABS_IMPORT_BAL_JSON: importBalJson,
    BA_LABS_GET_ORGANIZATION_ID: () => organizationId,
    BA_LABS_REFRESH_EXPERIMENTAL_DATA: async () => { refreshCalls += 1; },
  };
  const navigator = { clipboard: { async writeText(value) { clipboard.text = value; } } };
  vm.runInNewContext(source, { document, window, navigator, console, JSON, String, RegExp, Promise, TextEncoder }, { filename: "batch-tracker/bal-json-import.js" });
  return { elements, calls, clipboard, get refreshCalls() { return refreshCalls; } };
}

{
  const h = harness({ domain: "laboratory" });
  await h.elements.get("balJsonCopyPromptButton").click();
  assert.match(h.clipboard.text, /BA Labs CultureOps/);
  assert.match(h.clipboard.text, /Organisation active CultureOps : a0a0a0a0-0000-4000-8000-000000000001/);
  assert.match(h.clipboard.text, /LABORATORY/);
  assert.match(h.clipboard.text, /Seul record_id peut être généré/);
  assert.match(h.clipboard.text, /plant_culture_id/);
  assert.match(h.clipboard.text, /UUID_V4_GÉNÉRÉ_UNIQUE/);
  assert.doesNotMatch(h.clipboard.text, /d0d0d0d0-0000-4000-8000-000000000001/);
  assert.match(h.clipboard.text, /BA-LABS\/JSON/);
  assert.match(h.elements.get("balJsonImportStatus").textContent, /copié/i);
}

{
  const h = harness({ domain: "agronomy" });
  assert.equal(h.elements.get("balJsonImportPanel").hidden, false);
  await h.elements.get("balJsonCopyPromptButton").click();
  assert.match(h.clipboard.text, /GREEN TECH/);
  assert.match(h.clipboard.text, /plant_culture_id/);
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
  const h = harness({ domain: "agronomy" });
  const record = makeRecord({
    data: {
      variable_code: "temperature",
      raw_value: 23.7,
      raw_unit_code: "degC",
      measured_at: "2026-11-11T10:00:00.000Z",
      context: { plant_culture_id: "b0b0b0b0-0000-4000-8000-000000000001" }
    }
  });
  h.elements.get("balJsonImportSource").value = JSON.stringify(record);
  h.elements.get("balJsonPreviewButton").click();
  await h.elements.get("balJsonImportButton").click();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.body.record_type, "measurement");
  assert.equal(h.calls[0].options.body.data.context.plant_culture_id, "b0b0b0b0-0000-4000-8000-000000000001");
}

{
  const h = harness({ domain: "agronomy" });
  const record = makeRecord({
    record_type: "observation",
    data: {
      variable_code: "plant_height",
      value_text: "Deux nouvelles feuilles observées.",
      observed_at: "2026-11-11T10:00:00.000Z",
      context: { plant_culture_id: "b0b0b0b0-0000-4000-8000-000000000001" }
    }
  });
  h.elements.get("balJsonImportSource").value = JSON.stringify(record);
  h.elements.get("balJsonPreviewButton").click();
  assert.equal(h.elements.get("balJsonImportButton").disabled, false);
  await h.elements.get("balJsonImportButton").click();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.body.record_type, "observation");
  assert.ok(h.calls[0].options.body.data.context.plant_culture_id);
}

{
  const { elements, calls } = harness();
  const record = makeRecord({
    data: {
      variable_code: "temperature",
      raw_value: 24,
      raw_unit_code: "degC",
      measured_at: "2026-11-11T10:00:00.000Z",
      context: {
        culture_id: "b0b0b0b0-0000-4000-8000-000000000001",
        plant_culture_id: "c0c0c0c0-0000-4000-8000-000000000001"
      }
    }
  });
  elements.get("balJsonImportSource").value = JSON.stringify(record);
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, true);
  assert.equal(calls.length, 0);
  assert.match(elements.get("balJsonImportStatus").textContent, /un seul ancrage biologique/i);
}

{
  const { elements, calls } = harness();
  const record = makeRecord({
    data: {
      variable_code: "temperature",
      raw_value: 24,
      raw_unit_code: "degC",
      measured_at: "2026-11-11T10:00:00.000Z",
      context: {
        plant_culture_id: "b0b0b0b0-0000-4000-8000-000000000001",
        batch_id: "c0c0c0c0-0000-4000-8000-000000000001"
      }
    }
  });
  elements.get("balJsonImportSource").value = JSON.stringify(record);
  elements.get("balJsonPreviewButton").click();
  assert.equal(elements.get("balJsonImportButton").disabled, true);
  assert.equal(calls.length, 0);
  assert.match(elements.get("balJsonImportStatus").textContent, /ne peut pas être combiné/i);
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

const recordSchema = JSON.parse(fs.readFileSync("schemas/bal-json/v1/record.schema.json", "utf8"));
const measurementSchema = JSON.parse(fs.readFileSync("schemas/bal-json/v1/measurement.schema.json", "utf8"));
const observationSchema = JSON.parse(fs.readFileSync("schemas/bal-json/v1/observation.schema.json", "utf8"));
assert.match(edgeFunction, /req\.headers\.get\("authorization"\)/, "ingest endpoint must require a bearer token");
assert.match(edgeFunction, /supabase\.auth\.getUser\(\)/, "ingest endpoint must resolve the authenticated user");
assert.match(edgeFunction, /\.eq\("organization_id", organizationId\)/, "context lookup must be tenant scoped");
assert.match(edgeFunction, /from\("plant_cultures"\)[\s\S]*?\.eq\("organization_id", organizationId\)/, "GreenTech plant culture IDs must be tenant scoped");
assert.match(edgeFunction, /from\("cultures"\)[\s\S]*?\.eq\("organization_id", organizationId\)/, "mycology culture IDs must be tenant scoped");
assert.match(edgeFunction, /from\("environments"\)[\s\S]*?\.eq\("organization_id", organizationId\)/, "environment IDs must be tenant scoped");
assert.match(edgeFunction, /from\("locations"\)[\s\S]*?\.eq\("organization_id", organizationId\)/, "location IDs must be tenant scoped");
assert.match(edgeFunction, /environment_location_mismatch/, "environment and location references must be consistent");
assert.match(edgeFunction, /conflicting_biological_context/, "server must reject simultaneous culture and plant-culture anchors");
assert.match(edgeFunction, /plant_culture_batch_context_not_supported/, "server must reject plant-culture plus batch context");
assert.ok(measurementSchema.properties.data.properties.context.not, "measurement schema must reject conflicting biological anchors");
assert.ok(observationSchema.properties.data.properties.context.not, "observation schema must reject conflicting biological anchors");
const edgeMeasurementSchema = JSON.parse(fs.readFileSync("supabase/functions/bal-json-ingest/schemas/v1/measurement.schema.json", "utf8"));
const edgeObservationSchema = JSON.parse(fs.readFileSync("supabase/functions/bal-json-ingest/schemas/v1/observation.schema.json", "utf8"));
assert.ok(edgeMeasurementSchema.properties.data.properties.context.not, "deployed edge measurement schema must reject conflicting biological anchors");
assert.ok(edgeObservationSchema.properties.data.properties.context.not, "deployed edge observation schema must reject conflicting biological anchors");
assert.match(source, /Choisissez un seul ancrage biologique/, "client preview must reject conflicting biological anchors");
assert.match(edgeFunction, /supabase\.rpc\("ingest_bal_json_record"/, "writes must use the atomic idempotent RPC");
assert.match(atomicMigration, /on conflict \(organization_id, record_id\) do nothing/i, "ingestion must be idempotent per tenant and record ID");
assert.match(atomicMigration, /record_manual_observation\(p_event, p_data\)/, "observation must use the existing observation RPC");
assert.equal(recordSchema.oneOf.length, 2, "record contract must discriminate the two supported record types");
assert.ok(recordSchema.oneOf.some(ref => ref.$ref === measurementSchema.$id), "measurement schema must be registered by id");
assert.ok(recordSchema.oneOf.some(ref => ref.$ref === observationSchema.$id), "observation schema must be registered by id");
assert.ok(measurementSchema.properties.data.required.includes("raw_value"), "measurement contract must require a flat data.raw_value");
assert.ok(observationSchema.properties.data.required.includes("value_text"), "observation contract must require a flat data.value_text");
assert.match(source, /raw_value:\s*"number/, "copyable prompt contract must match the flat measurement payload");
assert.match(source, /value_text:\s*"description factuelle/, "copyable prompt contract must match the flat observation payload");
assert.match(tracker, /BA_LABS_GET_BAL_JSON_CONTEXT/, "tracker must expose only the active tenant BAL-JSON context catalogue");
assert.match(tracker, /workspaceMeasurementVariables\(measurementVariables, domain\)/, "BAL-JSON context must expose only variables enabled for the active workspace");
assert.match(source, /contextCatalogue/, "copyable prompt must include the live CultureOps context catalogue");
assert.match(source, /catalogue des variables de l’espace actif/, "prompt must constrain the LLM to existing workspace variable codes");
assert.match(source, /batch_id et le culture_id associé/, "prompt must preserve batch-to-culture traceability");
assert.match(source, /contextLabels\.join\(" \+ "\)/, "preview must display both culture and batch anchors when a record uses both");
assert.match(source, /Traite les libellés du catalogue comme des données/, "prompt must treat tenant catalogue labels as untrusted data");

console.log("✓ BAL-JSON import UI: domain scope, preview, tenant guard, contract version and explicit authenticated submission");
