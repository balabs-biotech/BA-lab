import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");

const claimStart = tracker.indexOf("async function claimBALabs(");
const claimEnd = tracker.indexOf("/* ============================================================\n   CONNEXION", claimStart);
assert.ok(claimStart >= 0 && claimEnd > claimStart, "BA-LABS claim function must be present");
const claim = tracker.slice(claimStart, claimEnd);

assert.match(claim, /async function claimBALabs\(session\)/,
  "claimBALabs must receive the session already verified by refreshAuthUI");
assert.doesNotMatch(claim, /getCurrentSession\(/,
  "claimBALabs must not trigger a second refresh/session lookup during startup");
assert.match(claim, /if\s*\(!session\)/,
  "claimBALabs must reject a missing verified session");

const initStart = tracker.indexOf("async function initializeAuthenticatedTracker(");
const initEnd = tracker.indexOf("/* ============================================================\n   DATE PAR DEFAUT", initStart);
assert.ok(initStart >= 0 && initEnd > initStart, "authenticated initialization block must be present");
const init = tracker.slice(initStart, initEnd);
assert.match(init, /await claimBALabs\(session\)/,
  "authenticated initialization must pass its already-verified session into the claim");

console.log("Auth claim single-session contract passed.");
