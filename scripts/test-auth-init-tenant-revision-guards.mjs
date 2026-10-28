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
  const next = tracker.slice(start + 1).search(/\\n(?:async )?function /);
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
  assert.match(source, /isCurrentWorkspaceRevision\\(loadRevision, loadOrganizationId\\)/,
    `${loader} must discard results from a superseded tenant`);
}
for (const loader of ["loadReferenceData", "loadQuantityUnitOptions", "loadMeasurementReferences"]) {
  const source = getFunctionBlock(loader);
  assert.match(source, /const loadRevision = authStateRevision;/,
    `${loader} must capture the auth revision before starting its request`);
  assert.match(source, /loadRevision !== authStateRevision/,
    `${loader} must discard results from a superseded auth session`);
}

console.log("Auth initialization tenant-revision guards passed.");
