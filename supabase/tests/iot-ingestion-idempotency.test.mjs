import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../migrations/20261024110000_fix_iot_duplicate_payload_conflicts.sql", import.meta.url),
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

// HTTP contract: the Edge Function translates a payload collision to 409.
assert.match(edgeFunction, /message\.includes\("message_id_payload_mismatch"\)[\s\S]{0,180}response\(409,/);
assert.match(edgeFunction, /const payloadHash = await sha256Hex\(raw\)/);

console.log("IoT idempotency and HTTP conflict contract checks passed.");
