import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const start = tracker.indexOf("async function init()");
const end = tracker.indexOf("/* ============================================================\n   INTERFACE : chargement", start);
assert.ok(start >= 0 && end > start, "startup init block must be present");

const init = tracker.slice(start, end);
assert.match(init, /await refreshAuthUI\(\)/,
  "startup must delegate session verification to refreshAuthUI");
assert.doesNotMatch(init, /getCurrentSession\(/,
  "startup must not preflight the session before refreshAuthUI checks it");

const refreshStart = tracker.indexOf("async function refreshAuthUI(");
const refreshEnd = tracker.indexOf("/* ============================================================\n   INITIALISATION AUTHENTIFIEE", refreshStart);
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, "auth UI refresh block must be present");
const refresh = tracker.slice(refreshStart, refreshEnd);
assert.match(refresh, /getCurrentSession\(\)/,
  "refreshAuthUI must remain the single owner of session verification");
assert.match(refresh, /getSessionVerificationGuidance\(error\)/,
  "session verification failures must use the classified recovery guidance");

console.log("Auth startup single-session-check contract passed.");
