import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20261110100000_add_culture_generation_comparison_rpc.sql';
const migration = readFileSync(migrationPath, 'utf8');

assert.match(migration, /create function public\.compare_culture_generations\s*\(/i,
  'generation comparison must be exposed through a dedicated database RPC');
assert.match(migration, /p_organization_id uuid/i);
assert.match(migration, /p_culture_ids uuid\[\]/i,
  'comparison must accept an explicit bounded set of culture IDs');
assert.match(migration, /returns jsonb/i,
  'comparison must return a versioned structured document');
assert.match(migration, /auth\.uid\(\) is null/i);
assert.match(migration, /private\.is_org_member\(p_organization_id\)/i,
  'comparison must enforce active tenant membership');
assert.match(migration, /jsonb_build_object\s*\([\s\S]*?'schema_version'/i,
  'response must carry an explicit schema version');
for (const key of ['cultures', 'lineage', 'measurements', 'observations', 'events', 'batches', 'results', 'environmental_observations', 'data_quality']) {
  assert.match(migration, new RegExp(`'${key}'`, 'i'), `response must expose ${key}`);
}
assert.match(migration, /quality_state/i, 'measurement and observation quality states must be preserved');
assert.match(migration, /normalized_value/i, 'normalized and raw measurements must both remain available');
assert.match(migration, /measurements_without_normalized_value/i, 'raw-only measurements must not be mislabelled as missing numeric values');
assert.match(migration, /raw_unit_code/i, 'raw measurement units must remain available');
assert.match(migration, /normalized_unit_code/i, 'normalized measurement units must remain available');
assert.match(migration, /exclusion_reason/i, 'excluded measurements must retain their exclusion reason');
assert.match(migration, /parent_culture_id/i, 'culture parent relationships must be represented');
assert.match(migration, /parent_material_id/i, 'material provenance must be represented');
assert.match(migration, /generation/i, 'material generation metadata must be represented');
assert.match(migration, /observed_at/i, 'qualitative observations must retain their timestamp');
assert.match(migration, /environmental_observations/i, 'weather and satellite observations must remain a distinct evidence family');
assert.match(migration, /experimental_unit_id in \(select id from selected_units\)/i, 'events attached to experimental units must be included');
assert.match(migration, /environmental_truncated/i, 'environmental evidence truncation must be explicit');
assert.match(migration, /measured_at/i, 'quantitative measurements must retain their timestamp');
assert.match(migration, /organization_id\s*=\s*p_organization_id/i,
  'every source read must be organization-scoped');
assert.match(migration, /revoke all on function public\.compare_culture_generations/i);
assert.match(migration, /grant execute on function public\.compare_culture_generations[\s\S]*?to authenticated/i);
assert.match(migration, /set search_path\s*=\s*pg_catalog/i,
  'SECURITY DEFINER function must pin its search_path');
assert.match(migration, /v_requested_count < 2 or v_requested_count > 4/i,
  'requested culture count and data volume must be bounded');

console.log('PASS: generation comparison RPC exposes a bounded tenant-scoped evidence contract');
