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
const interpretationMigration = read("supabase/migrations/20261112090000_add_biological_interpretation_registry.sql");
const environmentalAnalysisFunction = read("supabase/functions/environmental-analysis/index.ts");
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
assert.match(moduleSource, /const materialTrace = provenanceIndex\.traceMaterial\(material\.id\)/);
assert.match(moduleSource, /materialTrace\.ancestors/);
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
assert.match(mixtureMigration, /unsupported_material_mixture_operation/);
assert.match(mixtureMigration, /material_mixture_source_not_active/);
assert.match(mixtureMigration, /order by m\.id\s+for update/);
assert.match(mixtureMigration, /insert into public\.material_relationships/);
assert.match(mixtureMigration, /insert into public\.events/);
assert.match(mixtureMigration, /grant execute on function public\.create_biological_material_mixture/);
assert.match(traceabilityRuntimeTest, /create_biological_material_mixture/);
assert.match(traceabilityRuntimeTest, /single-source mixture was accepted/);
assert.match(traceabilityRuntimeTest, /consortium must persist two parent edges/);
assert.match(traceabilityRuntimeTest, /cross-tenant mixture source was accepted/);
assert.match(traceabilityRuntimeTest, /unsupported mixture operation was accepted/);
assert.match(traceabilityRuntimeTest, /inactive mixture source was accepted/);
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
  // The SQL graph and event payload intentionally describe the same source pairs.
  // Traversal must count each parent→mixture edge once, while retaining event evidence.
  relationships: [
    { parent_material_id: "source-a", child_material_id: "mixture", relationship_type: "consortium_assembly" },
    { parent_material_id: "source-b", child_material_id: "mixture", relationship_type: "consortium_assembly" }
  ],
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
assert.equal(mixtureTrace.strains.length, 2, "a multi-source output must retain both documented ancestral strain assignments");
assert.equal(mixtureTrace.lineage_strains.length, 2);
assert.equal(mixtureTrace.source_materials.length, 2, "direct source materials must remain distinct from ancestral strain assignments");
assert.deepEqual(mixtureTrace.confirmed_composition, [], "genealogy alone must never be reported as confirmed biological composition");
assert.equal(mixtureTrace.composition_status, "not_assessed");
assert.equal(provenance.summarize().operation_source_edge_count, 2);
assert.equal(provenance.summarize().relationship_count, 2, "persisted edges and event evidence must not double-count graph relationships");
assert.equal(provenance.summarize().multi_parent_count, 1, "a multi-source output must count unique contributing parents");
assert.equal(mixtureTrace.ancestors.length, 2, "duplicate event and relationship evidence must not duplicate ancestors");
assert.ok(provenance.traceMaterial("source-a").descendants.some(item => item.id === "mixture"),
  "source trace must discover the mixture output");

// A material with one biological parent may have both a relationship-table edge
// and an operation-event edge. Those are two provenance paths, not two parents.
const duplicatePathIndex = buildProvenanceIndex({
  materials: [{ id: "single-parent", material_code: "SRC" }, { id: "single-child", material_code: "OUT" }],
  relationships: [{ parent_material_id: "single-parent", child_material_id: "single-child", relationship_type: "derived_from" }],
  cultures: [],
  events: [{ id: "single-parent-event", material_id: "single-child", event_type: "material_mixture_created", payload: { operation: "blending", source_material_ids: ["single-parent"] } }],
  evidence: {}
});
assert.equal(duplicatePathIndex.summarize().multi_parent_count, 0,
  "multiple provenance paths from the same parent must not be counted as multiple biological parents");

console.log("PASS: shared biological alert inbox contract");

