import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../supabase/functions/engine-queue-dispatch/index.ts", import.meta.url),
  "utf8",
);

const schedule = readFileSync(
  new URL("../supabase/migrations/20261113170000_schedule_engine_queue_dispatch.sql", import.meta.url),
  "utf8",
);

const checks = [
  ["dispatcher authenticates with a dedicated server secret", /BA_ENGINE_DISPATCH_TOKEN/],
  ["dispatcher rejects unauthenticated requests before database access", /authentication_required/],
  ["dispatcher uses the service-role Supabase client", /SUPABASE_.*ROLE_KEY/],
  ["dispatcher claims work through the atomic queue RPC", /rpc\("claim_engine_executions"/],
  ["dispatcher bounds claims to the Python worker concurrency", /p_limit:\s*MAX_DISPATCH_BATCH/],
  ["dispatcher records a unique worker identity for each invocation", /"engine-queue-dispatch:"\s*\+\s*crypto\.randomUUID\(\)/],
  ["dispatcher validates persisted requests against the engine schema", /validateRequest\(request\)/],
  ["dispatcher binds stored request identity to the immutable ledger row", /request\.engine\?\.engine_id\s*!==\s*execution\.engine_id[\s\S]*?request\.engine\?\.engine_version\s*!==\s*execution\.engine_version[\s\S]*?request\.input\?\.snapshot_sha256\s*!==\s*execution\.input_snapshot_sha256/],
  ["dispatcher bounds worker response bytes while streaming", /MAX_WORKER_RESPONSE_BYTES[\s\S]*?getReader\(\)/],
  ["dispatcher applies a bounded worker timeout", /AbortSignal\.timeout\(WORKER_TIMEOUT_MS\)/],
  ["dispatcher validates worker response schema and correlation", /validateResponse\(result\)[\s\S]*?result\.request_id\s*!==\s*request\.request_id/],
  ["dispatcher rebinds worker result to durable ledger identity", /result\.execution_id\s*=\s*execution\.id/],
  ["dispatcher commits completed results atomically under the active worker lease", /rpc\("complete_claimed_engine_execution"/],
  ["dispatcher compares JSONB scope semantically with canonical key ordering", /stable\(request\.scope\)\s*!==\s*stable\(execution\.scope\)/],
  ["dispatcher recomputes the canonical input snapshot digest before worker dispatch", /sha256\(stable\(request\.input\?\.records\)\)[\s\S]*?execution\.input_snapshot_sha256/],
  ["dispatcher forwards the stored upstream QC artifact to the Python worker without rebuilding it from caller input", /body:\s*JSON\.stringify\(request\)[\s\S]*?upstream_artifacts/],
  ["dispatcher does not discard QC artifact metadata before worker validation", /const request = execution\.request_payload[\s\S]*?validateRequest\(request\)[\s\S]*?JSON\.stringify\(request\)/],
  ["dispatcher persists the worker's QC assessment and provenance in the durable result", /p_result:\s*result[\s\S]*?complete_claimed_engine_execution/],
  ["dispatcher leaves optional QC attachment behavior to the versioned engine contract", /validateRequest\(request\)[\s\S]*?body:\s*JSON\.stringify\(request\)/],
  ["dispatcher verifies immutable source IDs", /request\.input\?\.record_ids[\s\S]*?execution\.input_record_ids/],
  ["dispatcher failure transitions use the lease-owner RPC", /rpc\("fail_claimed_engine_execution"/],
  ["dispatcher reports bounded per-execution outcomes", /claimed:\s*executions\.length/],
  ["dispatcher does not accept client-supplied execution or tenant identifiers", /request body must be an empty object/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
}

const claimPosition = source.indexOf('rpc("claim_engine_executions"');
const dispatchPosition = source.indexOf("processExecution(db, execution, workerId, workerUrl, workerToken)");
assert.ok(claimPosition >= 0 && dispatchPosition > claimPosition,
  "worker dispatch must be invoked only after atomic queue claims");

assert.match(schedule, /ba_labs_engine_dispatch_secret/,
  "scheduled dispatch must read its dedicated secret from Vault");
assert.match(schedule, /extname = 'pg_cron'[\s\S]*?extname = 'pg_net'/,
  "scheduled dispatch must require both pg_cron and pg_net");
assert.match(schedule, /ba-labs-engine-queue-dispatch'[\s\S]*?\* \* \* \* \*/,
  "scheduled dispatch must be installed as an idempotent one-minute job");
assert.match(schedule, /length\(decrypted_secret\) >= 32/,
  "scheduled dispatch must not activate with a weak or missing Vault secret");

console.log("Engine queue dispatcher contract passed.");
