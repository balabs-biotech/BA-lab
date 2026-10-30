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
  "createCulture", "createBatch", "recordBatchHarvest", "saveQcCheckNow",
  "advanceBatch", "releaseBatch", "moveSelectedBatch"
]) {
  const source = getMutationBlock(mutation);
  const writeStart = source.search(/await supabaseClient(?:\\.rpc|\\s*\\n\\s*\\.from)\\s*\\(/);
  assert.ok(writeStart >= 0, `${mutation} must contain its database write`);
  const postWrite = source.slice(writeStart);
  assert.match(postWrite, /if \\(!isCurrentWorkspaceRevision\\(operationRevision, operationOrganizationId\\)\\) return;/,
    `${mutation} must stop stale UI effects after its database write`);
}

console.log("Auth initialization and tenant-write revision guards passed.");
