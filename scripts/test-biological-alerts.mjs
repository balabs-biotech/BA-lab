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
assert.match(moduleSource, /\.from\("biological_signals"\)/);
assert.match(moduleSource, /\.eq\("organization_id", state\.organizationId\)/);
assert.match(moduleSource, /\.eq\("domain", state\.domain\)/);
assert.match(moduleSource, /\.limit\(100\)/);
assert.match(moduleSource, /\.rpc\("set_biological_signal_status"/);
assert.match(moduleSource, /balabs:organization-context/);
assert.match(moduleSource, /new MutationObserver/);
assert.match(moduleSource, /node\.textContent = text/);
assert.match(tracker, /window\.BALabsGetOrganizationId = \(\) => organizationId/);
assert.match(tracker, /balabs:organization-context/);
assert.match(styles, /#biologicalSignalsCard/);

for (const phrase of [
  "Centre des alertes biologiques",
  "Alertes actives",
  "Prendre en compte",
  "Observations sources",
  "Environnement"
]) {
  assert.ok(locales.includes(phrase), `Missing i18n coverage for: ${phrase}`);
}

console.log("PASS: shared biological alert inbox contract");
