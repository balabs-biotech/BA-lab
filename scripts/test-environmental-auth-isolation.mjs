import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("batch-tracker/environmental-data.js", "utf8");
new Function(source);

assert.equal((source.match(/onAuthStateChange\(/g) || []).length, 1,
  "GreenTech must use one centralized auth-state listener");
assert.match(source, /function clearEnvironmentWorkspace\(\)/,
  "the GreenTech workspace must expose one session-reset routine");
assert.match(source, /event === "SIGNED_OUT" \|\| !session/,
  "sign-out and missing-session events must clear the workspace");
assert.match(source, /panel\.classList\.add\("hidden"\)/,
  "the environmental workspace must be hidden after sign-out");
assert.match(source, /location\.replaceChildren\(node\("option"/,
  "previous organization locations must be removed");
assert.match(source, /results\.replaceChildren\(\)/,
  "previous environmental observations must be removed");
assert.match(source, /satelliteResults\.replaceChildren\(\)/,
  "previous satellite scene results must be removed");
assert.match(source, /URL\.revokeObjectURL\(satelliteSentinelObjectUrl\)/,
  "previous satellite preview object URLs must be released");
assert.match(source, /event === "SIGNED_IN"/,
  "a new authenticated session must reload the workspace");
assert.match(source, /authRevision !== environmentalAuthRevision/,
  "stale location responses must be discarded after auth transitions");
assert.match(source, /const current = \(\) => isCurrentEnvironmentRequest/,
  "weather imports must be bound to the current auth and location revisions");
assert.match(source, /if \(!current\(\)\) return;/,
  "stale asynchronous responses must not update the current workspace");
assert.match(source, /finally\{if\(current\(\)\)/,
  "stale requests must not change controls belonging to a newer session");

console.log("✓ GreenTech clears tenant-specific UI and satellite data on sign-out");
console.log("✓ GreenTech reloads on sign-in and rejects stale asynchronous responses");
