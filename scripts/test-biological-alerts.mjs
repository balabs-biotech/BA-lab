import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const moduleSource = read("batch-tracker/biological-alerts.js");
const workspace = read("batch-tracker/workspace.html");
const tracker = read("batch-tracker/tracker.js");
const styles = read("batch-tracker/tracker.css");
const locales = read("batch-tracker/i18n.js");
const lineageIndexMigration = read("supabase/migrations/20261110220000_add_material_relationship_reverse_index.sql");
const mixtureMigration = read("supabase/migrations/20261110230000_add_atomic_multi_source_material_creation.sql");
const traceabilityRuntimeTest = read("supabase/tests/biological_traceability.test.sql");

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
assert.match(workspace, /id="signalsHistory"/);
assert.match(workspace, /id="signalsHistoryList"/);
assert.match(moduleSource, /\.from\("biological_signals"\)/);
assert.match(moduleSource, /\.eq\("organization_id", state\.organizationId\)/);
assert.match(moduleSource, /\.eq\("domain", state\.domain\)/);
assert.match(moduleSource, /\.range\(pageOffset, pageOffset \+ PAGE_SIZE - 1\)/);
assert.match(moduleSource, /signalsLoadMore/);
assert.match(moduleSource, /loadHistory\("biological_subject_id"/);
assert.match(moduleSource, /loadHistory\("environment_id"/);
assert.match(moduleSource, /async function resolveHistoryIdentity/);
assert.match(moduleSource, /\.from\("cultures"\)/);
assert.match(moduleSource, /\.from\("plant_cultures"\)/);
assert.match(moduleSource, /\.from\("batches"\)/);
assert.match(moduleSource, /\.from\("environments"\)/);
assert.match(moduleSource, /strain:strains\(strain_code,designation,organism:organisms\(scientific_name\)\)/);
assert.match(moduleSource, /\.eq\("organization_id", state\.organizationId\).*\.eq\("id", id\)/);
assert.match(moduleSource, /\.eq\("culture_id", id\)/);
assert.match(moduleSource, /\.limit\(10\)/);
assert.match(moduleSource, /resolveHistoryIdentity\(kind, id\)/);
assert.match(moduleSource, /identity\.title/);
assert.match(moduleSource, /identity\.subtitle/);
assert.match(moduleSource, /async function resolveCultureLineage/);
assert.match(moduleSource, /async function resolveCultureLineage\(cultureId, organizationId\)/);
assert.match(moduleSource, /resolveCultureLineage\(id, organizationId\)/);
assert.match(moduleSource, /kind === "biological_subject_id" && domain !== "greentech"/);
assert.match(moduleSource, /resolveHistoryIdentity\(kind, id, organizationId, domain\)/);
assert.match(moduleSource, /\.eq\("organization_id", organizationId\)\.eq\("domain", domain\)\.eq\(kind, id\)/);

assert.match(moduleSource, /parent_culture_id/);
assert.match(moduleSource, /\.in\("parent_culture_id", frontier\)/);
assert.match(moduleSource, /MAX_ANCESTORS = 8/);
assert.match(moduleSource, /MAX_DESCENDANT_DEPTH = 5/);
assert.match(moduleSource, /MAX_CULTURES = 100/);
assert.match(moduleSource, /let frontier = \[cursor\.id\]/);
assert.match(moduleSource, /seen\.has\(child\.id\)/);
assert.match(moduleSource, /\.from\("events"\)/);
assert.match(moduleSource, /\.in\("culture_id", cultureIds\)/);
assert.match(moduleSource, /MAX_MATERIAL_DEPTH = 8/);
assert.match(moduleSource, /MAX_MATERIALS = 150/);
assert.match(moduleSource, /\.in\("parent_material_id", materialFrontier\)/);
assert.match(moduleSource, /\.in\("id", ids\)/);
assert.match(moduleSource, /\.from\("material_relationships"\)/);
assert.match(moduleSource, /child_material_id\.in\.\(/);
assert.match(moduleSource, /parent_material_id\.in\.\(/);
assert.match(moduleSource, /MAX_RELATIONSHIP_DEPTH = 5/);
assert.match(moduleSource, /MAX_RELATIONSHIPS = 300/);
assert.match(moduleSource, /relationshipByKey/);
assert.match(moduleSource, /unresolvedLegacyParents/);
assert.match(moduleSource, /Hydrate any legacy parent pointer/);
assert.match(moduleSource, /incomingByChild/);
assert.match(moduleSource, /Souches contributrices/);
assert.match(moduleSource, /contributorFrontier/);
assert.match(moduleSource, /contributorIds\.size < 150/);
assert.match(moduleSource, /incomingByChild\.get\(childId\)/);
assert.match(moduleSource, /\.in\("material_id", materialIds\)/);
assert.match(moduleSource, /strain:strains/);
assert.match(moduleSource, /Généalogie des matériaux/);
assert.match(moduleSource, /Relations entrantes :/);
assert.match(moduleSource, /Lots matière :/);
assert.match(lineageIndexMigration, /material_relationships_org_child_idx/);
assert.match(lineageIndexMigration, /organization_id, child_material_id, parent_material_id/);
assert.match(mixtureMigration, /create or replace function public\.create_biological_material_mixture/);
assert.match(mixtureMigration, /cardinality\(p_source_material_ids\) < 2/);
assert.match(mixtureMigration, /material_mixture_sources_must_be_unique/);
assert.match(mixtureMigration, /material_mixture_source_not_found/);
assert.match(mixtureMigration, /order by m\.id\s+for update/);
assert.match(mixtureMigration, /insert into public\.material_relationships/);
assert.match(mixtureMigration, /insert into public\.events/);
assert.match(mixtureMigration, /grant execute on function public\.create_biological_material_mixture/);
assert.match(traceabilityRuntimeTest, /create_biological_material_mixture/);
assert.match(traceabilityRuntimeTest, /single-source mixture was accepted/);
assert.match(traceabilityRuntimeTest, /consortium must persist two parent edges/);
assert.match(traceabilityRuntimeTest, /cross-tenant mixture source was accepted/);
assert.match(traceabilityRuntimeTest, /multiple strains into one strain_id/);
assert.match(workspace, /id="materialMixtureForm"/);
assert.match(workspace, /id="mixtureSources" multiple/);
assert.match(workspace, /id="mixturePreview"/);
assert.match(tracker, /async function refreshMaterialMixtureSources/);
assert.match(tracker, /\.eq\("organization_id", expectedOrganizationId\)/);
assert.match(tracker, /\.in\("id", cultureMaterialIds\)/);
assert.match(tracker, /document\.body\.dataset\.domain/);
assert.match(tracker, /rpc\("create_biological_material_mixture"/);
assert.match(tracker, /p_source_material_ids: selectedIds/);
assert.match(tracker, /p_operation: eventType/);
assert.match(tracker, /p_material_code: resultCode/);
assert.doesNotMatch(tracker, /p_event_type: eventType|p_result_code: resultCode/);
assert.match(tracker, /materialMixtureSourceRows/);
assert.match(tracker, /resetMaterialMixtureSources\(\)/);
assert.match(locales, /Assembler un mélange \/ consortium/);

assert.match(moduleSource, /payload\.operation/);
assert.match(moduleSource, /\.in\("culture_id", cultureIds\)/);
assert.match(moduleSource, /\.limit\(100\)/);
assert.match(moduleSource, /function renderCultureLineage/);
assert.match(moduleSource, /"Généalogie biologique"/);
assert.match(moduleSource, /payload\.source_material_ids/);
assert.match(moduleSource, /Matériaux composants/);
assert.match(moduleSource, /Source non résolue/);
assert.match(moduleSource, /Note de préparation/);
assert.match(moduleSource, /Univers d’origine/);
assert.match(moduleSource, /function buildBiologicalProvenanceIndex\(lineage\)/);
assert.match(moduleSource, /window\.BALabsBiologicalProvenance/);
assert.match(moduleSource, /traceMaterial/);
assert.match(moduleSource, /from\("measurements"\)/);
assert.match(moduleSource, /from\("observations"\)/);
assert.match(moduleSource, /from\("environmental_observations"\)/);
assert.match(moduleSource, /from\("biological_signals"\)/);
assert.match(moduleSource, /from\("results"\)/);
assert.match(moduleSource, /experimental_results/);
assert.match(moduleSource, /experimental_result_count/);

assert.match(moduleSource, /getCultureEvidence/);
assert.match(moduleSource, /temporal_location_context/);
assert.match(moduleSource, /environmental_context_is_causal: false/);
assert.match(moduleSource, /Contexte environnemental temporel et géographique uniquement/);
assert.match(moduleSource, /Preuves expérimentales associées/);
assert.match(moduleSource, /measurement_count/);
assert.match(moduleSource, /observation_count/);
assert.match(moduleSource, /biological_signal_count/);

assert.match(moduleSource, /findMaterialsByStrain/);
assert.match(moduleSource, /unresolved_material_ids/);
assert.match(moduleSource, /multi_parent_count/);
assert.match(moduleSource, /const traverse = \(startId, adjacency, endpointField, maxNodes = 150\)/);
assert.match(moduleSource, /edgeKeys\.has\(key\)/);
assert.match(moduleSource, /relatedEvents/);


assert.match(moduleSource, /signal-lineage-batches/);
assert.match(moduleSource, /request !== state\.historyRequest/);
assert.match(styles, /signal-lineage-list/);
assert.match(styles, /signal-lineage-batches/);
assert.match(styles, /signal-lineage-event/);

assert.doesNotMatch(moduleSource, /\["Sujet biologique", row\.biological_subject_id\]/);
assert.doesNotMatch(moduleSource, /\["Contexte biologique", row\.biological_context_id\]/);
assert.doesNotMatch(moduleSource, /\["Environnement", row\.environment_id\]/);


assert.match(moduleSource, /\.eq\(kind, id\)/);
assert.match(moduleSource, /\.limit\(50\)/);
assert.match(moduleSource, /signalsHistoryStatus/);
assert.match(moduleSource, /scrollIntoView/);
assert.match(moduleSource, /state\.historyRequest/);
assert.match(moduleSource, /signalsHistoryClose/);
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
assert.match(styles, /signal-history-entry/);

for (const phrase of [
  "Centre des alertes biologiques",
  "Alertes actives",
  "Prendre en compte",
  "Observations sources",
  "Environnement",
  "Méthode d’analyse",
  "Anomalie temporelle IoT (MAD robuste)",
  "Score robuste",
  "Historique du sujet",
  "Historique de l’environnement",
  "Chargement de l’historique…",
  "Aucun historique disponible pour ce contexte.",
  "Fermer"
]) {
  assert.ok(locales.includes(phrase), `Missing i18n coverage for: ${phrase}`);
}


assert.match(moduleSource, /operation_source:/);
assert.match(moduleSource, /operation_source_edge_count/);
assert.match(moduleSource, /payload\.source_material_ids/);

// Exercise the pure graph builder with a converging two-source operation.
// The output must trace back to both contributors and expose the operation edges.
const provenanceStart = moduleSource.indexOf("  function buildBiologicalProvenanceIndex(lineage) {");
const provenanceEnd = moduleSource.indexOf("\n  window.BALabsBiologicalProvenance", provenanceStart);
assert.ok(provenanceStart >= 0 && provenanceEnd > provenanceStart, "provenance builder must remain independently testable");
const buildProvenanceIndex = new Function("return (" + moduleSource.slice(provenanceStart, provenanceEnd).trim() + ");")();
const provenance = buildProvenanceIndex({
  materials: [
    { id: "source-a", material_code: "A", strain_id: "strain-a", strain: { id: "strain-a", strain_code: "A1", organism: { scientific_name: "Species A" } } },
    { id: "source-b", material_code: "B", strain_id: "strain-b", strain: { id: "strain-b", strain_code: "B1", organism: { scientific_name: "Species B" } } },
    { id: "mixture", material_code: "MIX-01", strain_id: null }
  ],
  relationships: [],
  cultures: [],
  events: [{
    id: "mix-event",
    material_id: "mixture",
    event_type: "material_mixture_created",
    occurred_at: "2026-11-11T10:00:00Z",
    payload: { operation: "consortium_assembly", source_material_ids: ["source-a", "source-b"] }
  }],
  evidence: {}
});
const mixtureTrace = provenance.traceMaterial("mixture");
assert.equal(mixtureTrace.found, true);
assert.deepEqual(new Set(mixtureTrace.ancestors.map(item => item.id)), new Set(["source-a", "source-b"]));
assert.equal(mixtureTrace.strains.length, 2, "a multi-source output must retain both contributing strains");
assert.equal(provenance.summarize().operation_source_edge_count, 2);
assert.equal(provenance.summarize().multi_parent_count, 1);
assert.ok(provenance.traceMaterial("source-a").descendants.some(item => item.id === "mixture"),
  "source trace must discover the mixture output");

console.log("PASS: shared biological alert inbox contract");
