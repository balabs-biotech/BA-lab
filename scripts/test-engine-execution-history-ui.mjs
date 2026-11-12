import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tracker = readFileSync("batch-tracker/tracker.js", "utf8");
const workspace = readFileSync("batch-tracker/workspace.html", "utf8");

assert.match(workspace, /id="overviewRecentEngineExecutions"/);
assert.match(workspace, /Afficher les dernières analyses calculées/);

const loaderStart = tracker.indexOf("async function loadRecentEngineExecutions()");
const rendererStart = tracker.indexOf("function renderRecentEngineExecutions()", loaderStart);
const overviewStart = tracker.indexOf("function updateOverview()", rendererStart);
assert.ok(loaderStart >= 0 && rendererStart > loaderStart && overviewStart > rendererStart);

const loader = tracker.slice(loaderStart, rendererStart);
assert.match(loader, /from\("engine_executions"\)/);
assert.match(loader, /from\("engine_execution_results"\)/);
assert.match(loader, /input_snapshot_sha256/);
assert.match(loader, /recentEngineResultsByExecution/);
assert.match(loader, /\.eq\("organization_id", loadOrganizationId\)/);
assert.match(loader, /\.order\("created_at", \{ ascending: false \}\)/);
assert.match(loader, /\.limit\(8\)/);
assert.match(loader, /engineExecutionHistoryRequestId/);
assert.match(loader, /isCurrentWorkspaceRevision/);

const renderer = tracker.slice(rendererStart, overviewStart);
assert.match(renderer, /replaceChildren\(\)/);
assert.match(renderer, /textContent/);
assert.match(renderer, /quality_flags/);
assert.match(renderer, /storedResult/);
assert.match(renderer, /storedResult\.value/);
assert.match(renderer, /Analyse exploitable/);
assert.match(renderer, /Données insuffisantes/);
assert.match(renderer, /Méthode et limites/);
assert.match(renderer, /provenance\?\.algorithm/);
assert.match(renderer, /measurement_count/);
assert.match(renderer, /variable_code/);
assert.match(renderer, /max_gap_minutes/);
assert.match(renderer, /error_code/);
const comparisonStart = tracker.indexOf("function getStoredEngineResult()");
const comparison = tracker.slice(comparisonStart, rendererStart);
assert.ok(comparisonStart >= 0);
assert.match(comparison, /renderEngineExecutionComparison/);
assert.match(comparison, /getComparableEngineExecutions/);
assert.match(comparison, /areEngineExecutionsComparable/);
assert.match(comparison, /engine-comparison-select/);
assert.match(comparison, /input_snapshot_sha256/);
assert.match(comparison, /Les instantanés d’entrée diffèrent/);
assert.match(comparison, /quality_flags/);
assert.match(comparison, /variable_code/);
assert.match(comparison, /unit_code/);
assert.match(comparison, /périmètre incompatibles/);
assert.match(comparison, /aucune relation causale/);
assert.match(loader, /input_record_ids,input_snapshot_sha256,scope/);

assert.doesNotMatch(renderer, /innerHTML|insertAdjacentHTML/);

assert.match(tracker, /recentEngineExecutions = \[\]/);
assert.match(tracker, /recentEngineResultsByExecution = new Map\(\)/);
assert.match(tracker, /engineExecutionHistoryRequestId\+\+/);
assert.match(tracker, /loadRecentEngineExecutions\(\)/);

for (const path of [
  "batch-tracker/mycology/index.html",
  "batch-tracker/laboratory/index.html",
  "batch-tracker/green-tech/index.html",
]) {
  const page = readFileSync(path, "utf8");
  assert.match(page, /workspace\.html\?v=20261112-engine-history-4/);
  assert.match(page, /tracker\.js\?v=20261112-engine-history-4/);
}

console.log("Engine execution history UI contract checks passed.");
