import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const workspaces = [
  ["green-tech", "agronomy"],
  ["mycology", "mycology"],
  ["laboratory", "laboratory"],
];

const tracker = await read("batch-tracker/tracker.js");
const sharedMarkup = await read("batch-tracker/workspace.html");

for (const [folder, domain] of workspaces) {
  const page = await read(`batch-tracker/${folder}/index.html`);

  assert.match(page, new RegExp(`<body[^>]*data-domain=["']${domain}["']`), `${folder} must declare its own workspace domain`);
  assert.match(page, /window\.BA_LABS_DOMAIN\s*=\s*["']/);
  assert.match(page, /fetch\(["']\.\.\/workspace\.html/);
  assert.match(page, /i18nScript\.onload\s*=\s*\(\)\s*=>/);
  assert.match(page, /script\.src\s*=\s*["']\.\.\/tracker\.js/);
  assert.match(page, /document\.body\.appendChild\(script\)/, `${folder} must inject the tracker after shared markup and i18n load`);
}

for (const id of ["authCard", "authEmail", "authPassword", "authStatus", "signInButton", "signUpButton", "signOutButton"]) {
  assert.match(sharedMarkup, new RegExp(`id=["']${id}["']`), `shared workspace markup must contain auth element #${id}`);
}

for (const handler of ["signIn", "signUp", "signOut"]) {
  assert.match(tracker, new RegExp(`\\b${handler}\\s*\\(\\s*\\)`), `tracker must retain the ${handler} authentication flow`);
}

assert.match(tracker, /supabaseClient\.auth\.onAuthStateChange\s*\(/);
assert.match(tracker, /await\s+supabaseClient\.auth\.signInWithPassword\s*\(/);
assert.match(tracker, /await\s+supabaseClient\.auth\.signUp\s*\(/);
assert.match(tracker, /await\s+claimBALabs\s*\(/);

// A plant-registry/RLS failure must never block authentication in Mycology
// or Laboratory. Keep the dependency explicitly scoped to Green Tech.
assert.match(
  tracker,
  /if\s*\(document\.body\.dataset\.domain\s*===\s*["']agronomy["']\)\s*\{\s*(?:setInitializationStage\(["']chargement des cultures végétales["']\);\s*)?await\s+loadPlantCultures\(\);\s*(?:if\s*\(initRevision\s*!==\s*authStateRevision\)\s*return;\s*)?\}/,
  "only the agronomy workspace may load plant-culture registry data during initialization",
);

console.log("Workspace auth regression contract passed: entry pages, shared auth controls, session handlers, BA-LABS claim, and domain isolation.");
