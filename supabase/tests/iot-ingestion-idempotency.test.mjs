import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20261024110000_fix_iot_duplicate_payload_conflicts.sql", import.meta.url),
  "utf8",
);
const rateLimitMigration = readFileSync(
  new URL("../migrations/20261024150000_limit_iot_ingest_rate.sql", import.meta.url),
  "utf8",
);
const edgeFunction = readFileSync(
  new URL("../functions/iot-ingest/index.ts", import.meta.url),
  "utf8",
);

// Database contract: identical hash is a retry; changed hash is a conflict.
assert.match(migration, /on conflict\s*\(device_id, message_id\) do nothing/i);
assert.match(migration, /select payload_sha256 into existing_payload_sha256/i);
assert.match(migration, /existing_payload_sha256 is distinct from p_payload_sha256/i);
assert.match(migration, /raise exception 'message_id_payload_mismatch'/i);
assert.match(migration, /jsonb_build_object\('status', 'duplicate'/i);

// Privilege contract: RPC remains inaccessible to client roles.
assert.match(migration, /revoke all on function public\.ingest_iot_payload\(uuid, text, text, jsonb\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.ingest_iot_payload\(uuid, text, text, jsonb\) to service_role/i);

// HTTP contract: payload collisions map to 409 and hashes cover the exact raw body.
assert.match(edgeFunction, /message\.includes\("message_id_payload_mismatch"\)[\s\S]{0,180}response\(409,/);
assert.match(edgeFunction, /const payloadHash = await sha256Hex\(raw\)/);

// Resource contract: enforce the byte limit during streaming, not after buffering the whole body.
assert.match(edgeFunction, /const MAX_PAYLOAD_BYTES = 32_000/);
assert.match(edgeFunction, /req\.body\?\.getReader\(\)/);
assert.match(edgeFunction, /totalBytes > MAX_PAYLOAD_BYTES/);
assert.match(edgeFunction, /await reader\.cancel\(\)/);
assert.match(edgeFunction, /new TextDecoder\("utf-8", \{ fatal: true \}\)/);

// Rate-limit contract: 120 requests per 60-second window and server-only RPC.
assert.match(rateLimitMigration, /return v_count <= 120/i);
assert.match(rateLimitMigration, /interval '60 seconds'/i);
assert.match(rateLimitMigration, /revoke all on function public\\.allow_iot_ingest_request\\(uuid\\) from public, anon, authenticated/i);
assert.match(edgeFunction, /"allow_iot_ingest_request"/);
assert.match(edgeFunction, /withinRateLimit !== true[\\s\\S]{0,100}response\\(429,/);

console.log("IoT idempotency, bounded-body, and per-device rate-limit contract checks passed.");
