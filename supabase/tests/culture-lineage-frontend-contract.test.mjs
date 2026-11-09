import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('batch-tracker/tracker.js', 'utf8');
const migration = readFileSync('supabase/migrations/20261109143000_add_recursive_culture_lineage_rpc.sql', 'utf8');
const start = source.indexOf('async function loadBiologicalLineage(cultureId) {');
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
assert.doesNotMatch(loader, /\.from\(['"]cultures['"]\)|\.from\(['"]materials['"]\)/,
  'lineage loader must not fetch whole tenant culture or material tables');
assert.match(loader, /relation === 'ancestor'/);
assert.match(loader, /relation === 'descendant'/);
assert.match(loader, /relation === 'material_ancestor'/);
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

console.log('PASS: CultureOps lineage UI uses bounded recursive tenant RPC');
