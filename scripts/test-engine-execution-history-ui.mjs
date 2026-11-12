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
assert.match(renderer, /measurement_count/);
assert.match(renderer, /variable_code/);
assert.match(renderer, /max_gap_minutes/);
assert.match(renderer, /error_code/);
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
  assert.match(page, /workspace\.html\?v=20261112-engine-history-2/);
  assert.match(page, /tracker\.js\?v=20261112-engine-history-1/);
}

console.log("Engine execution history UI contract checks passed.");
