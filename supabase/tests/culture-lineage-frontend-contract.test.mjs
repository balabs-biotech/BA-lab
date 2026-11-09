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
assert.match(source, /generationComparisonCultures.*addEventListener\(["']change["']/,
  'changing the selected cultures must invalidate any in-flight comparison report');
assert.match(source, /generationComparisonResults\.__generationComparisonRequestId = \(generationComparisonResults\.__generationComparisonRequestId \|\| 0\) \+ 1/,
  'opening another culture detail must invalidate a pending comparison for the previous selection');


console.log('PASS: CultureOps lineage, event history and generation comparison use bounded tenant RPCs');
