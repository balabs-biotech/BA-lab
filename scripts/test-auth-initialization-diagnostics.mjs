import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const start = tracker.indexOf("async function initializeAuthenticatedTracker(");
const end = tracker.indexOf("\n\n/* ============================================================\n   DATE PAR DEFAUT", start);
assert.ok(start >= 0 && end > start, "authenticated initializer must be present");
const initializer = tracker.slice(start, end);

for (const stage of [
  "rattachement à l’organisation",
  "chargement du catalogue des souches",
  "chargement des référentiels",
  "chargement des cultures",
  "chargement des unités",
  "chargement des emplacements de lots",
  "chargement des cultures végétales",
  "synchronisation des cultures en attente",
  "chargement des derniers lots",
  "chargement du catalogue de mesures",
]) {
  assert.ok(initializer.includes(stage), `missing initialization diagnostic stage: ${stage}`);
}

assert.ok(
  initializer.includes("Échec à l’étape « ${initializationStage} » : ${error.message ||"),
  "initialization errors must identify the stage and retain the underlying error message",
);
assert.match(
  initializer,
  /if\s*\(initRevision\s*!==\s*authStateRevision\)\s*return;/,
  "a superseded session must not reveal data from an obsolete initialization",
);

console.log("Auth initialization diagnostics passed: every major loading stage is observable and failures identify their stage.");
