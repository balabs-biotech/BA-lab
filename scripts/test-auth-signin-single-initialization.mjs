import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const tracker = await readFile(new URL("../batch-tracker/tracker.js", import.meta.url), "utf8");
const signInStart = tracker.indexOf("async function signIn()");
const signUpStart = tracker.indexOf("/* ============================================================\n   CREATION DE COMPTE", signInStart);
assert.ok(signInStart >= 0 && signUpStart > signInStart, "signIn function must be present");
const signIn = tracker.slice(signInStart, signUpStart);

assert.match(signIn, /signInWithPassword\(/, "signIn must call Supabase password authentication");
assert.doesNotMatch(signIn, /await refreshAuthUI\(/, "signIn must not start a second initialization; auth-state listener owns successful sign-in reconciliation");

const listenerStart = tracker.indexOf("supabaseClient.auth.onAuthStateChange(");
const initStart = tracker.indexOf("async function init()", listenerStart);
assert.ok(listenerStart >= 0 && initStart > listenerStart, "auth-state listener must be present");
const listener = tracker.slice(listenerStart, initStart);
assert.match(listener, /refreshAuthUI\(revision\)/, "auth-state listener must reconcile the UI after auth changes");

console.log("Auth sign-in single-initialization contract passed.");
