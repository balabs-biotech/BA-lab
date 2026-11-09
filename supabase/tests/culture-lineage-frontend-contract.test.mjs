import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('batch-tracker/tracker.js', 'utf8');
const migration = readFileSync('supabase/migrations/20261109143000_add_recursive_culture_lineage_rpc.sql', 'utf8');
const workspace = readFileSync('batch-tracker/workspace.html', 'utf8');
const start = source.indexOf('async function loadBiologicalLineage(cultureId, offset = 0) {');
const end = source.indexOf('\nasync function saveBiologicalOperation(event) {', start);
assert.ok(start >= 0 && end > start, 'lineage loader must remain a named, bounded function');

const loader = source.slice(start, end);
assert.match(loader, /supabaseClient\.rpc\('get_culture_lineage'/,
  'lineage loader must use the recursive database RPC');
assert.match(loader, /p_organization_id:\s*loadOrganizationId/,
  'lineage RPC must receive the active organization');
assert.match(loader, /p_culture_id:\s*cultureId/,
  'lineage RPC must receive the selected culture');
assert.match(loader, /p_limit:\s*200/,
  'lineage RPC must request an explicit bounded descendant result');
assert.match(loader, /p_offset:\s*offset/,
  'lineage RPC must request the selected descendant page');
assert.match(loader, /target\.__lineageRequestId/,
  'lineage reads must maintain a per-target request revision');
assert.match(loader, /target\.__lineageCultureId/,
  'lineage reads must be bound to the currently selected culture');
assert.match(loader, /lineageRequestId !== target\.__lineageRequestId/,
  'late lineage responses must be discarded after a newer culture selection');
assert.match(loader, /target\.__lineageCultureId !== cultureId/,
  'pagination must not append rows to a different selected culture');
assert.match(loader, /current\.has_more === true/,
  'lineage UI must use server pagination metadata');
assert.match(loader, /loadBiologicalLineage\(cultureId, offset \+ 200\)/,
  'lineage UI must load the next page without resetting the selected culture');
assert.match(loader, /target\.__lineageRows/,
  'lineage UI must preserve previously loaded descendants when appending a page');
assert.match(loader, /const lineageRowKey = row =>/,
  'lineage pages must define a stable identity for every row type');
assert.match(loader, /const lineageRowsByKey = new Map\(\)/,
  'lineage pagination must merge through a keyed collection');
assert.match(loader, /lineageRowsByKey\.set\(lineageRowKey\(row\), row\)/,
  'lineage pagination must merge by stable row identity instead of duplicating current, ancestor and material rows');
assert.match(loader, /Array\.from\(lineageRowsByKey\.values\(\)\)/,
  'lineage pagination must render the deduplicated merged rows');
assert.match(migration, /p_offset integer default 0/,
  'lineage RPC must expose an offset parameter');
assert.match(migration, /d\.row_number > v_offset and d\.row_number <= \(v_offset \+ v_limit\)/,
  'lineage RPC must return a bounded descendant page');
assert.doesNotMatch(migration, /count\(\*\)\s+over\s*\(\)/i,
  'lineage RPC must not calculate the same full descendant count in a window and aggregate');
assert.match(migration, /descendant_stats as \([\s\S]*?count\(\*\)::bigint as total_count from descendants/i,
  'lineage RPC must calculate the exact descendant total in one aggregate'); 
assert.doesNotMatch(loader, /\.from\(['"]cultures['"]\)|\.from\(['"]materials['"]\)/,
  'lineage loader must not fetch whole tenant culture or material tables');
assert.match(loader, /relation === 'ancestor'/);
assert.match(loader, /relation === 'descendant'/);
assert.match(loader, /relation === 'material_ancestor'/);
assert.match(loader, /material_relationship_type/,
  'material provenance UI must expose the typed relationship between materials');
assert.match(migration, /material_relationships/,
  'lineage RPC must read the canonical typed material relationship records');
assert.match(loader, /row\.truncated/,
  'partial results must be visibly signalled instead of silently presented as complete');
assert.match(loader, /rows\.some\(row => row\.truncated === true\)/,
  'all lineage dimensions must propagate truncation warnings');
assert.match(migration, /'ancestor_truncated'/,
  'culture ancestor depth truncation must be explicitly returned');
assert.match(migration, /'material_ancestor_truncated'/,
  'material provenance depth truncation must be explicitly returned');
assert.match(migration, /a\.depth = 250/,
  'culture ancestor depth boundary must be checked');
assert.match(migration, /ma\.depth = 250/,
  'material provenance depth boundary must be checked');


const detailStart = source.indexOf('async function loadCultureDetail(cultureId) {');
const detailEnd = source.indexOf('\nfunction updateOverview()', detailStart);
assert.ok(detailStart >= 0 && detailEnd > detailStart,
  'culture detail loader must remain a named function');
const detailLoader = source.slice(detailStart, detailEnd);
assert.match(detailLoader, /supabaseClient\.rpc\(["']get_culture_event_history["']/,
  'culture detail must read events through the tenant-scoped history RPC');
assert.match(detailLoader, /p_organization_id:\s*loadOrganizationId/,
  'event history RPC must receive the active organization');
assert.match(detailLoader, /p_culture_id:\s*culture\.id/,
  'event history RPC must receive the selected culture');
assert.match(detailLoader, /p_limit:\s*100/,
  'event history reads must remain bounded');
assert.match(detailLoader, /p_offset:\s*0/,
  'event history must explicitly select its first page');
assert.match(detailLoader, /row\.source_relation/,
  'timeline must preserve the origin relation of each event');
assert.match(detailLoader, /row\.event_id/,
  'timeline must use stable event identifiers returned by the RPC');
assert.match(detailLoader, /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/,
  'event history responses must remain protected against stale workspace reads');


const historyPaginationStart = source.indexOf('async function loadMoreCultureEventHistory(');
assert.ok(historyPaginationStart >= 0,
  'culture event history must expose an explicit next-page loader');
const historyPaginationEnd = source.indexOf('\nfunction ', historyPaginationStart);
const historyPagination = source.slice(historyPaginationStart,
  historyPaginationEnd > historyPaginationStart ? historyPaginationEnd : undefined);
assert.match(historyPagination, /get_culture_event_history/,
  'event history pagination must use the same tenant-scoped RPC');
assert.match(historyPagination, /p_offset:\s*offset/,
  'event history pagination must request the selected offset');
assert.match(historyPagination, /isCurrentWorkspaceRevision\(loadRevision, loadOrganizationId\)/,
  'event history pagination must reject stale workspace responses');
assert.match(detailLoader, /historyHasMore/ ,
  'culture timeline must expose a next-page control when the server reports more events');


const compareStart = source.indexOf('async function compareCultureGenerations() {');
const compareEnd = source.indexOf('\nasync function loadCultureDetail(cultureId) {', compareStart);
assert.ok(compareStart >= 0 && compareEnd > compareStart,
  'generation comparison must remain a named asynchronous operation');
const comparison = source.slice(compareStart, compareEnd);
assert.match(comparison, /supabaseClient\.rpc\("compare_culture_generations"/,
  'generation comparison must call the dedicated database RPC');
assert.match(comparison, /p_organization_id:\s*orgId/,
  'generation comparison must be tenant scoped');
assert.match(comparison, /p_culture_ids:\s*cultureIds/,
  'generation comparison must pass the explicit selected culture IDs');
assert.match(comparison, /cultureIds\.length < 2 \|\| cultureIds\.length > 4/,
  'generation comparison must enforce the two-to-four culture selection');
assert.match(comparison, /isCurrentWorkspaceRevision\(revision, orgId\)/,
  'generation comparison must reject stale workspace responses');
assert.match(comparison, /renderGenerationComparisonReport\(data \|\| \{\}\)/,
  'generation comparison must render the structured evidence response');
assert.doesNotMatch(comparison, /innerHTML/,
  'generation comparison report must use safe DOM construction rather than injecting HTML');
assert.match(workspace, /id="generationComparisonCultures"/,
  'culture detail must expose the generation selection control');
assert.match(workspace, /id="generationComparisonSearch"/,
  'culture comparison must provide a search control rather than an unfiltered native multi-select');
assert.match(workspace, /id="generationComparisonOptions"/,
  'culture comparison must expose a mobile-friendly checkbox list');
assert.match(source, /checkbox\.type\s*=\s*["']checkbox["']/,
  'culture comparison options must be selectable with accessible checkboxes');
assert.match(source, /selectedCultureIds\.length\s*>\s*4/,
  'culture comparison must prevent selecting more than four cultures in the UI');

assert.match(workspace, /id="compareCultureGenerationsButton"/,
  'culture detail must expose the comparison action');
assert.match(workspace, /id="generationComparisonResults"/,
  'culture detail must expose the comparison report region');
assert.match(source, /__generationComparisonRequestId/,
  'comparison requests must use DOM-scoped revisions so auth cleanup can invalidate them safely');
assert.doesNotMatch(source, /compareCultureGenerations\.requestId/,
  'workspace cleanup must not depend on a function scoped to another script context');
assert.match(source, /compareCultureGenerationsButton.*addEventListener\("click", compareCultureGenerations\)/,
  'generation comparison action must be connected to its handler');
assert.match(source, /checkbox\.addEventListener\(["']change["']/,
  'changing a selected culture checkbox must invalidate any in-flight comparison report');
assert.match(source, /generationComparisonResults\.__generationComparisonRequestId = \(generationComparisonResults\.__generationComparisonRequestId \|\| 0\) \+ 1/,
  'opening another culture detail must invalidate a pending comparison for the previous selection');

const reportStart = source.indexOf('function renderGenerationComparisonReport(report) {');
const reportEnd = source.indexOf('\nasync function compareCultureGenerations() {', reportStart);
assert.ok(reportStart >= 0 && reportEnd > reportStart,
  'generation comparison report renderer must remain independently testable');
const reportRenderer = source.slice(reportStart, reportEnd);
assert.match(reportRenderer, /source_relation === "culture" && row\.culture_id/,
  'descriptive statistics must use culture-linked measurements only');
assert.match(reportRenderer, /source_relation === "environment" \|\| !row\.culture_id/,
  'environmental measurements must remain separately identified as context');
assert.match(reportRenderer, /normalized_value \?\? row\.raw_value/,
  'statistics must prefer normalized values and preserve raw fallback');
assert.match(reportRenderer, /normalized_unit_code|raw_unit_code/,
  'statistics must keep measurements separated by their actual unit');
assert.match(reportRenderer, /quality_state === "excluded"/,
  'excluded measurements must not enter descriptive statistics');
assert.match(reportRenderer, /quantile\(sorted, \.5\)/,
  'generation comparison must calculate the median');
assert.match(reportRenderer, /quantile\(sorted, \.25\)/,
  'generation comparison must calculate the first quartile');
assert.match(reportRenderer, /quantile\(sorted, \.75\)/,
  'generation comparison must calculate the third quartile');
assert.match(reportRenderer, /pas le nombre de répétitions biologiques indépendantes/,
  'measurement counts must not be presented as biological replicate counts');
assert.match(reportRenderer, /Mesures environnementales contextuelles/,
  'shared environmental measurements must remain explicit contextual evidence');
assert.match(reportRenderer, /culture_environment_context/,
  'the report must consume explicit culture-to-location context mappings');
assert.match(reportRenderer, /environmentalObservations/,
  'the report must build separate contextual environmental time series');
assert.match(reportRenderer, /Contexte environnemental par lieu/,
  'the report must render a dedicated location-linked environmental section');
assert.match(reportRenderer, /location_id/,
  'environmental observations must be matched only to the recorded location');
assert.match(reportRenderer, /contextRelations/,
  'environmental context must preserve whether it came from the culture or a linked batch');
assert.match(reportRenderer, /batchCodes/,
  'environmental context must retain the production batch identifiers that supplied the location');
assert.match(reportRenderer, /Lots liés/,
  'the report must visibly disclose the linked production batches behind contextual observations');
assert.match(reportRenderer, /environnement déclaré sur la culture/,
  'the UI must distinguish a culture-declared environment from a batch-derived location');
assert.match(reportRenderer, /résolution spatiale/,
  'gridded environmental observations must disclose their spatial resolution');
assert.match(reportRenderer, /ne sont pas des mesures directes de la culture/,

assert.match(reportRenderer, /environmental_truncated/,
  'the environmental context panel must read the RPC truncation flag');
assert.match(reportRenderer, /observations environnementales retournées/,
  'the UI must disclose when the 500-row environmental evidence cap omits history');
  'external environmental observations must never be presented as direct culture measurements');

assert.match(reportRenderer, /culture\.experimental_unit_id/,
  'replicate-aware analysis must identify the experimental unit attached to each culture');
assert.match(reportRenderer, /culture\.experiment_id/,
  'independent-unit comparisons must remain scoped to a common experiment');
assert.match(reportRenderer, /culture\.treatment_code/,
  'independent-unit comparisons must keep treatment cohorts separate');
assert.match(reportRenderer, /unitMeasurements/,
  'repeated readings must be collapsed within each experimental unit before cohort comparison');
assert.match(reportRenderer, /cohort\.units\.length >= 2/,
  'replicate comparisons must require at least two distinct experimental units');
assert.match(reportRenderer, /Médiane des unités/,
  'replicate summaries must report unit-level medians');
assert.match(reportRenderer, /Aucune p-value ni conclusion causale/,
  'the current descriptive engine must not imply unsupported statistical inference');
assert.match(reportRenderer, /Mesures non rattachées à une unité expérimentale identifiable/,
  'measurements without an identifiable experimental unit must be disclosed');





assert.match(reportRenderer, /anomalyEligibleCohorts/,
  'the comparison report must expose a dedicated candidate-anomaly analysis');
assert.match(reportRenderer, /cohort\.units\.length >= 4/,
  'IQR candidate flags must require at least four distinct experimental units');
assert.match(reportRenderer, /1\.5 \* iqr|1\.5\s*\*\s*iqr/i,
  'candidate anomalies must use the conventional 1.5-IQR descriptive fence');
assert.match(reportRenderer, /valeur atypique candidate — à vérifier/,
  'flagged values must be labelled as candidates requiring review');
assert.match(reportRenderer, /effectif insuffisant pour le repérage IQR/,
  'cohorts below four units must explicitly report insufficient sample size');
assert.match(reportRenderer, /Aucune mesure atypique n'est exclue automatiquement/,
  'candidate flags must never silently exclude source measurements');


assert.match(reportRenderer, /timeSeriesGroups/,
  'the report must build culture-specific chronological measurement series');
assert.match(reportRenderer, /measured_at/,
  'time-series ordering must use the recorded measurement timestamp');
assert.match(reportRenderer, /Évolution temporelle des mesures/,
  'the report must render a dedicated temporal evolution section');
assert.match(reportRenderer, /variation depuis le relevé précédent/,
  'each time-series point must expose its change from the previous reading');
assert.match(reportRenderer, /variation en % non calculable/,
  'percentage change must be withheld when the previous value is zero');
assert.match(reportRenderer, /date non exploitable/,
  'measurements without a valid timestamp must be disclosed rather than silently ordered');
assert.match(reportRenderer, /unités comparables uniquement/,
  'time series must remain separated by culture, variable and unit');
assert.match(reportRenderer, /createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/,
  'each temporal series must render a native SVG chart without a third-party dependency');
assert.match(reportRenderer, /setAttribute\("role", "img"\)/,
  'temporal charts must expose an accessible image role');
assert.match(reportRenderer, /setAttribute\("aria-label"/,
  'temporal charts must have a descriptive accessible label');
assert.match(reportRenderer, /firstTime|lastTime/,
  'chart horizontal positions must represent actual elapsed time');
assert.match(reportRenderer, /polyline\.setAttribute\("points"/,
  'temporal charts must connect the recorded observations');

assert.match(reportRenderer, /surveillance temporelle/,
  'time series must include an operational monitoring summary');
assert.match(reportRenderer, /minimum de 5 relevés/,
  'candidate trend and rupture detection must disclose its minimum observation count');
assert.match(reportRenderer, /9 relevés.*tendance monotone|tendance monotone.*9 relevés/i,
  'the UI must disclose that monotone trend candidates require nine observations, not five');
assert.match(reportRenderer, /tendance monotone candidate/,
  'the monitor must flag sustained monotone sequences as candidates');
assert.match(reportRenderer, /rupture candidate/,
  'the monitor must flag abrupt deviations from a prior rolling baseline');
assert.match(reportRenderer, /if \(mad > 0\)/,
  'zero MAD must not silently become a zero-width alert threshold');
assert.match(reportRenderer, /MAD nul|MAD égal à zéro|MAD est nul/i,
  'zero-MAD baselines must disclose that no robust threshold can be inferred');
assert.match(reportRenderer, /MAD/,
  'abrupt deviations must use a robust median absolute deviation baseline');
assert.match(reportRenderer, /ne modifie pas les mesures/,
  'monitoring must never alter source measurements');

console.log('PASS: CultureOps lineage, event history and generation comparison use bounded tenant RPCs');
