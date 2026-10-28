import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const start = tracker.indexOf("async function initializeAuthenticatedTracker(");
const end = tracker.indexOf("\n\n/* ============================================================\n   DATE PAR DEFAUT", start);
assert.ok(start >= 0 && end > start, "authenticated initializer must be present");
const initializer = tracker.slice(start, end);

assert.match(
  initializer,
  /const setInitializationStage = \(stage\) => \{\s*if \(initRevision !== authStateRevision\) return;\s*initializationStage = stage;/,
  "stale initialization must not overwrite the current auth status",
);

const awaitedSteps = [
  "claimBALabs(session)",
  "loadStrainOptions()",
  "loadReferenceData()",
  "loadCultureOptions()",
  "loadQuantityUnitOptions()",
  "loadBatchPlaceOptions()",
  "loadPlantCultures()",
  "syncPendingCultures()",
  "loadLatestBatches()",
];
for (const step of awaitedSteps) {
  const escaped = step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(String.raw`await ${escaped};\s*if \(initRevision !== authStateRevision\) return;`);
  assert.match(initializer, pattern, `stale initialization must stop after ${step}`);
}

assert.match(
  initializer,
  /if \(initRevision !== authStateRevision\) return;[\s\S]*?finally/,
  "the existing final stale-session reconciliation must remain",
);

const finallyStart = initializer.lastIndexOf("finally {");
assert.ok(finallyStart >= 0, "initializer must release its in-progress guard in finally");
const finallyBlock = initializer.slice(finallyStart);
const guardReset = finallyBlock.indexOf("initializationInProgress =");
const retrySchedule = finallyBlock.indexOf("setTimeout(() =>");
const retryCall = finallyBlock.indexOf("refreshAuthUI()");
assert.ok(guardReset >= 0 && retrySchedule > guardReset && retryCall > retrySchedule,
  "stale initialization must release the guard before retrying the latest session");
assert.match(finallyBlock, /if \(initRevision !== authStateRevision\) \{[\s\S]*?refreshAuthUI\(\)/,
  "a superseded initialization must schedule reconciliation against the latest auth state");



const measurementHistoryCatch = initializer.slice(
  initializer.indexOf("catch (historyError)"),
  initializer.indexOf("catch (observationHistoryError)")
);
assert.match(
  measurementHistoryCatch,
  /catch \(historyError\) \{\s*if \(initRevision !== authStateRevision\) return;/,
  "a stale measurement-history failure must not mutate warnings or UI",
);

const observationHistoryCatch = initializer.slice(
  initializer.indexOf("catch (observationHistoryError)"),
  initializer.indexOf("} catch (measurementError)")
);
assert.match(
  observationHistoryCatch,
  /catch \(observationHistoryError\) \{\s*if \(initRevision !== authStateRevision\) return;/,
  "a stale observation-history failure must not mutate warnings or UI",
);

const measurementCatalogCatch = initializer.slice(
  initializer.indexOf("} catch (measurementError)"),
  initializer.indexOf("setDefaultDate();")
);
assert.match(
  measurementCatalogCatch,
  /catch \(measurementError\) \{\s*if \(initRevision !== authStateRevision\) return;/,
  "a stale measurement-catalog failure must not re-enable stale workspace controls",
);


for (const loaderName of [
  "loadStrainOptions",
  "loadReferenceData",
  "loadCultureOptions",
  "loadLatestBatches",
  "loadQuantityUnitOptions",
  "loadBatchPlaceOptions",
  "loadPlantCultures",
  "loadMeasurementReferences",
  "loadRecentMeasurements",
  "loadRecentObservations",
  "syncPendingCultures",
]) {
  const loaderStart = tracker.indexOf(`async function ${loaderName}()`);
  assert.ok(loaderStart >= 0, `${loaderName} must exist`);
  const nextFunction = tracker.indexOf("\nfunction ", loaderStart + 1);
  const nextAsyncFunction = tracker.indexOf("\nasync function ", loaderStart + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter(index => index >= 0);
  const loaderEnd = candidates.length ? Math.min(...candidates) : tracker.length;
  const loader = tracker.slice(loaderStart, loaderEnd);
  assert.match(
    loader,
    /const loadRevision = authStateRevision;[\s\S]*?if \((?:loadRevision !== authStateRevision|!isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\))\) return;/,
    `${loaderName} must discard query results when its auth session is superseded`,
  );
}

console.log("Stale auth initialization contract passed.");


// Tenant-scoped writes must capture the workspace identity before awaiting work.
assert.match(
  tracker,
  /function isCurrentWorkspaceRevision\(revision, expectedOrganizationId\) \{\s*return revision === authStateRevision &&\s*Boolean\(expectedOrganizationId\) &&\s*organizationId === expectedOrganizationId;/,
  "write handlers must share one strict auth-revision and tenant identity guard",
);

const writeContracts = [
  {
    name: "createCulture",
    start: "async function createCulture()",
    rpc: 'supabaseClient.rpc(\n        "create_culture_with_generation"',
  },
  {
    name: "createBatch",
    start: "async function createBatch()",
    rpc: 'supabaseClient.rpc(\n        "create_batch_with_stages"',
  },
  {
    name: "recordBatchHarvest",
    start: "async function recordBatchHarvest()",
    rpc: 'supabaseClient.rpc("record_batch_harvest"',
  },
  {
    name: "saveMeasurement",
    start: "async function saveMeasurement()",
    rpc: 'supabaseClient.rpc("record_manual_measurement"',
  },
  {
    name: "saveObservation",
    start: "async function saveObservation()",
    rpc: 'supabaseClient.rpc("record_manual_observation"',
  },
  {
    name: "saveBiologicalOperation",
    start: "async function saveBiologicalOperation(event)",
    rpc: "supabaseClient.rpc('record_biological_operation'",
  },
  {
    name: "savePlantCulture",
    start: "async function savePlantCulture(event)",
    rpc: 'supabaseClient.from("plant_cultures").insert({',
  },
  {
    name: "saveQcCheckNow",
    start: "async function saveQcCheckNow(",
    rpc: '.from("batch_qc_checks")',
  },
  {
    name: "advanceBatch",
    start: "async function advanceBatch()",
    rpc: 'supabaseClient.rpc(\n        "advance_batch_stage"',
  },
  {
    name: "releaseBatch",
    start: "async function releaseBatch()",
    rpc: 'supabaseClient.rpc(\n        "release_batch"',
  },
  {
    name: "moveSelectedBatch",
    start: "async function moveSelectedBatch()",
    rpc: 'supabaseClient.rpc("move_batch_to_location"',
  },
];

for (const contract of writeContracts) {
  const start = tracker.indexOf(contract.start);
  assert.ok(start >= 0, `${contract.name} must exist`);
  const nextAsync = tracker.indexOf("\nasync function ", start + 1);
  const nextNormal = tracker.indexOf("\nfunction ", start + 1);
  const ends = [nextAsync, nextNormal].filter(index => index >= 0);
  const end = ends.length ? Math.min(...ends) : tracker.length;
  const handler = tracker.slice(start, end);
  assert.match(
    handler,
    /const operationRevision = authStateRevision;/,
    `${contract.name} must capture the initiating auth revision`,
  );
  assert.match(
    handler,
    /const operationOrganizationId = organizationId;/,
    `${contract.name} must capture the initiating organization id`,
  );
  assert.ok(handler.includes(contract.rpc), `${contract.name} must retain its expected write operation`);
  assert.match(
    handler,
    /isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)/,
    `${contract.name} must abort when the session or tenant has changed`,
  );
}

console.log("Tenant-scoped write auth contract passed.");


// Stale asynchronous failures and refresh completions must not touch the new workspace UI.
function handlerSource(name) {
  const start = tracker.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist for stale-response checks`);
  const nextAsync = tracker.indexOf("\nasync function ", start + 1);
  const nextNormal = tracker.indexOf("\nfunction ", start + 1);
  const ends = [nextAsync, nextNormal].filter(index => index >= 0);
  return tracker.slice(start, ends.length ? Math.min(...ends) : tracker.length);
}

for (const name of ["saveMeasurement", "saveObservation"]) {
  const handler = handlerSource(name);
  assert.match(
    handler,
    /catch \(error\) \{\s*if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
    `${name} must ignore stale errors after a session change`,
  );
}

assert.match(
  handlerSource("createBatch"),
  /await loadLatestBatches\(\);\s*if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
  "createBatch must recheck auth before continuing after refreshing the batch list",
);
assert.match(
  handlerSource("savePlantCulture"),
  /await loadPlantCultures\(\);\s*if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
  "savePlantCulture must recheck auth before showing success after refresh",
);

console.log("Stale write-result UI guards passed.");


// Batch detail uses several sequential tenant-scoped queries, so it must retain the same tenant snapshot throughout.
const batchDetailStart = tracker.indexOf("async function loadBatch(");
const batchDetailEnd = tracker.indexOf("\n/* ============================================================\n   INFORMATIONS BATCH", batchDetailStart);
assert.ok(batchDetailStart >= 0 && batchDetailEnd > batchDetailStart, "loadBatch must exist");
const batchDetailHandler = tracker.slice(batchDetailStart, batchDetailEnd);
assert.match(batchDetailHandler, /const loadRevision = authStateRevision;/, "loadBatch must capture the auth revision");
assert.match(batchDetailHandler, /const loadOrganizationId = organizationId;/, "loadBatch must capture the organization identity");
assert.ok(
  !batchDetailHandler.includes('"organization_id",\n        organizationId'),
  "loadBatch queries must use the captured organization id, not mutable global state",
);
assert.ok(
  (batchDetailHandler.match(/loadRevision !== authStateRevision/g) || []).length >= 4,
  "loadBatch must check the auth revision after each sequential query",
);

console.log("Batch detail tenant-snapshot guards passed.");


// Tenant-scoped analytics and lineage reads must not render into a newer workspace.
for (const name of ["loadStatistics", "loadBiologicalLineage", "loadCultureDetail", "compareSelectedBatches"]) {
  const handler = handlerSource(name);
  assert.match(handler, /const loadRevision = authStateRevision;/, `${name} must capture the initiating auth revision`);
  assert.match(handler, /const loadOrganizationId = organizationId;/, `${name} must capture the initiating organization`);
  assert.doesNotMatch(
    handler,
    /\.eq\(["']organization_id["'],\s*organizationId\)/,
    `${name} must query against the captured organization rather than mutable global state`,
  );
  assert.match(
    handler,
    /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/,
    `${name} must stop stale results and errors from updating the current workspace`,
  );
}
assert.ok(
  (handlerSource("loadStatistics").match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length >= 4,
  "statistics must recheck workspace identity after its asynchronous query phases",
);
assert.ok(
  (handlerSource("loadCultureDetail").match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length >= 3,
  "culture detail must recheck workspace identity after its asynchronous query phases",
);
console.log("Tenant-scoped analytics and lineage read guards passed.");


// Protocol lookups must not mix identifiers across tenant changes between awaits.
for (const name of ["getProtocolVersionId", "getCultureProtocolVersionId"]) {
  const handler = handlerSource(name);
  assert.match(handler, /const loadRevision = authStateRevision;/, `${name} must capture the initiating auth revision`);
  assert.match(handler, /const loadOrganizationId = organizationId;/, `${name} must capture the initiating organization`);
  assert.doesNotMatch(
    handler,
    /\.eq\(["']organization_id["'],\s*organizationId\)/,
    `${name} must query against the captured organization rather than mutable global state`,
  );
  assert.match(
    handler,
    /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)\) return null;/,
    `${name} must stop and return no protocol reference when the workspace changes`,
  );
}
assert.ok(
  (handlerSource("getProtocolVersionId").match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)\) return null;/g) || []).length >= 2,
  "getProtocolVersionId must recheck the workspace between protocol and version queries",
);
console.log("Protocol lookup tenant-snapshot guards passed.");


// Tenant-scoped history, location and plant-register reads must retain the initiating organization.
for (const name of ["loadRecentMeasurements", "loadRecentObservations", "loadBatchPlaceOptions", "loadPlantCultures", "loadStrainOptions", "loadCultureOptions", "loadLatestBatches"]) {
  const handler = handlerSource(name);
  assert.match(handler, /const loadRevision = authStateRevision;/, `${name} must capture the initiating auth revision`);
  assert.match(handler, /const loadOrganizationId = organizationId;/, `${name} must capture the initiating organization`);
  assert.doesNotMatch(
    handler,
    /\.eq\(["']organization_id["'],\s*organizationId\)/,
    `${name} must query against the captured organization rather than mutable global state`,
  );
  assert.match(
    handler,
    /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/,
    `${name} must stop stale results and errors from updating the current workspace`,
  );
}
assert.ok(
  (handlerSource("loadRecentMeasurements").match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length >= 2,
  "measurement history must recheck workspace identity after its main query and event lookup",
);
assert.ok(
  (handlerSource("loadRecentObservations").match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length >= 2,
  "observation history must recheck workspace identity after its main query and event lookup",
);
console.log("Tenant-snapshot history, location and plant-register guards passed.");


// Tenant snapshot declarations must precede every guard that reads them.
for (const name of ["loadStrainOptions", "loadCultureOptions", "loadLatestBatches"]) {
  const handler = handlerSource(name);
  assert.match(
    handler,
    /const loadRevision = authStateRevision;\s*const loadOrganizationId = organizationId;\s*if \(!loadOrganizationId\)/,
    `${name} must initialize the tenant snapshot before checking it`,
  );
}
console.log("Tenant snapshot initialization order passed.");


// Background Notion sync and batch event timeline must never fall back to mutable tenant globals.
for (const name of ["syncPendingCultures", "loadBatch"]) {
  const handler = handlerSource(name);
  assert.match(handler, /const loadOrganizationId = organizationId;/, `${name} must capture the initiating organization`);
  assert.doesNotMatch(
    handler,
    /\.eq\(["']organization_id["'],\s*organizationId\)/,
    `${name} must not issue tenant-scoped queries against mutable organizationId`,
  );
  assert.match(
    handler,
    /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)|loadRevision !== authStateRevision/,
    `${name} must discard work when the auth context changes`,
  );
}
assert.match(
  handlerSource("syncPendingCultures"),
  /catch \(err\) \{\s*if \(!isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)\) return;/,
  "culture sync must stop its per-item error path after a tenant switch",
);
console.log("Background sync and batch timeline tenant guards passed.");


// Culture detail panels and their nested actions must be invalidated on logout/session loss.
const clearWorkspaceHandler = tracker.slice(
  tracker.indexOf("function clearAuthenticatedWorkspaceState()"),
  tracker.indexOf("\\nasync function refreshAuthUI")
);
assert.match(clearWorkspaceHandler, /cultureDetailRequestId\s*\+=\s*1;/, "clearing authenticated state must invalidate pending culture-detail requests");
assert.match(clearWorkspaceHandler, /cultureDetailPanel\.classList\.add\("hidden"\)/, "clearing authenticated state must hide the previous culture detail panel");
assert.match(clearWorkspaceHandler, /cultureDetailPanel\.dataset\.cultureId\s*=\s*""/, "clearing authenticated state must detach the previous culture identity");

const cultureDetailHandler = handlerSource("loadCultureDetail");
assert.match(cultureDetailHandler, /if \(!loadOrganizationId \|\| !culture \|\| !panel/, "culture detail must not render without an authenticated tenant");
assert.match(cultureDetailHandler, /openBatch\.addEventListener\("click", async \(\) => \{\s*if \(!isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)\) return;/, "opening a culture-linked batch must revalidate the captured workspace");
assert.match(cultureDetailHandler, /if \(panel\.dataset\.cultureId !== culture\.id\) return;/, "opening a culture-linked batch must reject an obsolete culture panel");
console.log("Culture detail logout and stale-interaction guards passed.");


// Lineage has an independent request identity: two culture selections in one tenant can race too.
const lineageHandler = handlerSource("loadBiologicalLineage");
assert.match(lineageHandler, /const requestId = \+\+biologicalLineageRequestId;/, "lineage loads must receive a monotonically increasing request ID");
assert.ok(
  (lineageHandler.match(/requestId !== biologicalLineageRequestId/g) || []).length >= 3,
  "lineage must reject stale success and error paths after each asynchronous phase",
);
assert.match(
  tracker.slice(tracker.indexOf("function clearAuthenticatedWorkspaceState()"), tracker.indexOf("\\nasync function refreshAuthUI")),
  /biologicalLineageRequestId\s*\+=\s*1;/,
  "session cleanup must invalidate pending lineage loads",
);
console.log("Biological lineage request-order guards passed.");
