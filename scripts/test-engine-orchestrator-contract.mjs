import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/engine-orchestrator/index.ts", "utf8");
const biologicalLoader = readFileSync("supabase/functions/_shared/biological-context-loader.ts", "utf8");
const biologicalProfile = readFileSync("supabase/functions/_shared/biological-interpretation-profile.ts", "utf8");
const checks = [
  ["BIE profile loader is imported into the authenticated orchestrator", /loadAuthenticatedBiologicalInterpretationProfile/],
  ["profile resolution refuses privileged client creation and requires the caller RLS client", /caller_scoped_supabase_client_required[\s\S]*?userClient\.from/, biologicalProfile],
  ["profile resolution is restricted to approved biological domains", /ALLOWED_DOMAINS = new Set\(\["mycology", "greentech", "lab"\]\)/, biologicalProfile],
  ["profile rules require the exact base schema with one bounded optional identity matcher", /Object\.keys\(rule\)\.some\(\(key\) => !RULE_FIELDS\.has\(key\)\)[\s\S]*?filter\(\(key\) => key !== "identity_match"\)/, biologicalProfile],
  ["profile applicability requires the entire analysis window", /profile\.valid_from <= windowStartDate[\s\S]*?profile\.valid_to >= windowLastIncludedDate/, biologicalProfile],
  ["only validated references are eligible for interpretation", /reference\.status !== "validated"/, biologicalProfile],
  ["reference manifest preserves the stored SHA-256", /content_sha256: row\.content_sha256/, biologicalProfile],
  ["profile manifest hashes the canonical profile and rules", /content_sha256: await sha256\(stable\(/, biologicalProfile],
  ["profile lookup is organization and caller scoped", /userClient\.from\("domain_interpretation_profiles"\)[\s\S]*?\.eq\("organization_id", organizationId\)/, biologicalProfile],
  ["reference lookup is organization scoped and validated only", /userClient\.from\("biological_reference_registry"\)[\s\S]*?\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("status", "validated"\)/, biologicalProfile],
  ["profile evaluation is withheld if biological context changes during the window", /if \(!contextStable\) return \{ state: "context_not_stable"/, biologicalProfile],

  ["BIE rules are disabled unless one biological context covers the full analysis window", /contextStable: snapshot\.parameters\.profile_context_stable === true/],
  ["BIE profile and reference rows are resolved through the caller JWT client", /loadAuthenticatedBiologicalInterpretationProfile\([\s\S]*?userClient/],
  ["BIE dataset manifests are included in the immutable engine request", /datasets: effectiveDatasets/],
  ["idempotency binds the scientific dataset manifest", /stable\(prior\.request_payload\?\.datasets \?\? \[\]\)[\s\S]*?stable\(request\.datasets \?\? \[\]\)/],
  ["caller identity is verified", /userClient\.auth\.getUser\(\)/],
  ["organization membership is checked", /organization_members/],
  ["viewer roles cannot invoke privileged execution", /!\["owner", "admin", "member"\]\.includes\(String\(membership\.role\)\)/],
  ["ordinary source record types are explicitly validated", /const validSourceType = isBiologicalContextEngine \|\|[\s\S]*recordType === "measurement" \|\| recordType === "environmental_observation"/],
  ["BIE is disabled unless an explicit server-side feature flag is true", /isBiologicalContextEngine && Deno\.env\.get\("BA_BIE_ENABLED"\) === "true"/],
  ["BIE ignores caller-supplied source record IDs", /const recordIds = isBiologicalContextEngine \? \[\] : suppliedRecordIds/],
  ["BIE requires exactly one culture or plant subject and bounded-window parameters", /validBiologicalSubject[\s\S]*scope\?\.culture_id[\s\S]*scope\?\.plant_culture_id[\s\S]*parameters\.window_start[\s\S]*parameters\.window_end[\s\S]*parameters\.timezone/],
  ["BIE plant loader is called only with caller-scoped Supabase client", /loadAuthenticatedPlantBiologicalContextSnapshot[\s\S]*userClient[\s\S]*plantCultureId/],
  ["BIE culture loader is called only with caller-scoped Supabase client", /loadAuthenticatedBiologicalContextSnapshot[\s\S]*userClient[\s\S]*cultureId/],
  ["environmental observations are read through caller RLS", /userClient[\s\S]*\.from\("environmental_observations"\)/],
  ["environmental observations are bound to the requested location", /\.eq\("location_id", scope\.location_id\)/],
  ["environmental QC accepts weather records only", /\.eq\("data_family", "weather"\)/],
  ["one environmental provider and dataset are kept per execution", /environmental_source_mismatch/],
  ["environmental observation provenance is included in the snapshot", /provider_code[\s\S]*dataset_code[\s\S]*spatial_resolution_m/],
  ["source rows are loaded through caller-scoped client", /userClient[\s\S]*\.from\(["']measurements["']\)/],
  ["BIE culture and plant loaders have no service-role or privileged-client creation", !/service_role|createClient/.test(biologicalLoader)],
  ["BIE loader enforces row caps before snapshot creation", /MAX_MEASUREMENTS = 1000[\s\S]*MAX_WEATHER_OBSERVATIONS = 3000[\s\S]*analysis_measurement_limit_exceeded[\s\S]*analysis_weather_limit_exceeded/.test(biologicalLoader)],
  ["BIE weather query is gated by one resolved location", /preflight\.window\.status === "resolved" && preflight\.window\.location_id/.test(biologicalLoader)],
  ["snapshot payload hashes the complete source row", /sourceRowById[\s\S]*sha256\(stable\(sourceRow\)/],
  ["worker request size is bounded before dispatch", /workerRequestBody[\s\S]*byteLength > 240_000/],
  ["snapshot is SHA-256 hashed", /crypto\.subtle\.digest\(["']SHA-256["']/],
  ["idempotency is organization-scoped", /idempotency_key/],
  ["idempotency collisions with changed inputs are rejected", /idempotency_key_reused_with_different_input/],
  ["idempotency binds scope and parameters", /stable\(prior\.scope\)[\s\S]*stable\(prior\.request_payload\?\.parameters/],
  ["idempotency race resolution uses the same invocation comparison", /if \(raced && sameExecutionInput\(raced, engineRequest\)\)/],
  ["engine versions are explicitly allowlisted", /ENGINE_ALLOWLIST/],
  ["BIE plant subjects require engine v0.2.0", /scope\?\.plant_culture_id \? engineVersion === "0\.2\.0"/],
  ["BIE v0.2 is server-flag gated", /new Set\(\["0\.1\.0", "0\.2\.0"\]\)/],
  ["environmental QC is pinned to semantic version 0.2.0", /environmental\.timeseries\.qc[\s\S]*?new Set\(\["0\.2\.0"\]\)/],
  ["worker response is schema validated", /validateResponse/],
  ["failed execution writes are scoped to queued state or the exact running worker owner", /async function persistExecutionFailure[\s\S]*?claimedWorkerId[\s\S]*?update\.eq\("claimed_by", claimedWorkerId\)\.eq\("status", "running"\)[\s\S]*?update\.eq\("status", "queued"\)/],
  ["async dispatch mode durably enqueues and returns 202 without calling the worker inline", /BA_ENGINE_ASYNC_DISPATCH[\s\S]*?return reply\(202,[\s\S]*?status: "queued"/],
  ["async mode does not require the worker URL or token in the API enqueue path", /asyncDispatchEnabled[\s\S]*?!asyncDispatchEnabled && \(!workerUrl \|\| !workerToken\)/],
  ["idempotent concurrent requests return 202 while the original execution is queued or running", /asyncDispatchEnabled && \["queued", "running"\]\.includes\(raced\.status\) \? 202 : 200/],
  ["a competing queue worker claim is returned as an accepted execution rather than failed", /if \(startError \|\| !startedExecution\)[\s\S]*?const \{ data: latest \}[\s\S]*?includes\(latest\.status\)[\s\S]*?reply\(latest\.status === "completed" \? 200 : 202/],
  ["queued execution is claimed atomically by the service-side queue RPC before worker dispatch", /serviceClient\.rpc\("claim_engine_executions"[\s\S]*?p_execution_id: execution\.id[\s\S]*?p_organization_id: organizationId[\s\S]*?const startedExecution = Array\.isArray\(claimedExecutions\) \? claimedExecutions\[0\] : null[\s\S]*?if \(startError \|\| !startedExecution\)/],
  ["atomic claim receives a bounded two-minute worker lease", /const EXECUTION_LEASE_SECONDS = 120[\s\S]*?p_lease_seconds: EXECUTION_LEASE_SECONDS/],
  ["failed ledger writes are surfaced instead of silently reported as failed", /execution_state_persistence_failed/],
  ["atomic result commit failures are persisted as terminal ledger failures", /persistExecutionFailure[\s\S]*?result_persistence_failed/],
  ["worker result execution identity is rebound to the durable ledger row", /result\.execution_id = execution\.id/],
  ["successful results use atomic worker-owned structured persistence", /rpc\("complete_claimed_engine_execution"[\s\S]*?p_worker_id: workerId/],
  ["atomic result persistence returns a durable result id", /result_id: resultId/],
  ["request and snapshot correlation is enforced", /input_snapshot_sha256/],
  ["service credential is server-side only", /Deno\.env\.get\("SUPABASE_[A-Z_]*KEY"\)/],
  ["worker call has an abort timeout", /AbortController/],
  ["source queries are tenant-filtered", /\.eq\("organization_id", organizationId\)/],
  ["excluded source measurements cannot enter analysis", /excluded_source_records_not_eligible/],
];
for (const [name, pattern, target = source] of checks) {
  assert.ok(pattern instanceof RegExp ? pattern.test(target) : pattern, name);
}
const sourceReadStart = source.indexOf("let sourceRows: Record<string, any>[];");
const sourceReadEnd = source.indexOf("const records = sourceRows.map", sourceReadStart);
assert.ok(sourceReadStart >= 0 && sourceReadEnd > sourceReadStart, "measurement snapshot query boundary exists");
assert.doesNotMatch(source.slice(sourceReadStart, sourceReadEnd), /\.update\(/, "source records are never updated");
assert.match(
  source,
  /async function readBoundedWorkerResponse\([\s\S]*?response\.body\.getReader\(\)[\s\S]*?MAX_WORKER_RESPONSE_BYTES/,
  "worker response bytes are bounded while streaming, before the body is fully buffered",
);
assert.doesNotMatch(
  source,
  /workerBody = await workerResponse\.text\(\)/,
  "orchestrator must not buffer an unbounded worker response before enforcing its limit",
);
console.log("Engine orchestration boundary contract passed");
