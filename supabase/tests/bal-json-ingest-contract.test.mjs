import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fn = readFileSync("supabase/functions/bal-json-ingest/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261111160000_add_bal_json_atomic_ingestion.sql", "utf8");

assert.match(fn, /auth\.getUser\(\)/, "must authenticate the caller");
assert.match(fn, /Authorization: authorization/, "must forward the caller JWT, not use a service role");
assert.doesNotMatch(fn, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/, "must not use a service-role credential");
assert.match(fn, /MAX_BODY_BYTES/, "must bound request size");
assert.match(fn, /validateRecord\(record\)/, "must validate the complete JSON Schema");
assert.match(fn, /variables.*dimension/s, "must resolve controlled variable dimensions");
assert.match(fn, /units.*dimension/s, "must resolve controlled unit dimensions");
assert.match(fn, /\.eq\("organization_id", organizationId\)/, "context and batch lookups must be tenant scoped");
assert.match(fn, /assertTenantReference\("plant_cultures"/, "plant culture references must be tenant scoped");
assert.match(fn, /environment_id: environmentId/, "environment context must be preserved on ingestion");
assert.match(fn, /location_id: locationId/, "location context must be preserved on ingestion");
assert.match(fn, /unsupported_quality_transition/, "must not silently discard review states");
assert.match(fn, /ingest_bal_json_record/, "must use the atomic idempotent RPC");
assert.match(fn, /record_id_reused_with_different_payload/, "must surface idempotency conflicts");

assert.match(migration, /private\.bal_json_ingestion_receipts/, "must keep receipts in the private schema");
assert.match(migration, /primary key \(organization_id, record_id\)/, "idempotency key must be tenant scoped");
assert.match(migration, /payload_sha256/, "must bind record ID to exact payload bytes");
assert.match(migration, /public\.record_manual_measurement/, "must reuse existing atomic measurement RPC");
assert.match(migration, /public\.record_manual_observation/, "must reuse existing atomic observation RPC");
assert.match(migration, /security definer[\s\S]*set search_path = ''/, "security definer must pin an empty search_path");
assert.match(migration, /private\.is_org_member\(v_org_id\)/, "RPC must enforce organization membership");
assert.match(migration, /bal_json_record_id_payload_mismatch/, "must reject replay with changed content");

console.log("✓ BAL-JSON ingestion auth, schema, catalogue, tenant and idempotency contracts");
