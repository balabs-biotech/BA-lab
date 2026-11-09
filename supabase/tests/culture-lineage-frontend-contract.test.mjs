import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('batch-tracker/tracker.js', 'utf8');
const migration = readFileSync('supabase/migrations/20261109143000_add_recursive_culture_lineage_rpc.sql', 'utf8');
const start = source.indexOf('async function loadBiologicalLineage(cultureId, offset = 0) {');
const end = source.indexOf('\nlet pendingBiologicalOperationKey', start);
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
assert.match(loader, /current\.has_more === true/,
  'lineage UI must use server pagination metadata');
assert.match(loader, /loadBiologicalLineage\(cultureId, offset \+ 200\)/,
  'lineage UI must load the next page without resetting the selected culture');
assert.match(loader, /target\.__lineageRows/,
  'lineage UI must preserve previously loaded descendants when appending a page');
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
  'material ancestor depth boundary must be checked');


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
assert.match(detailLoader, /history\.has_more === true/,
  'culture timeline must expose a next-page control when the server reports more events');

console.log('PASS: CultureOps lineage and event history UI use bounded tenant RPCs');
