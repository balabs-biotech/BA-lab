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

console.log("Auth initialization tenant-revision guards passed.");