assert.match(moduleSource, /qualityIssues/);
assert.match(moduleSource, /markIncomplete\("material_relationships"/);
assert.match(moduleSource, /markIncomplete\("material_ancestors"/);
assert.match(moduleSource, /lineageQuality: \{ complete: qualityIssues\.length === 0, issues: qualityIssues \}/);
assert.match(moduleSource, /Généalogie partielle/);
assert.match(styles, /signal-lineage-quality/);

assert.match(moduleSource, /lineage_strains: lineageStrains/);
assert.match(moduleSource, /confirmed_composition: \[\]/);
assert.match(moduleSource, /composition_status: "not_assessed"/);
assert.match(moduleSource, /Souches documentées dans la généalogie/);
assert.match(moduleSource, /Composition biologique confirmée : non évaluée/);
assert.match(moduleSource, /measurement_interpretation: "quantitative_observation"/);
assert.match(moduleSource, /observation_interpretation: "descriptive_observation"/);
assert.match(moduleSource, /signal_interpretation: "rule_or_anomaly_output_not_identity_confirmation"/);
assert.match(moduleSource, /result_interpretation: "experiment_result_requires_method_and_result_semantics_review"/);
assert.match(moduleSource, /composition_evidence: \[\]/);
assert.match(moduleSource, /const findings = cultureSignals\.map\(signal =>/);
assert.match(moduleSource, /finding_id: signal\.signal_id/);
assert.match(moduleSource, /recommendation_code: signal\.recommendation_code/);
assert.match(moduleSource, /hypotheses: \[\]/);
assert.match(moduleSource, /confidence: null/);
assert.match(moduleSource, /confirmation_status: "unconfirmed"/);
assert.match(moduleSource, /composition_status: "not_assessed"/);
assert.match(moduleSource, /finding_count: findings\.length/);
assert.match(moduleSource, /const biologicalContext =/);
assert.match(moduleSource, /current_stage: currentBatch\?\.current_stage/);
assert.match(moduleSource, /generation: culture\?\.material\?\.generation/);
assert.match(moduleSource, /organism_name: culture\?\.material\?\.strain\?\.organism\?\.scientific_name/);
assert.match(moduleSource, /causal_relationship_established: false/);
assert.match(moduleSource, /biological_context: biologicalContext/);
assert.match(moduleSource, /environmental_context: environmentalSummary/);
assert.match(moduleSource, /const summarizeTimeSeries =/);
assert.match(moduleSource, /rawValue === null \|\| rawValue === undefined \|\| rawValue === ""/);
assert.match(moduleSource, /measurementTrends = summarizeTimeSeries\(cultureMeasurements/);
assert.match(moduleSource, /environmentalTrends = summarizeTimeSeries\(environmentalContext/);
assert.match(moduleSource, /minimum: Math\.min\(\.\.\.values\)/);
assert.match(moduleSource, /maximum: Math\.max\(\.\.\.values\)/);
assert.match(moduleSource, /direction: delta > 0 \? "increasing"/);
assert.match(moduleSource, /temporal_association_is_causal: false/);
assert.match(moduleSource, /const temporalEvidenceForFinding = signal =>/);
assert.match(moduleSource, /nearby_environmental_observation_ids/);
assert.match(moduleSource, /linked_observation_ids/);
assert.match(moduleSource, /window_hours: 24/);
assert.match(moduleSource, /causal_relationship_established: false/);
assert.match(moduleSource, /const contextCompleteness =/);
assert.match(moduleSource, /lineage\?\.evidenceAvailability\?\.measurements === true/);
assert.match(moduleSource, /lineage\?\.evidenceAvailability\?\.environmental_observations === true/);
assert.match(moduleSource, /lineage\?\.lineageQuality\?\.complete === true/);

assert.match(moduleSource, /biological_field_coverage/);
assert.match(moduleSource, /insufficient_context_for_biological_interpretation/);
assert.match(moduleSource, /temporal_evidence: temporalEvidence,/);
assert.match(moduleSource, /const compareFindingEvidence = \(signal, temporalEvidence\) =>/);
assert.match(moduleSource, /same_variable_measurement_count/);
assert.match(moduleSource, /unit_compatible_measurement_count/);
assert.match(moduleSource, /measurement_quality_states: matchingMeasurements\.map/);
assert.match(moduleSource, /nearby_experimental_result_ids: linkedResults\.map/);
assert.doesNotMatch(moduleSource, /qualityLimitedMeasurements/);
assert.doesNotMatch(moduleSource, /measurement_quality_limited_ids/);

assert.match(moduleSource, /different_numeric_value_no_tolerance_defined/);
assert.match(moduleSource, /no_unit_compatible_measurement/);
assert.match(moduleSource, /environmental_evidence_role: "context_only_not_direct_biological_confirmation"/);
assert.match(moduleSource, /evidence_interpretation: "descriptive_comparison_only_no_threshold_or_causal_inference"/);
assert.match(moduleSource, /evidence_assessment: compareFindingEvidence\(signal, temporalEvidence\)/);


assert.match(moduleSource, /trend_semantics: "descriptive_first_to_last_change_not_a_causal_or_threshold_assessment"/);


assert.match(moduleSource, /source_observation_ids,variable_code,observed_date/);

assert.match(moduleSource, /composition_status: "not_assessed"/);


assert.match(interpretationMigration, /create table public\.biological_interpretations/);
assert.match(interpretationMigration, /create table public\.biological_interpretation_events/);
assert.match(interpretationMigration, /interpretation_payload jsonb not null check \(jsonb_typeof\(interpretation_payload\) = 'object'\)/);
assert.match(interpretationMigration, /before update or delete on public\.biological_interpretations/);
assert.match(interpretationMigration, /before update or delete on public\.biological_interpretation_events/);
assert.match(interpretationMigration, /private\.is_org_member\(organization_id\)/);
assert.match(interpretationMigration, /auth\.jwt\(\) ->> 'role'.*service_role/s);
assert.match(interpretationMigration, /v_signal\.biological_subject_id/);
assert.match(interpretationMigration, /v_signal\.source_analysis_id/);
assert.match(interpretationMigration, /v_signal\.source_finding_id/);
assert.match(interpretationMigration, /v_inserted boolean/);
assert.match(interpretationMigration, /if v_inserted then/);

assert.match(interpretationMigration, /unique \(organization_id, source_signal_id, engine_code, engine_version\)/);
assert.match(interpretationMigration, /on conflict \([\s\S]*source_signal_id, engine_code, engine_version[\s\S]*\) do nothing/);
assert.match(environmentalAnalysisFunction, /function persistedInterpretationStatus\(findingStatus: unknown\)/);
assert.match(environmentalAnalysisFunction, /case "normal":[\s\S]*return "observed_only"/);
assert.match(environmentalAnalysisFunction, /case "insufficient_history":[\s\S]*return "insufficient_evidence"/);
assert.match(environmentalAnalysisFunction, /case "suspect":[\s\S]*return "requires_review"/);
assert.match(environmentalAnalysisFunction, /analysisResult\.engine_version/);
assert.match(environmentalAnalysisFunction, /adminClient\.rpc\([\s\S]*"record_biological_interpretation"/);
assert.match(environmentalAnalysisFunction, /p_source_signal_id: signal\.signal_id/);
assert.match(environmentalAnalysisFunction, /p_interpretation_payload: interpretationPayload/);
assert.match(environmentalAnalysisFunction, /interpretation_persistence_status: interpretationPersistenceStatus/);
assert.match(environmentalAnalysisFunction, /persisted_interpretation_count: persistedInterpretationCount/);

assert.match(moduleSource, /\.from\("biological_interpretations"\)/);
assert.match(moduleSource, /\.from\("biological_interpretation_events"\)/);
assert.match(moduleSource, /biological_interpretations: !interpretationResult\.error/);
assert.match(moduleSource, /biological_interpretation_events: interpretationEventsAvailable/);
assert.match(moduleSource, /interpretation_history: \{/);
assert.match(moduleSource, /snapshots: cultureInterpretations/);
assert.match(moduleSource, /events: cultureInterpretationEvents/);
assert.match(moduleSource, /interpretation_snapshot_count: cultureInterpretations\.length/);
assert.match(moduleSource, /interpretation_event_count: cultureInterpretationEvents\.length/);
assert.match(moduleSource, /biologicalInterpretationEvents\.length >= 2000/);
