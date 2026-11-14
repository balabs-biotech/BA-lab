import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.ANON_KEY ?? "";
const dispatchToken = process.env.BA_ENGINE_DISPATCH_TOKEN ?? "";
const databaseUrl = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let userAccessToken;
if (!anonKey) throw new Error("ANON_KEY must be exported by supabase status -o env");
if (dispatchToken.length < 32) throw new Error("BA_ENGINE_DISPATCH_TOKEN must contain at least 32 characters");

function runSql(sql) {
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Local fixture SQL failed: ${(result.stderr || result.stdout || "unknown psql error").slice(0, 600)}`);
  return (result.stdout || "").trim();
}

async function api(path, { method = "GET", key = anonKey, authorization = userAccessToken, body, headers = {} } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* retain raw body for diagnostics */ }
  if (!response.ok) {
    throw new Error(`Supabase API ${method} ${path} failed: ${response.status}/${text.slice(0, 500)}`);
  }
  return parsed;
}

async function invoke(accessToken, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/engine-orchestrator`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "idempotency-key": body.idempotency_key,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* retain raw body for diagnostics */ }
  return { status: response.status, body: parsed };
}

async function dispatchQueue() {
  const response = await fetch(`${supabaseUrl}/functions/v1/engine-queue-dispatch`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "x-ba-dispatch-secret": dispatchToken,
      "content-type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* retain raw body for diagnostics */ }
  return { status: response.status, body: parsed };
}

function assertResponse(label, actual, status, error) {
  if (actual.status !== status || actual.body?.error !== error) {
    throw new Error(`${label}: expected ${status}/${error}, received ${actual.status}/${JSON.stringify(actual.body)}`);
  }
  process.stdout.write(`ok ${label}: ${status}/${error}\\n`);
}

const email = `cultureops-ci-${randomUUID()}@example.test`;
const password = `CI-${randomUUID()}-aA9!`;
let userId;
let locationId;
let qcExecutionId;
let organizationId;

try {
  const signup = await api("/auth/v1/signup", { method: "POST", key: anonKey, authorization: null, body: { email, password, data: { fixture: "cultureops-ci" } } });
  userId = signup?.user?.id ?? signup?.id;
  userAccessToken = signup?.access_token;
  if (typeof userId !== "string") throw new Error("Supabase Auth signup did not return a user id");
  if (typeof userAccessToken !== "string") {
    const session = await api("/auth/v1/token?grant_type=password", { method: "POST", key: anonKey, authorization: null, body: { email, password } });
    userAccessToken = session?.access_token;
  }
  if (typeof userAccessToken !== "string") throw new Error("Supabase Auth did not issue an access token");
  organizationId = runSql("insert into public.organizations (code, name) values ($tag$CI-AUTH-" + randomUUID() + "$tag$, $tag$Temporary authenticated CI tenant$tag$) returning id::text");
  if (typeof organizationId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Could not create valid temporary Auth user and tenant UUIDs");
  runSql("insert into public.organization_members (organization_id, user_id, role) values (\x27" + organizationId + "\x27::uuid, \x27" + userId + "\x27::uuid, \x27owner\x27) on conflict (organization_id, user_id) do nothing");


  process.stdout.write("ok auth fixture: temporary user joined an isolated CI tenant\\n");

  const windowStart = "2026-11-13T00:00:00Z";
  const windowEnd = "2026-11-14T00:00:00Z";

  const location = await api("/rest/v1/locations?select=id", {
    method: "POST",
    body: {
      organization_id: organizationId,
      code: `CI-QC-${randomUUID().slice(0, 8)}`,
      name: "Temporary authenticated QC integration fixture",
      location_type: "test",
      metadata: { purpose: "ephemeral_ci_fixture" },
    },
    headers: { Prefer: "return=representation" },
  });
  locationId = location?.[0]?.id;
  if (typeof locationId !== "string") throw new Error("Could not create temporary QC location");

  // Environmental observations are provider-ingested server data. Seed them with
  // the local database owner; the actual QC request below reads them as the
  // authenticated tenant member through the production SELECT RLS policy.
  const recordIds = runSql(
    "insert into public.environmental_observations " +
    "(organization_id, location_id, data_family, provider_code, dataset_code, variable_code, value, unit_code, observed_at, quality_flag, metadata) values " +
    "('" + organizationId + "'::uuid, '" + locationId + "'::uuid, 'weather', 'BA_LABS_CI', 'AUTHENTICATED_QC_FIXTURE_V1', 'air_temperature', 21, 'degC', '2026-11-13T00:00:00Z', 'fixture', jsonb_build_object('purpose', 'ephemeral_ci_fixture')), " +
    "('" + organizationId + "'::uuid, '" + locationId + "'::uuid, 'weather', 'BA_LABS_CI', 'AUTHENTICATED_QC_FIXTURE_V1', 'air_temperature', 22, 'degC', '2026-11-13T01:00:00Z', 'fixture', jsonb_build_object('purpose', 'ephemeral_ci_fixture')), " +
    "('" + organizationId + "'::uuid, '" + locationId + "'::uuid, 'weather', 'BA_LABS_CI', 'AUTHENTICATED_QC_FIXTURE_V1', 'air_temperature', 23, 'degC', '2026-11-13T02:00:00Z', 'fixture', jsonb_build_object('purpose', 'ephemeral_ci_fixture')) returning id::text",
  ).split("\n").filter(Boolean);
  if (recordIds.length !== 3 || recordIds.some((id) => typeof id !== "string")) {
    throw new Error("Could not create three environmental QC source records");
  }

  const qc = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "environmental.timeseries.qc",
    engine_version: "0.2.0",
    record_ids: recordIds,
    record_type: "environmental_observation",
    parameters: { window_start: windowStart, window_end: windowEnd, minimum_points: 3 },
    scope: { organization_id: organizationId, location_id: locationId },
    idempotency_key: `auth-qc-real-source-${randomUUID()}`,
  });
  if (qc.status !== 202 || qc.body?.status !== "queued" || typeof qc.body?.execution_id !== "string") {
    throw new Error(`authenticated QC enqueue failed: ${qc.status}/${JSON.stringify(qc.body)}`);
  }
  qcExecutionId = qc.body.execution_id;
  const persisted = await api(
    `/rest/v1/engine_executions?id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=id,status,request_payload,input_record_ids`,
  );
  const stored = persisted?.[0];
  if (stored?.status !== "queued" ||
      JSON.stringify(stored.input_record_ids) !== JSON.stringify(recordIds) ||
      stored.request_payload?.input?.records?.length !== 3 ||
      stored.request_payload?.input?.records?.some((record) => !record.context?.location_id || record.data?.data_family !== "weather")) {
    throw new Error("QC execution did not persist the exact RLS-authorized environmental snapshot");
  }
  process.stdout.write("ok authenticated QC: three RLS-visible environmental observations were snapshotted and queued\\n");

  const dispatched = await dispatchQueue();
  if (dispatched.status !== 200 || dispatched.body?.claimed !== 1 ||
      dispatched.body?.completed !== 1 || dispatched.body?.failed !== 0 || dispatched.body?.lost !== 0) {
    const failedRows = await api(
      `/rest/v1/engine_executions?id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=id,status,error_code,error_message`,
    ).catch(() => []);
    throw new Error(`authenticated QC worker dispatch failed: ${dispatched.status}/${JSON.stringify(dispatched.body)}; ledger=${JSON.stringify(failedRows)}`);
  }
  const completedRows = await api(
    `/rest/v1/engine_executions?id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=id,status,result_payload,completed_at`,
  );
  const completed = completedRows?.[0];
  if (completed?.status !== "completed" ||
      completed.result_payload?.status !== "completed" ||
      completed.result_payload?.engine?.engine_id !== "environmental.timeseries.qc" ||
      completed.result_payload?.input_snapshot_sha256 !== stored.request_payload?.input?.snapshot_sha256 ||
      typeof completed.completed_at !== "string") {
    throw new Error("QC worker result was not atomically persisted against the queued execution");
  }
  const resultRows = await api(
    `/rest/v1/engine_execution_results?execution_id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=id,outcome,value,quality_flags,provenance,input_record_ids`,
  );
  const qcResult = resultRows?.[0];
  if (!qcResult || !["success", "review_required", "insufficient_data"].includes(qcResult.outcome) ||
      JSON.stringify(qcResult.input_record_ids) !== JSON.stringify(recordIds) ||
      !qcResult.provenance || typeof qcResult.provenance !== "object") {
    throw new Error("QC worker result row is missing or does not preserve its source record lineage");
  }
  process.stdout.write("ok authenticated QC worker: real HTTP worker completed the execution and persisted the immutable result row\\n");

  const unmemberedOrganizationId = randomUUID();

  const denied = await invoke(userAccessToken, {
    organization_id: unmemberedOrganizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    scope: { organization_id: unmemberedOrganizationId, culture_id: randomUUID() },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: `auth-denied-${randomUUID()}`,
  });
  assertResponse("orchestrator tenant isolation", denied, 403, "organization_access_denied");

  const qcMissingSource = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "environmental.timeseries.qc",
    engine_version: "0.2.0",
    record_ids: [randomUUID()],
    record_type: "environmental_observation",
    parameters: { window_start: windowStart, window_end: windowEnd },
    scope: { organization_id: organizationId, location_id: randomUUID() },
    idempotency_key: `auth-qc-source-${randomUUID()}`,
  });
  assertResponse(
    "authenticated QC source boundary",
    qcMissingSource,
    422,
    "one_or_more_source_records_missing_or_inaccessible",
  );

  const bieMissingCulture = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    scope: { organization_id: organizationId, culture_id: randomUUID() },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: `auth-bie-culture-${randomUUID()}`,
  });
  assertResponse(
    "authenticated BIE biological source boundary",
    bieMissingCulture,
    422,
    "culture_not_found_or_inaccessible",
  );
} finally {
  // Execution ledger rows are intentionally not deletable by authenticated
  // clients. Clean up this isolated fixture through the local DB owner.
  if (qcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + qcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (locationId && organizationId) {
    runSql("delete from public.locations where id = $tag$" + locationId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    runSql("delete from auth.users where id = $tag$" + userId + "$tag$::uuid");
  }
  if (organizationId && /^[0-9a-f-]{36}$/i.test(organizationId)) {
    runSql("delete from public.organizations where id = $tag$" + organizationId + "$tag$::uuid");
  }
}
