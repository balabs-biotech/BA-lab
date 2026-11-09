import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('batch-tracker/tracker.js', 'utf8');
const migration = readFileSync('supabase/migrations/20261109190000_add_culture_event_history_rpc.sql', 'utf8');
const start = source.indexOf('async function loadCultureDetail(cultureId) {');
const end = source.indexOf('\nfunction updateOverview()', start);
assert.ok(start >= 0 && end > start, 'culture detail loader must remain a named function');
const loader = source.slice(start, end);

assert.match(loader, /supabaseClient\.rpc\(["']get_culture_event_history["']/,
  'culture detail must use the tenant-scoped event history RPC');
assert.match(loader, /p_organization_id:\s*loadOrganizationId/,
  'event history RPC must receive the active organization');
assert.match(loader, /p_culture_id:\s*culture\.id/,
  'event history RPC must receive the selected culture');
assert.match(loader, /p_limit:\s*100/,
  'event history reads must be explicitly bounded');
assert.doesNotMatch(loader, /\.from\(["']events["']\)/,
  'culture detail must not read the events table directly');
assert.match(loader, /source_relation === "creation_operation"/,
  'culture detail must label the operation that created a descendant');
assert.match(loader, /eventHistory\?\.some\(row => row\.has_more === true\)/,
  'culture detail must surface server-reported partial event history');
const paginationStart = source.indexOf('async function loadMoreCultureEventHistory(');
const paginationEnd = source.indexOf('async function loadCultureDetail(cultureId) {', paginationStart);
const paginationLoader = source.slice(paginationStart, paginationEnd);
assert.match(source, /function sortCultureEventTimelineEntries\(timeline, beforeElement = null\)/,
  'timeline must have a shared chronological sorter');
assert.match(source, /dataset\.cultureEventEntry = "true"/,
  'initial and paginated event entries must be identifiable for global sorting');
assert.match(loader, /sortCultureEventTimelineEntries\(timeline\)/,
  'initial event entries must be sorted after rendering');
assert.match(paginationLoader, /dataset\.cultureEventEntry = "true"/,
  'paginated event entries must be identifiable for global sorting');
assert.match(paginationLoader, /sortCultureEventTimelineEntries\(timeline, button\)/,
  'new pages must be merged into global chronological order without moving the pagination control');

assert.match(migration, /security definer/i, 'event history RPC must be security definer');
assert.match(migration, /set search_path = pg_catalog/i, 'event history RPC must pin search_path');
assert.match(migration, /private\.is_org_member\(p_organization_id\)/,
  'event history RPC must enforce organization membership');
assert.match(migration, /creation_operation/,
  'event history must expose the operation that created a descendant');
assert.match(migration, /descendant_created/,
  'event history must resolve descendant creation links');
assert.match(migration, /events_org_culture_time_idx/,
  'event history must have a culture/time index');
assert.match(migration, /'batch'::text/,
  'event history must preserve events associated with production batches');
console.log('PASS: CultureOps event history UI uses bounded tenant RPC');
