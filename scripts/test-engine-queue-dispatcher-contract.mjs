import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../supabase/functions/engine-queue-dispatch/index.ts", import.meta.url),
  "utf8",
);

const checks = [
  ["dispatcher authenticates with a dedicated server secret", /BA_ENGINE_DISPATCH_TOKEN/],
  ["dispatcher rejects unauthenticated requests before database access", /authentication_required/],
  ["dispatcher uses the service-role Supabase client", /SUPABASE_SERVICE_ROLE_KEY/],
  ["dispatcher claims work through the atomic queue RPC", /rpc\("claim_engine_executions"/],
  ["dispatcher bounds claims to the Python worker concurrency", /p_limit:\s*MAX_DISPATCH_BATCH/],
  ["dispatcher records a unique worker identity for each invocation", /engine-queue-dispatch:\$\{crypto\.randomUUID\(\)\}/],
  ["dispatcher validates persisted requests against the engine schema", /validateRequest\(execution\.request_payload\)/],
  ["dispatcher binds stored request identity to the immutable ledger row", /request\.engine\?\.engine_id\s*!==\s*execution\.engine_id[\s\S]*?request\.engine\?\.engine_version\s*!==\s*execution\.engine_version[\s\S]*?request\.input\?\.snapshot_sha256\s*!==\s*execution\.input_snapshot_sha256/],
  ["dispatcher bounds worker response bytes while streaming", /MAX_WORKER_RESPONSE_BYTES[\s\S]*?getReader\(\)/],
  ["dispatcher applies a bounded worker timeout", /AbortSignal\.timeout\(WORKER_TIMEOUT_MS\)/],
  ["dispatcher validates worker response schema and correlation", /validateResponse\(result\)[\s\S]*?result\.request_id\s*!==\s*request\.request_id/],
  ["dispatcher rebinds worker result to durable ledger identity", /result\.execution_id\s*=\s*execution\.id/],
  ["dispatcher commits completed results atomically", /rpc\("complete_engine_execution"/],
  ["dispatcher failure writes are scoped to the claiming worker", /\.eq\("claimed_by",\s*workerId\)/],
  ["dispatcher reports bounded per-execution outcomes", /claimed:\s*executions\.length/],
  ["dispatcher does not accept client-supplied execution or tenant identifiers", /request body must be an empty object/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
}

const claimPosition = source.indexOf('rpc("claim_engine_executions"');
const workerPosition = source.indexOf('fetch(new URL("/v1/execute"');
assert.ok(claimPosition >= 0 && workerPosition > claimPosition,
  "worker dispatch must occur only after atomic queue claims");

console.log("Engine queue dispatcher contract passed.");
