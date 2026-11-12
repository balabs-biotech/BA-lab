import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/engine-orchestrator/index.ts", "utf8");
const checks = [
  ["caller identity is verified", /userClient\.auth\.getUser\(\)/],
  ["organization membership is checked", /organization_members/],
  ["viewer roles cannot invoke privileged execution", /!\["owner", "admin", "member"\]\.includes\(String\(membership\.role\)\)/],
  ["source record type is explicitly validated", /recordType !== "measurement" && recordType !== "environmental_observation"/],
  ["environmental observations are read through caller RLS", /userClient[\s\S]*\.from\("environmental_observations"\)/],
  ["environmental observations are bound to the requested location", /\.eq\("location_id", scope\.location_id\)/],
  ["environmental QC accepts weather records only", /\.eq\("data_family", "weather"\)/],
  ["one environmental provider and dataset are kept per execution", /environmental_source_mismatch/],
  ["environmental observation provenance is included in the snapshot", /provider_code[\s\S]*dataset_code[\s\S]*spatial_resolution_m/],
  ["source rows are loaded through caller-scoped client", /userClient[\s\S]*\.from\(["']measurements["']\)/],
  ["snapshot is SHA-256 hashed", /crypto\.subtle\.digest\(["']SHA-256["']/],
  ["idempotency is organization-scoped", /idempotency_key/],
  ["idempotency collisions with changed inputs are rejected", /idempotency_key_reused_with_different_input/],
  ["idempotency binds scope and parameters", /stable\(prior\.scope\)[\s\S]*stable\(prior\.request_payload\?\.parameters/],
  ["idempotency race resolution uses the same invocation comparison", /if \(raced && sameExecutionInput\(raced, engineRequest\)\)/],
  ["engine versions are explicitly allowlisted", /ENGINE_ALLOWLIST/],
  ["worker response is schema validated", /validateResponse/],
  ["successful results use atomic structured persistence", /rpc\("complete_engine_execution"/],
  ["atomic result persistence returns a durable result id", /result_id: resultId/],
  ["request and snapshot correlation is enforced", /input_snapshot_sha256/],
  ["service credential is server-side only", /Deno\.env\.get\("SUPABASE_[A-Z_]*KEY"\)/],
  ["worker call has an abort timeout", /AbortController/],
  ["source queries are tenant-filtered", /\.eq\("organization_id", organizationId\)/],
  ["excluded source measurements cannot enter analysis", /excluded_source_records_not_eligible/],
];
for (const [name, pattern] of checks) {
  assert.ok(pattern instanceof RegExp ? pattern.test(source) : pattern, name);
}
const sourceReadStart = source.indexOf("let sourceRows: Record<string, any>[];");
const sourceReadEnd = source.indexOf("const records = sourceRows.map", sourceReadStart);
assert.ok(sourceReadStart >= 0 && sourceReadEnd > sourceReadStart, "measurement snapshot query boundary exists");
assert.doesNotMatch(source.slice(sourceReadStart, sourceReadEnd), /\.update\(/, "source records are never updated");
console.log("Engine orchestration boundary contract passed");
