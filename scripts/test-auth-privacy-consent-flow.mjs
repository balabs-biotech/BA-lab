import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");

function extractFunction(name, nextMarker) {
  const start = source.indexOf(`async function ${name}()`);
  assert.notEqual(start, -1, `Missing ${name}() implementation`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `Missing boundary after ${name}()`);
  return source.slice(start, end);
}

const signIn = extractFunction("signIn", "/* ============================================================\n   CREATION DE COMPTE");
const signUp = extractFunction("signUp", "/* ============================================================\n   DECONNEXION");

// Existing users must be able to authenticate without re-accepting legal documents.
assert.doesNotMatch(
  signIn,
  /authPrivacyAcceptedCheckbox|termsAcceptedCheckbox/,
  "Sign-in must not be blocked by a first-registration consent checkbox"
);

// New account creation must require an explicit, visible legal acknowledgement.
assert.match(
  signUp,
  /authPrivacyAcceptedCheckbox\s*\?\.checked/,
  "Sign-up must verify the legal acknowledgement before calling Supabase Auth"
);

const gatePosition = signUp.indexOf("authPrivacyAcceptedCheckbox");
const signupPosition = signUp.indexOf("supabaseClient.auth.signUp");
assert.ok(gatePosition >= 0 && gatePosition < signupPosition,
  "The legal acknowledgement must be checked before the signup request");

console.log("Auth privacy consent flow contract passed.");
