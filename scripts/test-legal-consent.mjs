import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const consent = readFileSync("batch-tracker/legal-consent.js", "utf8");
const privacy = readFileSync("legal/privacy.html", "utf8");
const cookies = readFileSync("legal/cookies.html", "utf8");
const terms = readFileSync("legal/terms.html", "utf8");
const register = readFileSync("docs/compliance/processing-register.md", "utf8");

assert.match(consent, /necessary:\s*true/);
assert.match(consent, /analytics = false/);
assert.match(consent, /marketing = false/);
assert.match(consent, /localStorage/);
assert.match(consent, /Refuser les cookies facultatifs/);
assert.match(consent, /Personnaliser/);
assert.match(consent, /privacy\.html/);
assert.match(consent, /cookies\.html/);
assert.match(privacy, /18-07/);
assert.match(privacy, /25-11/);
assert.match(privacy, /délégué à la protection des données/i);
assert.match(privacy, /Supabase/);
assert.match(privacy, /France|eu-west-3/i);
assert.match(cookies, /localStorage/);
assert.match(cookies, /aucun outil publicitaire/i);
assert.match(terms, /traçabilité biologique/i);
assert.match(register, /41 bis 2/);
assert.match(register, /41 bis 3/);
assert.match(register, /délégué à la protection des données/i);
assert.ok(existsSync("legal/privacy.html"));
assert.ok(existsSync("legal/cookies.html"));
assert.ok(existsSync("legal/terms.html"));
assert.match(readFileSync("batch-tracker/workspace.html", "utf8"), /authPrivacyAccepted/);
assert.match(readFileSync("batch-tracker/tracker.js", "utf8"), /authPrivacyAcceptedCheckbox\?\.checked/);
for (const page of ["index.html", "batch-tracker/mycology/index.html", "batch-tracker/green-tech/index.html", "batch-tracker/laboratory/index.html"]) {
  assert.ok(readFileSync(page, "utf8").includes("legal-consent.js"), `${page} must load the privacy manager`);
}
console.log("Legal and consent assets: structural contract checks passed.");
