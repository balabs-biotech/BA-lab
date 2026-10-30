import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tracker = readFileSync("batch-tracker/tracker.js", "utf8");

function extract(startMarker, endMarker) {
  const start = tracker.indexOf(startMarker);
  const end = tracker.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Missing source block: ${startMarker}`);
  return tracker.slice(start, end);
}

const claim = extract("async function claimBALabs(session) {", "\n\n/* ============================================================\n   CONNEXION");
assert.match(claim, /if\s*\(!session\)/, "claim must use the session already verified by refreshAuthUI");
assert.doesNotMatch(claim, /await\s+getCurrentSession\s*\(/, "claim must not start a second session lookup");
assert.doesNotMatch(claim, /organizationId\s*=|organization\s*=/, "claim must not mutate global tenant state before revision validation");

const init = extract("async function initializeAuthenticatedTracker(", "\n\n/* ============================================================\n   DATE PAR DEFAUT");
assert.match(init, /const initRevision = revision;/, "initialization must capture its auth revision");
assert.match(init, /await claimBALabs\(session\);\s*if \(initRevision !== authStateRevision\) return;/, "a stale claim must be discarded before tenant state is committed");
assert.match(init, /organization = claim\.organization;\s*organizationId = claim\.organization\.id;/, "tenant state must be committed only by the current initialization");
for (const loader of [
  "loadStrainOptions", "loadReferenceData", "loadCultureOptions",
  "loadQuantityUnitOptions", "loadBatchPlaceOptions", "syncPendingCultures",
  "loadLatestBatches", "loadMeasurementReferences", "loadRecentMeasurements",
  "loadRecentObservations"
]) {
  assert.match(init, new RegExp(`await ${loader}\\(\\);\\s*if \\(initRevision !== authStateRevision\\) return;`),
    `${loader} must be followed by an auth-revision check`);
}
assert.match(init, /if \(initRevision !== authStateRevision\) return;\s*showElement\(trackerCard\)/,
  "an obsolete initialization must not reveal the authenticated workspace");
assert.match(tracker, /function isCurrentWorkspaceRevision\(revision, expectedOrganizationId\)/,
  "tenant-aware revision helper must be available for guarded loaders");

function getFunctionBlock(name) {
  const start = tracker.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `Missing async loader: ${name}`);
  const next = tracker.slice(start + 1).search(/\n(?:async )?function /);
  return tracker.slice(start, next >= 0 ? start + 1 + next : tracker.length);
}

for (const loader of [
  "loadStrainOptions", "loadCultureOptions", "loadBatchPlaceOptions",
  "loadPlantCultures", "syncPendingCultures", "loadLatestBatches",
  "loadRecentMeasurements", "loadRecentObservations"
]) {
  const source = getFunctionBlock(loader);
  assert.match(source, /const loadRevision = authStateRevision;/,
    `${loader} must capture the auth revision before starting its request`);
  assert.match(source, /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/,
    `${loader} must discard results from a superseded tenant`);
}
for (const loader of ["loadReferenceData", "loadQuantityUnitOptions", "loadMeasurementReferences"]) {
  const source = getFunctionBlock(loader);
  assert.match(source, /const loadRevision = authStateRevision;/,
    `${loader} must capture the auth revision before starting its request`);
  assert.match(source, /loadRevision !== authStateRevision/,
    `${loader} must discard results from a superseded auth session`);
}


function getMutationBlock(name) {
  const start = tracker.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `Missing mutation handler: ${name}`);
  const next = tracker.slice(start + 1).search(/\n(?:async )?function /);
  return tracker.slice(start, next >= 0 ? start + 1 + next : tracker.length);
}

for (const mutation of [
  "createCulture", "recordBatchHarvest", "saveQcCheckNow", "createBatch",
  "advanceBatch", "releaseBatch", "moveSelectedBatch", "saveMeasurement",
  "saveObservation", "saveBiologicalOperation", "savePlantCulture"
]) {
  const source = getMutationBlock(mutation);
  assert.match(source, /const operationRevision = authStateRevision;/,
    `${mutation} must capture the auth revision before asynchronous work`);
  assert.match(source, /const operationOrganizationId = organizationId;/,
    `${mutation} must capture its organization context`);
  assert.match(source, /isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)/,
    `${mutation} must refuse writes after the auth/workspace revision changes`);
}


for (const [mutation, successMarker] of [
  ["savePlantCulture", /if \(error\) throw error;/],
  ["saveBiologicalOperation", /if \(error\) throw error;/],
  ["saveMeasurement", /measurementSaved = true;/],
  ["saveObservation", /observationSaved = true;/]
]) {
  const source = getMutationBlock(mutation);
  const marker = source.match(successMarker);
  assert.ok(marker, `${mutation} must expose its successful write boundary`);
  const afterWrite = source.slice(marker.index + marker[0].length);
  assert.match(afterWrite, /if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
    `${mutation} must stop stale UI updates after a successful write`);
}


const capturedOrganizationChecks = [
  ["createCulture", /p_organization_id:\s*operationOrganizationId/],
  ["createBatch", /p_organization_id:\s*operationOrganizationId/],
  ["saveMeasurement", /organization_id:\s*operationOrganizationId/],
  ["saveObservation", /organization_id:\s*operationOrganizationId/],
  ["saveBiologicalOperation", /p_organization_id:\s*operationOrganizationId/]
];
for (const [mutation, pattern] of capturedOrganizationChecks) {
  assert.match(getMutationBlock(mutation), pattern,
    `${mutation} must send the captured organization ID, not a mutable global value`);
}


for (const mutation of [
  "createCulture", "createBatch", "recordBatchHarvest", "advanceBatch",
  "releaseBatch", "moveSelectedBatch", "saveMeasurement", "saveObservation",
  "saveBiologicalOperation", "savePlantCulture"
]) {
  const source = getMutationBlock(mutation);
  const mutationBody = source.slice(0, source.indexOf("finally"));
  const catches = [...mutationBody.matchAll(/catch\s*\([^)]*\)\s*\{/g)];
  assert.ok(catches.length, `${mutation} must handle mutation errors`);
  const latestCatch = mutationBody.slice(catches[catches.length - 1].index);
  assert.match(latestCatch, /if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
    `${mutation} must suppress stale error UI after a workspace transition`);
}

for (const mutation of [
  "createCulture", "createBatch", "recordBatchHarvest", "saveQcCheckNow",
  "advanceBatch", "releaseBatch", "moveSelectedBatch"
]) {
  const source = getMutationBlock(mutation);
  const writeMarker = mutation === "saveQcCheckNow"
    ? '.from("batch_qc_checks")'
    : "await supabaseClient.rpc(";
  const writeStart = source.indexOf(writeMarker);
  assert.ok(writeStart >= 0, `${mutation} must contain its database write`);
  const afterWrite = source.slice(writeStart);
  assert.match(afterWrite, /if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
    `${mutation} must stop stale UI effects after its database write`);
}


for (const mutation of [
  "createCulture", "createBatch", "recordBatchHarvest", "advanceBatch",
  "releaseBatch", "moveSelectedBatch", "savePlantCulture",
  "saveBiologicalOperation", "saveMeasurement", "saveObservation"
]) {
  const source = getMutationBlock(mutation);
  const finallyStart = source.lastIndexOf("finally");
  assert.ok(finallyStart >= 0, `${mutation} must restore its UI state in finally`);
  const finallyBlock = source.slice(finallyStart);
  assert.match(finallyBlock, /if \(isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\)/,
    `${mutation} must not restore stale UI controls after a workspace transition`);
}


const qcWrapper = getFunctionBlock("saveQcCheck");
assert.match(qcWrapper, /const operationRevision = authStateRevision;/,
  "QC wrapper must capture the auth revision");
assert.match(qcWrapper, /catch \(error\)[\s\S]*?if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
  "QC wrapper must suppress stale error UI and handle rejected requests");
assert.match(qcWrapper, /if \(isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\) && button && button\.isConnected\)/,
  "QC wrapper must not restore a control from a previous workspace");

const qcMutation = getFunctionBlock("saveQcCheckNow");
assert.match(qcMutation, /try \{[\s\S]*?await supabaseClient\.auth\.getSession\(\);[\s\S]*?catch \(error\)[\s\S]*?if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
  "QC mutation must handle rejected session lookups without leaking stale feedback");
assert.match(qcMutation, /if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;\s*if \(!sessionData\.session\)/,
  "QC mutation must stop after a resolved stale session lookup");

const batchDetail = getFunctionBlock("loadBatch");
assert.match(batchDetail, /const loadRevision = authStateRevision;/,
  "batch detail loader must capture the auth revision");
assert.match(batchDetail, /const loadOrganizationId = organizationId;/,
  "batch detail loader must capture the organization ID");
assert.equal((batchDetail.match(/if \(requestId !== batchDetailRequestId \|\| !isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)\) return;/g) || []).length, 5,
  "four request boundaries and the loader error handler must reject stale workspace results");
assert.match(batchDetail,
  /\\n  \\} catch \\(error\\) \\{\\s*if \\(requestId !== batchDetailRequestId \\|\\| !isCurrentWorkspaceRevision\\(loadRevision, loadOrganizationId\\)\\) return;/,
  "batch detail loader must suppress errors from rejected requests after a workspace transition");


const lineage = getFunctionBlock("loadBiologicalLineage");
assert.match(lineage, /const loadRevision = authStateRevision;/);
assert.match(lineage, /const loadOrganizationId = organizationId;/);
assert.equal((lineage.match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length, 3,
  "lineage loader must guard both reads and stale error rendering");

const cultureDetail = getFunctionBlock("loadCultureDetail");
assert.match(cultureDetail, /const loadRevision = authStateRevision;/);
assert.match(cultureDetail, /const loadOrganizationId = organizationId;/);
assert.equal((cultureDetail.match(/requestId !== cultureDetailRequestId \|\| !isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length, 5,
  "culture detail must reject stale responses and errors");

const comparison = getFunctionBlock("compareSelectedBatches");
assert.match(comparison, /const operationRevision = authStateRevision;/);
assert.match(comparison, /const operationOrganizationId = organizationId;/);
assert.match(comparison, /if \(!isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) return;/,
  "batch comparison must stop rendering after a workspace transition");
assert.match(comparison, /if \(isCurrentWorkspaceRevision\(operationRevision, operationOrganizationId\)\) button\.disabled = false;/,
  "batch comparison must not restore stale controls");


const statistics = getFunctionBlock("loadStatistics");
assert.match(statistics, /const loadRevision = authStateRevision;/,
  "statistics must capture the auth revision before starting requests");
assert.match(statistics, /const loadOrganizationId = organizationId;/,
  "statistics must capture the organization ID before starting requests");
assert.match(statistics, /if \(!loadOrganizationId\)/,
  "statistics must reject a missing captured organization");
assert.ok(!statistics.includes('.eq("organization_id", organizationId)'),
  "statistics queries must use the captured organization ID");
assert.ok((statistics.match(/isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/g) || []).length >= 6,
  "statistics must reject stale workspace results at request, error and UI-restoration boundaries");
assert.match(statistics, /domain !== \(document\.body\.dataset\.domain \|\| "mycology"\)/,
  "statistics must discard results after a domain switch");
assert.match(statistics, /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\).*button\.disabled=false/s,
  "statistics must not restore a stale workspace button");

console.log("Auth initialization, tenant-write and finally revision guards passed.");
