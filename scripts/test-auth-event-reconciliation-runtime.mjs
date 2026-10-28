import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const listenerStart = tracker.indexOf("supabaseClient.auth.onAuthStateChange(");
const startupMarker = tracker.indexOf("/* ============================================================\n   DEMARRAGE", listenerStart);
const initStart = tracker.indexOf("async function init()", startupMarker);
const initEnd = tracker.indexOf("/* ============================================================\n   INTERFACE : chargement", initStart);

assert.ok(listenerStart >= 0 && startupMarker > listenerStart, "auth listener block must exist");
assert.ok(initStart > startupMarker && initEnd > initStart, "startup init block must exist");

const listenerSource = tracker.slice(listenerStart, startupMarker);
const initSource = tracker.slice(initStart, initEnd);
let authCallback;
const queuedCallbacks = [];
const reconciliations = [];
const context = {
  supabaseClient: {
    auth: {
      onAuthStateChange(callback) {
        authCallback = callback;
      },
    },
  },
  authStateRevision: 0,
  setTimeout(callback) {
    queuedCallbacks.push(callback);
    return queuedCallbacks.length;
  },
  refreshAuthUI(revision) {
    reconciliations.push(revision);
    return Promise.resolve();
  },
  showMessage() {},
  console,
};

vm.runInNewContext(listenerSource, context, { filename: "tracker-auth-listener.js" });
assert.equal(typeof authCallback, "function", "Supabase listener must register its callback");

// Supabase's initial event must not race the explicit startup initialization.
authCallback("INITIAL_SESSION", { access_token: "initial" });
assert.equal(context.authStateRevision, 0, "INITIAL_SESSION must not increment the auth revision");
assert.equal(queuedCallbacks.length, 0, "INITIAL_SESSION must not schedule a second reconciliation");

vm.runInNewContext(initSource, context, { filename: "tracker-init.js" });
await context.init();
assert.deepEqual(reconciliations, [undefined], "init() must own the single startup session verification");

// A real subsequent auth transition must still reconcile the latest session.
authCallback("SIGNED_IN", { access_token: "signed-in" });
assert.equal(context.authStateRevision, 1, "SIGNED_IN must increment the auth revision");
assert.equal(queuedCallbacks.length, 1, "SIGNED_IN must schedule one reconciliation");
queuedCallbacks.shift()();
assert.deepEqual(reconciliations, [undefined, 1], "SIGNED_IN must trigger exactly one revision-bound reconciliation");

// Later token refreshes remain observable rather than being swallowed with INITIAL_SESSION.
authCallback("TOKEN_REFRESHED", { access_token: "refreshed" });
assert.equal(context.authStateRevision, 2, "TOKEN_REFRESHED must increment the auth revision");
assert.equal(queuedCallbacks.length, 1, "TOKEN_REFRESHED must schedule one reconciliation");
queuedCallbacks.shift()();
assert.deepEqual(reconciliations, [undefined, 1, 2], "later auth events must reconcile in revision order");

console.log("Auth event runtime regression passed: single startup reconciliation and subsequent session changes.");
