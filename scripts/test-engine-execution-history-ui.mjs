import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tracker = readFileSync("batch-tracker/tracker.js", "utf8");
const workspace = readFileSync("batch-tracker/workspace.html", "utf8");

const i18n = readFileSync("batch-tracker/i18n.js", "utf8");
for (const label of [
  "Évaluation du contexte biologique",
  "Identité : ",
  "Identité biologique documentée",
  "Identité biologique non documentée",
  "Identité biologique contradictoire",
  "Assertions d’identité vérifiées",
  "Analyse exploitable",
  "Données insuffisantes",
  "Signaux qualité",
  "Sources environnementales",
  "Méthode et limites",
  "Fenêtre demandée : ",
  "Contexte manquant ou non résolu",
  "Faits observés et sources",
  "Caractéristiques calculées",
  "Hypothèses à vérifier",
  "Lacunes temporelles"
]) assert.ok(i18n.includes(JSON.stringify(label)), "Missing BIE localization source key: " + label);
for (const entry of [
  ["Évaluation du contexte biologique", "Biological context assessment"],
  ["Identité biologique documentée", "Documented biological identity"],
  ["Identité biologique non documentée", "Biological identity not documented"],
  ["Identité biologique contradictoire", "Conflicting biological identity"],
  ["Assertions d’identité vérifiées", "Verified identity assertions"],
  ["Évaluation du contexte biologique", "Avaliação do contexto biológico"],
  ["Évaluation du contexte biologique", "تقييم السياق البيولوجي"],
  ["Contextes biologiques datés", "Dated biological contexts"],
  ["Contextes biologiques datés", "Contextos biológicos datados"],
  ["Contextes biologiques datés", "السياقات البيولوجية المؤرخة"],
  ["Résultat : ", "Result: "],
  ["Résultat : ", "Resultado: "],
  ["Résultat : ", "النتيجة: "]
]) {
  assert.ok(i18n.includes(JSON.stringify(entry[0]) + ":" + JSON.stringify(entry[1])), "Missing BIE translation: " + entry[1]);
}


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
assert.match(loader, /scheduleEngineExecutionPolling\(/, "queued/running executions must activate status polling");

const renderer = tracker.slice(rendererStart, overviewStart);

const biologicalRendererStart = tracker.indexOf("function renderBiologicalContextAssessment(");
assert.ok(biologicalRendererStart >= 0 && biologicalRendererStart < rendererStart);
const biologicalRenderer = tracker.slice(biologicalRendererStart, rendererStart);
for (const contract of ["biological.context_assessment", "record_counts_by_type", "missing_context", "observed_facts", "derived_features", "findings", "hypotheses", "temporal_gaps", "quality_flags", "limitations", "provenance", "source_references", "biological_contexts", "genetic_reference", "genetic_reference_ids", "strain_code", "culture_stage", "substrate_code", "production_system", "textContent"]) {
  assert.ok(biologicalRenderer.includes(contract), "Missing BIE UI contract: " + contract);
}
assert.doesNotMatch(biologicalRenderer, /innerHTML|insertAdjacentHTML/);
assert.match(renderer, /renderBiologicalContextAssessment\(article, result\)/);

assert.match(renderer, /replaceChildren\(\)/);
assert.match(renderer, /textContent/);
assert.match(renderer, /quality_flags/);
assert.match(renderer, /storedResult/);
assert.match(renderer, /result\.value/);
assert.match(renderer, /Analyse exploitable/);
assert.match(renderer, /Données insuffisantes/);
assert.match(renderer, /Méthode et limites/);
assert.match(renderer, /provenance\?\.algorithm/);
assert.match(renderer, /measurement_count/);
assert.match(renderer, /variable_code/);
assert.match(renderer, /max_gap_minutes/);
assert.match(renderer, /error_code/);
const comparisonStart = tracker.indexOf("function getStoredEngineResult(execution)");
const comparison = tracker.slice(comparisonStart, rendererStart);
assert.ok(comparisonStart >= 0);
assert.match(comparison, /renderEngineExecutionComparison/);
assert.match(comparison, /getComparableEngineExecutions/);
assert.match(comparison, /areEngineExecutionsComparable/);
assert.match(comparison, /engine-comparison-select/);
assert.match(comparison, /input_snapshot_sha256/);
assert.match(comparison, /Les instantanés d’entrée diffèrent/);
assert.match(comparison, /Comparaison exacte des instantanés indéterminée/);
assert.match(comparison, /quality_flags/);
assert.match(comparison, /limitationsA/);
assert.match(comparison, /Limites ajoutées/);
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
assert.match(tracker, /function scheduleEngineExecutionPolling\(/);
assert.match(tracker, /status === "queued" \|\| execution\.status === "running"/);
assert.match(tracker, /document\.visibilityState === "hidden" \? 15000 : 5000/);
assert.match(tracker, /isCurrentWorkspaceRevision\(expectedRevision, expectedOrganizationId\)/);
assert.match(tracker, /clearTimeout\(engineExecutionPollingTimer\)/);
assert.match(tracker, /engineExecutionPollingOrganizationId !== expectedOrganizationId/);
assert.match(tracker, /engineExecutionPollingTimer = null/);
assert.match(tracker, /async function monitorPlantBiologicalAssessmentExecution/);
assert.match(tracker, /setTimeout\(resolve, 1000\)/);
assert.match(tracker, /execution\?\.status === "completed"/);
assert.match(tracker, /execution\?\.status === "failed"/);
assert.match(tracker, /for \(let attempt = 0; attempt < 90; attempt\+\+\)/);
const plantMonitorStart = tracker.indexOf("async function monitorPlantBiologicalAssessmentExecution(");
const plantMonitorEnd = tracker.indexOf("async function runPlantBiologicalAssessment()", plantMonitorStart);
const plantMonitor = tracker.slice(plantMonitorStart, plantMonitorEnd);
assert.doesNotMatch(plantMonitor, /await loadRecentEngineExecutions\(\)/, "BIE notices must reuse the shared tenant-safe polling loop");
assert.match(plantMonitor, /execution\?\.status === "completed"/);
assert.match(plantMonitor, /execution\?\.status === "failed"/);

for (const path of [
  "batch-tracker/mycology/index.html",
  "batch-tracker/laboratory/index.html",
  "batch-tracker/green-tech/index.html",
]) {
  const page = readFileSync(path, "utf8");
  if (path.includes("green-tech")) {
    assert.match(page, /workspace\.html\?v=20261113-bie-identity-ui-1/);
    assert.match(page, /tracker\.js\?v=20261113-bie-async-dispatch-1/);
    assert.match(page, /environmental-data\.js\?v=20261112-greentech-engine-qc-1/);
  } else {
    assert.match(page, /workspace\.html\?v=20261113-bie-identity-ui-1/);
    assert.match(page, /tracker\.js\?v=20261113-bie-async-dispatch-1/);
  }
}


const snapshotHelperStart = tracker.indexOf("function getEngineSnapshotComparison(");
const seriesKeyStart = tracker.indexOf("function getEngineSeriesComparisonKey(", snapshotHelperStart);
const comparableStart = tracker.indexOf("function areEngineExecutionsComparable(", seriesKeyStart);
const comparisonRendererStart = tracker.indexOf("function renderEngineExecutionComparison(", comparableStart);
assert.ok(snapshotHelperStart >= 0 && seriesKeyStart > snapshotHelperStart);
assert.ok(comparableStart > seriesKeyStart && comparisonRendererStart > comparableStart);

const snapshotHelperSource = tracker.slice(snapshotHelperStart, seriesKeyStart);
const seriesKeySource = tracker.slice(seriesKeyStart, comparableStart);
const comparableSource = tracker.slice(comparableStart, comparisonRendererStart);
const compareSnapshots = new Function(snapshotHelperSource + "; return getEngineSnapshotComparison;")();
const getSeriesKey = new Function(seriesKeySource + "; return getEngineSeriesComparisonKey;")();
const compareExecutions = new Function(
  "getStoredEngineResult",
  comparableSource + "; return areEngineExecutionsComparable;"
)((execution) => execution.mockResult);

const executionA = {
  id: "execution-a",
  status: "completed",
  engine_id: "environmental.timeseries.qc",
  engine_version: "0.1.0",
  scope: { organization_id: "org-a", culture_id: "culture-a" },
  mockResult: { result_type: "environmental_timeseries_qc", value: {} }
};
const executionB = { ...executionA, id: "execution-b", scope: { ...executionA.scope } };
const candidateHelperStart = tracker.indexOf("function getComparableEngineExecutionCandidates(");
const initialPairHelperStart = tracker.indexOf("function findInitialComparableEnginePair(");
assert.ok(candidateHelperStart >= 0, "compatible candidate filtering helper must exist");
assert.ok(initialPairHelperStart > candidateHelperStart, "initial compatible pair helper must exist");

const candidateHelpersEnd = tracker.indexOf("function renderEngineExecutionComparison(", candidateHelperStart);
const candidateHelpers = tracker.slice(candidateHelperStart, candidateHelpersEnd);
const candidateFunctions = new Function(
  "areEngineExecutionsComparable",
  candidateHelpers + "; return { getComparableEngineExecutionCandidates, findInitialComparableEnginePair };"
)((left, right) => left.compatible === true && right.compatible === true && left.id !== right.id);
const candidateA = { id: "candidate-a", compatible: true };
const candidateB = { id: "candidate-b", compatible: true };
const candidateC = { id: "candidate-c", compatible: false };
assert.deepEqual(
  candidateFunctions.getComparableEngineExecutionCandidates(candidateA, [candidateA, candidateB, candidateC]).map((item) => item.id),
  ["candidate-b"]
);
assert.deepEqual(
  candidateFunctions.findInitialComparableEnginePair([candidateA, candidateC, candidateB]).map((item) => item.id),
  ["candidate-a", "candidate-b"]
);
assert.equal(candidateFunctions.findInitialComparableEnginePair([candidateA, candidateC]), null);

assert.equal(compareExecutions(executionA, executionB), true);
assert.equal(compareExecutions(executionA, { ...executionB, id: executionA.id }), false);
assert.equal(compareExecutions(executionA, { ...executionB, engine_id: "other.engine" }), false);
assert.equal(compareExecutions(executionA, { ...executionB, engine_version: "0.2.0" }), false);
assert.equal(compareExecutions(executionA, { ...executionB, scope: { organization_id: "org-a", culture_id: "culture-b" } }), false);
assert.equal(compareExecutions(executionA, { ...executionB, mockResult: { result_type: "other_result", value: {} } }), false);

assert.equal(compareSnapshots(
  { input_snapshot_sha256: "a".repeat(64) },
  { input_snapshot_sha256: "a".repeat(64) }
), "same");
assert.equal(compareSnapshots(
  { input_snapshot_sha256: "a".repeat(64) },
  { input_snapshot_sha256: "b".repeat(64) }
), "different");
assert.equal(compareSnapshots({ input_record_ids: ["b", "a"] }, { input_record_ids: ["a", "b"] }), "same");
assert.equal(compareSnapshots({ input_record_ids: ["a"] }, { input_record_ids: ["b"] }), "different");
assert.equal(compareSnapshots({ input_record_ids: ["a"] }, {}), "unknown");

assert.equal(getSeriesKey({ variable_code: "temperature", unit_code: "Cel" }), "temperature::Cel");
assert.notEqual(
  getSeriesKey({ variable_code: "temperature", unit_code: "Cel" }),
  getSeriesKey({ variable_code: "temperature", unit_code: "K" })
);

console.log("Engine execution history UI contract checks passed.");


const environmental = readFileSync("batch-tracker/environmental-data.js", "utf8");
assert.match(environmental, /environmentalEnginePanel/);
assert.match(environmental, /Analyser la période météo/);
assert.match(environmental, /BA_LABS_GET_ORGANIZATION_ID/);
assert.match(environmental, /engine-orchestrator/);
assert.match(environmental, /environmental\.timeseries\.qc/);
assert.match(environmental, /record_type:\s*"environmental_observation"/);
assert.match(environmental, /scope:\s*\{location_id:locationId\}/);
assert.match(environmental, /idempotency-key/);
assert.match(environmental, /recordIds\.length>500/);
assert.match(environmental, /summary\.excluded_record_count/);
assert.match(environmental, /gap_after_record_ids/);
assert.doesNotMatch(environmental, /engineOutput\.innerHTML/);
