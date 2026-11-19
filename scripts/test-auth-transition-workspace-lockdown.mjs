import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const helperStart = tracker.indexOf("function clearAuthenticatedWorkspaceState()");
assert.ok(helperStart >= 0, "workspace cleanup helper must exist");
let depth = 0;
let helperEnd = -1;
let opened = false;
for (let i = tracker.indexOf("{", helperStart); i < tracker.length; i += 1) {
  if (tracker[i] === "{") { depth += 1; opened = true; }
  if (tracker[i] === "}") {
    depth -= 1;
    if (opened && depth === 0) { helperEnd = i + 1; break; }
  }
}
assert.ok(helperEnd > helperStart, "workspace cleanup helper must be complete");

const listenerStart = tracker.indexOf("supabaseClient.auth.onAuthStateChange(");
const startupMarker = tracker.indexOf("/* ============================================================\n   DEMARRAGE", listenerStart);
assert.ok(listenerStart >= 0 && startupMarker > listenerStart, "auth listener must exist");
const helperSource = tracker.slice(helperStart, helperEnd);
const listenerSource = tracker.slice(listenerStart, startupMarker);

let authCallback;
const queued = [];
const hidden = [];
let refreshes = 0;
const context = {
  organizationId: "old-org",
  organization: { id: "old-org" },
  strainOptions: ["old"], referenceData: ["old"], cultureOptions: ["old"],
  plantCultureOptions: ["old"], latestBatches: ["old"],
  selectedBatchId: "old-batch", selectedBatch: { id: "old-batch" },
  measurementVariables: ["old"], measurementUnits: ["old"],
  quantityUnitOptions: ["old"], batchLocationOptions: ["old"],
  batchEnvironmentOptions: ["old"], recentObservations: ["old"],
  initializationWarnings: ["old"],
  recordHarvestButton: { disabled: false },
  saveMeasurementButton: { disabled: false },
  saveObservationButton: { disabled: false },
  trackerCard: { id: "tracker" }, batchCard: { id: "batch" },
  measurementCard: { id: "measurements" }, resultCard: { id: "results" },
  signOutButton: { id: "signout" }, authStatus: { textContent: "" },
  document: { getElementById(id) {
    if (id === "cultureDetailPanel") return { classList: { add() {} }, dataset: { cultureId: "old" } };
    return null;
  } },
  hideElement(element) { if (element) hidden.push(element.id || "element"); },
  setTimeout(callback) { queued.push(callback); },
  refreshAuthUI() { refreshes += 1; return Promise.resolve(); },
  supabaseClient: { auth: { onAuthStateChange(callback) { authCallback = callback; } } },
  authStateRevision: 0,
  console
};

vm.runInNewContext(helperSource, context, { filename: "workspace-cleanup.js" });
vm.runInNewContext(listenerSource, context, { filename: "auth-listener.js" });
assert.equal(typeof authCallback, "function");

authCallback("INITIAL_SESSION", { user: { id: "initial" } });
assert.equal(context.authStateRevision, 0, "initial session must not race startup reconciliation");
assert.equal(queued.length, 0, "initial session must not schedule duplicate reconciliation");

authCallback("SIGNED_IN", { user: { id: "new-user" } });
assert.equal(context.organizationId, null, "old organization must be invalidated synchronously");
assert.equal(context.organization, null, "old organization object must be cleared synchronously");
assert.deepEqual(Array.from(context.latestBatches), [], "tenant-scoped batch cache must be cleared");
assert.equal(context.selectedBatchId, null, "selected batch must be cleared");
assert.equal(context.recordHarvestButton.disabled, true, "tenant write action must be disabled");
assert.ok(hidden.includes("tracker") && hidden.includes("batch"), "old workspace cards must be hidden immediately");
assert.equal(context.authStatus.textContent, "Vérification de la session…");
assert.equal(queued.length, 1, "signed-in should schedule one reconciliation");
queued.shift()();
assert.equal(refreshes, 1);

authCallback("TOKEN_REFRESHED", { user: { id: "new-user" } });
assert.equal(context.authStateRevision, 2);
assert.equal(queued.length, 1);
queued.shift()();
assert.equal(refreshes, 2);

authCallback("SIGNED_OUT", null);
assert.equal(context.organizationId, null, "logout must invalidate organization immediately");
assert.equal(context.authStateRevision, 3);
assert.equal(queued.length, 1);
queued.shift()();
assert.equal(refreshes, 3);

console.log("Auth transition workspace lockdown regression passed.");
