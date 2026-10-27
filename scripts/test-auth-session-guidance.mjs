import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const start = tracker.indexOf("function getSessionVerificationGuidance(error)");
const end = tracker.indexOf("\n\nasync function refreshAuthUI", start);
assert.ok(start >= 0 && end > start, "session guidance classifier must be present");
const classifier = tracker.slice(start, end);

assert.match(classifier, /invalid refresh token|refresh_token_not_found|invalid_grant/i,
  "invalid refresh tokens must be classified as an expired/invalid session");
assert.match(classifier, /AuthRetryableFetchError|failed to fetch|networkerror|timeout/i,
  "transient network/auth failures must receive retry guidance");
assert.match(classifier, /Session expirée ou invalide/);
assert.match(classifier, /Connexion temporairement indisponible/);
assert.match(classifier, /données enregistrées ne sont pas supprimées/);

const refreshStart = tracker.indexOf("async function refreshAuthUI(");
const refreshEnd = tracker.indexOf("\n\n/* ============================================================\n   INITIALISATION AUTHENTIFIEE", refreshStart);
const refresh = tracker.slice(refreshStart, refreshEnd);
assert.match(refresh, /getSessionVerificationGuidance\(error\)/,
  "session verification failures must use the diagnostic classifier");
assert.doesNotMatch(refresh, /Impossible de vérifier votre session\. Vérifiez la connexion Internet puis rechargez la page/,
  "the generic reload-only message must be removed");

console.log("Auth session error guidance contract passed.");
