import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const helperStart = tracker.indexOf("function clearAuthenticatedWorkspaceState()");
const helperEnd = tracker.indexOf("\n\nasync function refreshAuthUI(", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "tenant-state cleanup helper must exist");
const helperSource = tracker.slice(helperStart, helperEnd);

const arrayFields = [
  "strainOptions", "referenceData", "cultureOptions", "plantCultureOptions",
  "latestBatches", "measurementVariables", "measurementUnits",
  "quantityUnitOptions", "batchLocationOptions", "batchEnvironmentOptions",
  "recentObservations", "initializationWarnings"
];
const context = {
  organizationId: "tenant-old",
  organization: { id: "tenant-old" },
  selectedBatchId: "batch-old",
  selectedBatch: { id: "batch-old" },
  cultureDetailRequestId: 7,
  biologicalLineageRequestId: 11,
  plantCultureListRequestId: 13,
  batchPlaceOptionsRequestId: 17,
  strainOptionsRequestId: 19,
  cultureOptionsRequestId: 23,
  latestBatchesRequestId: 29,
  document: {
    cultureDetailPanel: {
      classList: { hidden: false, add(name) { if (name === "hidden") this.hidden = true; } },
      dataset: { cultureId: "culture-old" }
    },
    getElementById(id) { return id === "cultureDetailPanel" ? this.cultureDetailPanel : null; }
  },
  recordHarvestButton: { disabled: false },
  saveMeasurementButton: { disabled: false },
  saveObservationButton: { disabled: false }
};
for (const field of arrayFields) context[field] = ["stale-data"];

vm.runInNewContext(helperSource, context, { filename: "tenant-state-cleanup.js" });
context.clearAuthenticatedWorkspaceState();

assert.equal(context.organizationId, null, "tenant organization ID must be cleared");
assert.equal(context.organization, null, "tenant organization object must be cleared");
assert.equal(context.selectedBatchId, null, "selected batch ID must be cleared");
assert.equal(context.selectedBatch, null, "selected batch object must be cleared");
assert.equal(context.cultureDetailRequestId, 8, "pending culture-detail requests must be invalidated");
assert.equal(context.biologicalLineageRequestId, 12, "pending lineage requests must be invalidated");
assert.equal(context.plantCultureListRequestId, 14, "pending plant registry requests must be invalidated");
assert.equal(context.batchPlaceOptionsRequestId, 18, "pending location/environment requests must be invalidated");
assert.equal(context.strainOptionsRequestId, 20, "pending strain-option requests must be invalidated");
assert.equal(context.cultureOptionsRequestId, 24, "pending culture-option requests must be invalidated");
assert.equal(context.latestBatchesRequestId, 30, "pending batch-list requests must be invalidated");
assert.equal(context.document.cultureDetailPanel.classList.hidden, true, "culture detail panel must be hidden after session loss");
assert.equal(context.document.cultureDetailPanel.dataset.cultureId, "", "culture detail panel must release the previous culture identity");
for (const field of arrayFields) {
  assert.deepEqual(Array.from(context[field]), [], `${field} must not retain tenant-scoped cache data`);
}
for (const name of ["recordHarvestButton", "saveMeasurementButton", "saveObservationButton"]) {
  assert.equal(context[name].disabled, true, `${name} must be disabled after session loss`);
}

const refreshStart = tracker.indexOf("async function refreshAuthUI(");
const refreshEnd = tracker.indexOf("/* ============================================================\n   INITIALISATION AUTHENTIFIEE", refreshStart);
const refresh = tracker.slice(refreshStart, refreshEnd);
assert.match(refresh, /catch \(error\) \{[\s\S]*?clearAuthenticatedWorkspaceState\(\);/,
  "unverifiable sessions must clear tenant state before hiding the workspace");
assert.match(refresh, /if \(!session\) \{\s*clearAuthenticatedWorkspaceState\(\);/,
  "missing sessions must clear tenant state before hiding the workspace");

console.log("Auth tenant-state cleanup regression passed.");
