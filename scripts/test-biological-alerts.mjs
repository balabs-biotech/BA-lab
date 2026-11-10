import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const moduleSource = read("batch-tracker/biological-alerts.js");
const workspace = read("batch-tracker/workspace.html");
const tracker = read("batch-tracker/tracker.js");
const styles = read("batch-tracker/tracker.css");
const locales = read("batch-tracker/i18n.js");

for (const entry of [
  "batch-tracker/mycology/index.html",
  "batch-tracker/green-tech/index.html",
  "batch-tracker/laboratory/index.html"
]) {
  assert.match(read(entry), /biological-alerts\.js/, `${entry} must load the shared alert inbox`);
}

assert.match(workspace, /id="biologicalSignalsCard"/);
assert.match(workspace, /href="#biologicalSignalsCard"/);
assert.match(workspace, /id="signalsFilter"/);
assert.match(workspace, /id="signalsSeverityFilter"/);
assert.match(workspace, /id="signalsMethodFilter"/);
assert.match(workspace, /id="signalsVariableFilter"/);
assert.match(workspace, /id="signalsLoadMore"/);
assert.match(moduleSource, /\.from\("biological_signals"\)/);
assert.match(moduleSource, /\.eq\("organization_id", state\.organizationId\)/);
assert.match(moduleSource, /\.eq\("domain", state\.domain\)/);
assert.match(moduleSource, /\.range\(pageOffset, pageOffset \+ PAGE_SIZE - 1\)/);
assert.match(moduleSource, /signalsLoadMore/);
assert.match(moduleSource, /signalsSeverityFilter/);
assert.match(moduleSource, /signalsMethodFilter/);
assert.match(moduleSource, /signalsVariableFilter/);
assert.match(moduleSource, /row\.analysis_method !== state\.method/);
assert.match(moduleSource, /row\.severity !== state\.severity/);
assert.match(moduleSource, /state\.hasMore = page\.length === PAGE_SIZE/);
assert.match(moduleSource, /if \(error\)[\s\S]*?render\(\);[\s\S]*?Impossible de charger les signaux/, "failed reads must restore pagination controls");
assert.match(moduleSource, /analysis_method,analysis_evidence/);
assert.match(moduleSource, /robust_z_score/);
assert.match(moduleSource, /temporal_window_seconds/);

assert.match(moduleSource, /\.rpc\("set_biological_signal_status"/);
assert.match(moduleSource, /balabs:organization-context/);
assert.match(moduleSource, /if \(!state\.organizationId\) \{\s*state\.rows = \[\];\s*state\.offset = 0;\s*state\.hasMore = false;/, "missing tenant context must clear stale pagination state");
assert.match(moduleSource, /new MutationObserver/);
assert.match(moduleSource, /node\.textContent = text/);
assert.match(tracker, /window\.BALabsGetOrganizationId = \(\) => organizationId/);
assert.match(tracker, /balabs:organization-context/);
assert.match(tracker, /window\.BALabsSupabaseClient = supabaseClient/);
assert.match(tracker, /userId: session\.user\.id/);
assert.match(styles, /#biologicalSignalsCard/);

for (const phrase of [
  "Centre des alertes biologiques",
  "Alertes actives",
  "Prendre en compte",
  "Observations sources",
  "Environnement",
  "Méthode d’analyse",
  "Anomalie temporelle IoT (MAD robuste)",
  "Score robuste"
]) {
  assert.ok(locales.includes(phrase), `Missing i18n coverage for: ${phrase}`);
}

console.log("PASS: shared biological alert inbox contract");
