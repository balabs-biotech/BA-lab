import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.ANON_KEY ?? "";
const dispatchToken = process.env.BA_ENGINE_DISPATCH_TOKEN ?? "";
const databaseUrl = process.env.DB_URL?.trim() || "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
let userAccessToken;
if (!anonKey) throw new Error("ANON_KEY must be exported by supabase status -o env");
if (dispatchToken.length < 32) throw new Error("BA_ENGINE_DISPATCH_TOKEN must contain at least 32 characters");

function runSql(sql) {
  const result = spawnSync("psql", ["--dbname", databaseUrl, "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A", "-c", sql], { encoding: "utf8" });
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

function canonicalJson(value) {
  const normalize = (item) => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
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
let environmentId;
let cultureId;
let bieExecutionId;
let qcExecutionId;
let missingResultQcExecutionId;
let mismatchedLineageQcExecutionId;
let mismatchedResultTypeQcExecutionId;
let mismatchedGeneratedAtQcExecutionId;
let mismatchedSnapshotQcExecutionId;
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

  environmentId = runSql(
    "insert into public.environments (organization_id, location_id, name, metadata) values ('" +
    organizationId + "'::uuid, '" + locationId + "'::uuid, 'Temporary BIE integration environment', " +
    "jsonb_build_object('purpose', 'ephemeral_ci_fixture')) returning id::text",
  );
  const materialId = runSql(
    "insert into public.materials (organization_id, material_code, material_type, state, generation, metadata) values ('" +
    organizationId + "'::uuid, 'MAT-CI-" + randomUUID().slice(0, 8) + "', 'strain', 'active', 0, " +
    "jsonb_build_object('purpose', 'ephemeral_ci_fixture')) returning id::text",
  );
  cultureId = runSql(
    "insert into public.cultures (organization_id, code, culture_type, material_id, environment_id, started_at, metadata) values ('" +
    organizationId + "'::uuid, 'CULTURE-CI-" + randomUUID().slice(0, 8) + "', 'agar', '" + materialId +
    "'::uuid, '" + environmentId + "'::uuid, '2026-11-13T00:00:00Z', jsonb_build_object('purpose', 'ephemeral_ci_fixture')) returning id::text",
  );
  runSql(
    "insert into public.biological_contexts (organization_id, domain, culture_id, environment_id, organism_kind, taxon_code, strain_code, culture_stage, substrate_code, production_system, valid_from, context_tags) values ('" +
    organizationId + "'::uuid, 'mycology', '" + cultureId + "'::uuid, '" + environmentId +
    "'::uuid, 'fungus', 'CI:pleurotus_ostreatus', 'CI-P80', 'incubation', 'wheat_straw', 'petri_agar', '2026-11-13', array['ci_fixture'])",
  );
  if (![environmentId, cultureId, materialId].every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))) {
    throw new Error("Could not create temporary biological BIE source fixture");
  }

  const referenceRows = await api("/rest/v1/biological_reference_registry?select=id", {
    method: "POST",
    body: {
      organization_id: organizationId,
      reference_id: `ci.biological.reference.${randomUUID()}`,
      reference_version: "1.0.0",
      title: "Synthetic CI biological reference fixture",
      citation: "Synthetic fixture used only to verify authenticated assertion lineage.",
      source_type: "technical_document",
      evidence_level: "L0",
      content_sha256: "a".repeat(64),
      status: "draft",
    },
    headers: { Prefer: "return=representation" },
  });
  const referenceRegistryId = referenceRows?.[0]?.id;
  if (typeof referenceRegistryId !== "string") throw new Error("Could not create synthetic biological source reference");
  await api(`/rest/v1/biological_reference_registry?id=eq.${referenceRegistryId}`, {
    method: "PATCH",
    body: { status: "validated" },
    headers: { Prefer: "return=minimal" },
  });
  const assertionRows = await api("/rest/v1/biological_reference_assertions?select=id", {
    method: "POST",
    body: {
      organization_id: organizationId,
      assertion_code: "ci.pleurotus.substrate.association",
      assertion_version: "1.0.0",
      subject_type: "taxon",
      subject_ref: "CI:pleurotus_ostreatus",
      predicate_code: "substrate.association",
      object_value: { substrate: "wheat_straw", relation: "reported" },
      reference_registry_id: referenceRegistryId,
      source_locator: "synthetic-fixture",
      evidence_level: "L0",
      applicability: { context_match: { organism_kind: "fungus", culture_stage: "incubation" } },
      uncertainty: { assessment: "not_assessed" },
      status: "draft",
    },
    headers: { Prefer: "return=representation" },
  });
  const referenceAssertionId = assertionRows?.[0]?.id;
  if (typeof referenceAssertionId !== "string") throw new Error("Could not create synthetic biological reference assertion");
  await api(`/rest/v1/biological_reference_assertions?id=eq.${referenceAssertionId}`, {
    method: "PATCH",
    body: { status: "validated" },
    headers: { Prefer: "return=minimal" },
  });
  process.stdout.write("ok biological assertion fixture: source and assertion were validated through authenticated admin actions\\n");

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
    `/rest/v1/engine_executions?id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=id,status,result_payload,request_id,completed_at`,
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
    `/rest/v1/engine_execution_results?execution_id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=id,execution_id,engine_id,engine_version,outcome,value,limitations,quality_flags,provenance,input_record_ids,input_snapshot_sha256,generated_at`,
  );
  const qcResult = resultRows?.[0];
  if (!qcResult || !["success", "review_required", "insufficient_data"].includes(qcResult.outcome) ||
      qcResult.execution_id !== qcExecutionId ||
      qcResult.engine_id !== "environmental.timeseries.qc" ||
      qcResult.engine_version !== "0.2.0" ||
      qcResult.input_snapshot_sha256 !== stored.request_payload?.input?.snapshot_sha256 ||
      JSON.stringify(qcResult.input_record_ids) !== JSON.stringify(recordIds) ||
      !qcResult.provenance || typeof qcResult.provenance !== "object") {
    throw new Error("QC worker result row is missing or does not preserve its source record lineage");
  }
  process.stdout.write("ok authenticated QC worker: real HTTP worker completed the execution and persisted the immutable result row\\n");

  const bie = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: qcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: `auth-bie-with-qc-${randomUUID()}`,
  });
  if (bie.status !== 202 || bie.body?.status !== "queued" || typeof bie.body?.execution_id !== "string") {
    throw new Error(`authenticated BIE with QC artifact enqueue failed: ${bie.status}/${JSON.stringify(bie.body)}`);
  }
  bieExecutionId = bie.body.execution_id;
  const dependencyRows = await api(
    `/rest/v1/engine_execution_dependencies?downstream_execution_id=eq.${bieExecutionId}&upstream_execution_id=eq.${qcExecutionId}&organization_id=eq.${organizationId}&select=downstream_execution_id,upstream_execution_id,upstream_result_id,dependency_role,upstream_input_snapshot_sha256`,
  );
  if (dependencyRows?.length !== 1 ||
      dependencyRows[0].dependency_role !== "environmental_qc" ||
      dependencyRows[0].upstream_execution_id !== qcExecutionId ||
      dependencyRows[0].upstream_result_id !== qcResult.id ||
      dependencyRows[0].upstream_input_snapshot_sha256 !== qcResult.input_snapshot_sha256) {
    throw new Error("BIE enqueue did not persist the exact immutable QC result and snapshot dependency edge");
  }
  process.stdout.write("ok QC to BIE enqueue: verified artifact and immutable dependency edge persisted\\n");

  const bieDispatch = await dispatchQueue();
  if (bieDispatch.status !== 200 || bieDispatch.body?.claimed !== 1 ||
      bieDispatch.body?.completed !== 1 || bieDispatch.body?.failed !== 0 || bieDispatch.body?.lost !== 0) {
    const failedRows = await api(
      `/rest/v1/engine_executions?id=eq.${bieExecutionId}&organization_id=eq.${organizationId}&select=id,status,error_code,error_message`,
    ).catch(() => []);
    throw new Error(`authenticated BIE worker dispatch failed: ${bieDispatch.status}/${JSON.stringify(bieDispatch.body)}; ledger=${JSON.stringify(failedRows)}`);
  }
  const bieRows = await api(
    `/rest/v1/engine_executions?id=eq.${bieExecutionId}&organization_id=eq.${organizationId}&select=id,status,result_payload,completed_at`,
  );
  const bieCompleted = bieRows?.[0];
  const bieResultRows = await api(
    `/rest/v1/engine_execution_results?execution_id=eq.${bieExecutionId}&organization_id=eq.${organizationId}&select=id,value,quality_flags,provenance`,
  );
  const bieResult = bieResultRows?.[0];
  const qcAssessment = bieResult?.value?.environmental_quality_control;
  const expectedQcArtifact = {
    contract: "BA-LABS/UPSTREAM-ENGINE-ARTIFACT",
    contract_version: "1.0.0",
    role: "environmental_qc",
    execution_id: qcExecutionId,
    result_id: qcResult.id,
    request_id: completed.request_id,
    engine_id: qcResult.engine_id,
    engine_version: qcResult.engine_version,
    completed_at: completed.completed_at,
    input_snapshot_sha256: qcResult.input_snapshot_sha256,
    scope: {
      organization_id: organizationId,
      location_id: locationId,
      window_start: windowStart,
      window_end: windowEnd,
    },
    result: {
      outcome: qcResult.outcome,
      value: qcResult.value,
      limitations: qcResult.limitations,
      quality_flags: qcResult.quality_flags,
      provenance: qcResult.provenance,
    },
  };
  const expectedQcArtifactSha256 = createHash("sha256")
    .update(canonicalJson(expectedQcArtifact))
    .digest("hex");
  if (bieCompleted?.status !== "completed" ||
      bieCompleted.result_payload?.status !== "completed" ||
      !bieResult ||
      qcAssessment?.upstream_execution_id !== qcExecutionId ||
      qcAssessment?.upstream_result_id !== qcResult.id ||
      !/^[a-f0-9]{64}$/.test(qcAssessment?.artifact_sha256 ?? "") ||
      qcAssessment?.artifact_sha256 !== expectedQcArtifactSha256 ||
      qcAssessment?.outcome !== qcResult.outcome ||
      canonicalJson(qcAssessment?.quality_flags) !== canonicalJson([...(qcResult.quality_flags ?? [])].sort()) ||
      canonicalJson(qcAssessment?.limitations) !== canonicalJson(qcResult.limitations) ||
      canonicalJson(qcAssessment?.provenance) !== canonicalJson(qcResult.provenance) ||
      canonicalJson(qcAssessment?.value) !== canonicalJson(qcResult.value) ||
      qcAssessment?.state !== (
        qcResult.outcome !== "success" || (qcResult.quality_flags?.length ?? 0) > 0
          ? "review_required"
          : "passed"
      ) ||
      !bieResult.provenance?.source_references?.some((item) => item.includes(`execution=${qcExecutionId}`)) ||
      bieResult.value?.subject?.biological_reference_assertion_state !== "documented" ||
      bieResult.value?.subject?.biological_reference_assertions?.length !== 1 ||
      bieResult.value?.subject?.biological_reference_assertions?.[0]?.applicability_state !== "matched" ||
      !bieResult.provenance?.source_references?.some((item) => item.startsWith("BA_LABS_BIOLOGICAL_REFERENCE_ASSERTION/ci.pleurotus.substrate.association@1.0.0#sha256=")) ||
      !bieResult.provenance?.source_references?.some((item) => item.startsWith("BA_LABS_BIOLOGICAL_REFERENCE_SOURCE/ci.biological.reference."))) {
    throw new Error("BIE did not persist the verified QC artifact and validated biological assertion lineage");
  }
  process.stdout.write("ok live QC to BIE: exact QC result ID, dependency snapshot, canonical SHA-256 artifact and validated biological assertion lineage persisted\\n");

  // The CI-only worker proxy corrupts the second successful BIE response after
  // the Python worker returns. The orchestrator must fail the ledger closed and
  // must not write an immutable result row for the corrupted artifact.
  const tamperedWorkerIdempotencyKey = `auth-bie-worker-artifact-tamper-${randomUUID()}`;
  const bieWithTamperedWorkerArtifact = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: qcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: tamperedWorkerIdempotencyKey,
  });
  if (bieWithTamperedWorkerArtifact.status !== 202 ||
      bieWithTamperedWorkerArtifact.body?.status !== "queued" ||
      typeof bieWithTamperedWorkerArtifact.body?.execution_id !== "string") {
    throw new Error(`tampered-worker BIE fixture enqueue failed: ${bieWithTamperedWorkerArtifact.status}/${JSON.stringify(bieWithTamperedWorkerArtifact.body)}`);
  }
  const tamperedWorkerBieExecutionId = bieWithTamperedWorkerArtifact.body.execution_id;
  const tamperedWorkerDispatch = await dispatchQueue();
  if (tamperedWorkerDispatch.status !== 200) {
    throw new Error(`tampered-worker BIE dispatch failed: ${tamperedWorkerDispatch.status}/${JSON.stringify(tamperedWorkerDispatch.body)}`);
  }
  const tamperedWorkerLedgerRows = await api(
    `/rest/v1/engine_executions?id=eq.${tamperedWorkerBieExecutionId}&organization_id=eq.${organizationId}&select=id,status,error_code,result_payload`,
  );
  const tamperedWorkerResultRows = await api(
    `/rest/v1/engine_execution_results?execution_id=eq.${tamperedWorkerBieExecutionId}&organization_id=eq.${organizationId}&select=id`,
  );
  if (tamperedWorkerLedgerRows?.[0]?.status !== "failed" ||
      tamperedWorkerLedgerRows[0]?.error_code !== "upstream_artifact_lineage_mismatch" ||
      tamperedWorkerResultRows.length !== 0) {
    throw new Error(`orchestrator persisted or accepted tampered BIE QC lineage: ledger=${JSON.stringify(tamperedWorkerLedgerRows)} results=${JSON.stringify(tamperedWorkerResultRows)}`);
  }
  process.stdout.write("ok malicious worker integration: altered QC quality_flags rejected; failed ledger persisted; no BIE result row created\\n");

  const unavailableQcIdempotencyKey = `auth-bie-missing-qc-${randomUUID()}`;
  const bieUnavailableQc = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: randomUUID(),
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: unavailableQcIdempotencyKey,
  });
  assertResponse(
    "BIE rejects unavailable upstream QC execution",
    bieUnavailableQc,
    422,
    "upstream_qc_execution_unavailable_or_incompatible",
  );

  const mismatchedQcIdempotencyKey = `auth-bie-qc-window-mismatch-${randomUUID()}`;
  const bieMismatchedQcWindow = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: qcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: {
      window_start: "2026-11-12T00:00:00Z",
      window_end: "2026-11-13T00:00:00Z",
      timezone: "Africa/Algiers",
    },
    idempotency_key: mismatchedQcIdempotencyKey,
  });
  assertResponse(
    "BIE rejects upstream QC window mismatch",
    bieMismatchedQcWindow,
    422,
    "upstream_qc_scope_or_window_mismatch",
  );

  for (const rejectedKey of [unavailableQcIdempotencyKey, mismatchedQcIdempotencyKey]) {
    const unexpectedRows = await api(
      `/rest/v1/engine_executions?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(rejectedKey)}&select=id`,
    );
    if (unexpectedRows.length !== 0) {
      throw new Error(`Rejected BIE request ${rejectedKey} unexpectedly created an execution ledger row`);
    }
  }
  process.stdout.write("ok rejected QC dependencies leave no BIE execution ledger rows\\n");

  // Synthetic terminal QC ledger row with no result row: this models a broken
  // persistence invariant without mutating or deleting the real immutable QC result.
  missingResultQcExecutionId = runSql(
    "insert into public.engine_executions " +
    "(organization_id, request_id, idempotency_key, engine_id, engine_version, scope, input_record_ids, input_snapshot_sha256, request_payload, status, result_payload, requested_by, completed_at) values (" +
    "'" + organizationId + "'::uuid, '" + randomUUID() + "'::uuid, 'ci-missing-qc-result-" + randomUUID() + "', " +
    "'environmental.timeseries.qc', '0.2.0', " +
    "jsonb_build_object('organization_id', '" + organizationId + "', 'location_id', '" + locationId + "'), " +
    "array[]::uuid[], repeat('a', 64), " +
    "jsonb_build_object('parameters', jsonb_build_object('window_start', '" + windowStart + "', 'window_end', '" + windowEnd + "')), " +
    "'completed', jsonb_build_object('contract', 'BA-LABS/ENGINE-RESULT', 'status', 'completed', 'result', jsonb_build_object('outcome', 'success', 'value', '{}'::jsonb, 'limitations', '[]'::jsonb, 'quality_flags', '[]'::jsonb, 'provenance', '{}'::jsonb)), " +
    "'" + userId + "'::uuid, now()) returning id::text",
  );
  if (!/^[0-9a-f-]{36}$/i.test(missingResultQcExecutionId)) {
    throw new Error("Could not create isolated synthetic QC ledger fixture");
  }
  const missingResultIdempotencyKey = `auth-bie-qc-missing-result-${randomUUID()}`;
  const bieMissingQcResult = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: missingResultQcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: missingResultIdempotencyKey,
  });
  assertResponse(
    "BIE rejects completed QC execution without immutable result row",
    bieMissingQcResult,
    422,
    "upstream_qc_result_integrity_mismatch",
  );
  const missingResultBieRows = await api(
    `/rest/v1/engine_executions?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(missingResultIdempotencyKey)}&select=id`,
  );
  if (missingResultBieRows.length !== 0) {
    throw new Error("BIE created a ledger row despite missing upstream QC result integrity");
  }
  process.stdout.write("ok missing QC result rejection leaves no BIE execution ledger row\\n");

  // A second synthetic QC pair has a valid result row, but its source IDs do
  // not match the immutable execution snapshot. Both rows are isolated fixtures.
  const mismatchedLineageRequestId = randomUUID();
  const mismatchedLineageSourceId = randomUUID();
  mismatchedLineageQcExecutionId = runSql(
    "with qc as (insert into public.engine_executions " +
    "(organization_id, request_id, idempotency_key, engine_id, engine_version, scope, input_record_ids, input_snapshot_sha256, request_payload, status, result_payload, requested_by, completed_at) values (" +
    "'" + organizationId + "'::uuid, '" + mismatchedLineageRequestId + "'::uuid, 'ci-qc-lineage-mismatch-" + randomUUID() + "', " +
    "'environmental.timeseries.qc', '0.2.0', " +
    "jsonb_build_object('organization_id', '" + organizationId + "', 'location_id', '" + locationId + "'), " +
    "array['" + mismatchedLineageSourceId + "'::uuid], repeat('b', 64), " +
    "jsonb_build_object('parameters', jsonb_build_object('window_start', '" + windowStart + "', 'window_end', '" + windowEnd + "')), " +
    "'completed', jsonb_build_object('contract', 'BA-LABS/ENGINE-RESULT', 'status', 'completed', 'result', jsonb_build_object('outcome', 'success', 'value', '{}'::jsonb, 'limitations', '[]'::jsonb, 'quality_flags', '[]'::jsonb, 'provenance', '{}'::jsonb)), " +
    "'" + userId + "'::uuid, now()) returning organization_id, id, engine_id, engine_version, input_snapshot_sha256, completed_at), " +
    "result_row as (insert into public.engine_execution_results " +
    "(organization_id, execution_id, engine_id, engine_version, result_type, outcome, input_record_ids, input_snapshot_sha256, value, limitations, quality_flags, provenance, generated_at) " +
    "select organization_id, id, engine_id, engine_version, engine_id, 'success', array[]::uuid[], input_snapshot_sha256, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, completed_at from qc returning execution_id) " +
    "select execution_id::text from result_row",
  );
  if (!/^[0-9a-f-]{36}$/i.test(mismatchedLineageQcExecutionId)) {
    throw new Error("Could not create isolated synthetic QC lineage mismatch fixture");
  }
  const mismatchedLineageIdempotencyKey = `auth-bie-qc-lineage-mismatch-${randomUUID()}`;
  const bieMismatchedLineage = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: mismatchedLineageQcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: mismatchedLineageIdempotencyKey,
  });
  assertResponse(
    "BIE rejects QC result with mismatched source record lineage",
    bieMismatchedLineage,
    422,
    "upstream_qc_result_integrity_mismatch",
  );
  const mismatchedLineageBieRows = await api(
    `/rest/v1/engine_executions?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(mismatchedLineageIdempotencyKey)}&select=id`,
  );
  if (mismatchedLineageBieRows.length !== 0) {
    throw new Error("BIE created a ledger row despite QC source lineage mismatch");
  }
  process.stdout.write("ok mismatched QC source lineage rejection leaves no BIE execution ledger row\\n");


  // A separate completed QC execution has coherent tenant, version, snapshot,
  // source IDs and timestamp, but its immutable result row declares another type.
  const mismatchedResultTypeRequestId = randomUUID();
  const mismatchedResultTypeSourceId = randomUUID();
  mismatchedResultTypeQcExecutionId = runSql(
    "with qc as (insert into public.engine_executions " +
    "(organization_id, request_id, idempotency_key, engine_id, engine_version, scope, input_record_ids, input_snapshot_sha256, request_payload, status, result_payload, requested_by, completed_at) values (" +
    "'" + organizationId + "'::uuid, '" + mismatchedResultTypeRequestId + "'::uuid, 'ci-qc-result-type-mismatch-" + randomUUID() + "', " +
    "'environmental.timeseries.qc', '0.2.0', " +
    "jsonb_build_object('organization_id', '" + organizationId + "', 'location_id', '" + locationId + "'), " +
    "array['" + mismatchedResultTypeSourceId + "'::uuid], repeat('c', 64), " +
    "jsonb_build_object('parameters', jsonb_build_object('window_start', '" + windowStart + "', 'window_end', '" + windowEnd + "')), " +
    "'completed', jsonb_build_object('contract', 'BA-LABS/ENGINE-RESULT', 'status', 'completed', 'result', jsonb_build_object('outcome', 'success', 'value', '{}'::jsonb, 'limitations', '[]'::jsonb, 'quality_flags', '[]'::jsonb, 'provenance', '{}'::jsonb)), " +
    "'" + userId + "'::uuid, now()) returning organization_id, id, engine_id, engine_version, input_record_ids, input_snapshot_sha256, completed_at), " +
    "result_row as (insert into public.engine_execution_results " +
    "(organization_id, execution_id, engine_id, engine_version, result_type, outcome, input_record_ids, input_snapshot_sha256, value, limitations, quality_flags, provenance, generated_at) " +
    "select organization_id, id, engine_id, engine_version, 'tampered.result.type', 'success', input_record_ids, input_snapshot_sha256, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, completed_at from qc returning execution_id) " +
    "select execution_id::text from result_row",
  );
  if (!/^[0-9a-f-]{36}$/i.test(mismatchedResultTypeQcExecutionId)) {
    throw new Error("Could not create isolated synthetic QC result-type mismatch fixture");
  }
  const mismatchedResultTypeIdempotencyKey = `auth-bie-qc-result-type-mismatch-${randomUUID()}`;
  const bieMismatchedResultType = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: mismatchedResultTypeQcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: mismatchedResultTypeIdempotencyKey,
  });
  assertResponse(
    "BIE rejects QC result with mismatched result type",
    bieMismatchedResultType,
    422,
    "upstream_qc_result_integrity_mismatch",
  );
  const mismatchedResultTypeBieRows = await api(
    `/rest/v1/engine_executions?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(mismatchedResultTypeIdempotencyKey)}&select=id`,
  );
  if (mismatchedResultTypeBieRows.length !== 0) {
    throw new Error("BIE created a ledger row despite QC result-type mismatch");
  }
  process.stdout.write("ok mismatched QC result type rejection leaves no BIE execution ledger row\\n");

  // A completed QC ledger and result row with matching engine, version, source IDs and snapshot,
  // but a generated_at timestamp that differs from the immutable execution completion time.
  mismatchedGeneratedAtQcExecutionId = runSql(
    "with qc as (insert into public.engine_executions " +
    "(organization_id, request_id, idempotency_key, engine_id, engine_version, scope, input_record_ids, input_snapshot_sha256, request_payload, status, result_payload, requested_by, completed_at) values (" +
    "'" + organizationId + "'::uuid, '" + randomUUID() + "'::uuid, 'ci-qc-generated-at-mismatch-" + randomUUID() + "', " +
    "'environmental.timeseries.qc', '0.2.0', " +
    "jsonb_build_object('organization_id', '" + organizationId + "', 'location_id', '" + locationId + "'), " +
    "array['" + randomUUID() + "'::uuid], repeat('d', 64), " +
    "jsonb_build_object('parameters', jsonb_build_object('window_start', '" + windowStart + "', 'window_end', '" + windowEnd + "')), " +
    "'completed', jsonb_build_object('contract', 'BA-LABS/ENGINE-RESULT', 'status', 'completed', 'result', jsonb_build_object('outcome', 'success', 'value', '{}'::jsonb, 'limitations', '[]'::jsonb, 'quality_flags', '[]'::jsonb, 'provenance', '{}'::jsonb)), " +
    "'" + userId + "'::uuid, '2026-11-14T10:00:00Z'::timestamptz) returning organization_id, id, engine_id, engine_version, input_record_ids, input_snapshot_sha256), " +
    "result_row as (insert into public.engine_execution_results " +
    "(organization_id, execution_id, engine_id, engine_version, result_type, outcome, input_record_ids, input_snapshot_sha256, value, limitations, quality_flags, provenance, generated_at) " +
    "select organization_id, id, engine_id, engine_version, engine_id, 'success', input_record_ids, input_snapshot_sha256, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '2026-11-14T10:00:01Z'::timestamptz from qc returning execution_id) " +
    "select execution_id::text from result_row",
  );
  if (!/^[0-9a-f-]{36}$/i.test(mismatchedGeneratedAtQcExecutionId)) {
    throw new Error("Could not create isolated synthetic QC generated_at mismatch fixture");
  }
  const mismatchedGeneratedAtIdempotencyKey = `auth-bie-qc-generated-at-mismatch-${randomUUID()}`;
  const bieMismatchedGeneratedAt = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: mismatchedGeneratedAtQcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: mismatchedGeneratedAtIdempotencyKey,
  });
  assertResponse(
    "BIE rejects QC result with mismatched generated_at timestamp",
    bieMismatchedGeneratedAt,
    422,
    "upstream_qc_result_integrity_mismatch",
  );
  const mismatchedGeneratedAtBieRows = await api(
    `/rest/v1/engine_executions?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(mismatchedGeneratedAtIdempotencyKey)}&select=id`,
  );
  if (mismatchedGeneratedAtBieRows.length !== 0) {
    throw new Error("BIE created a ledger row despite QC generated_at timestamp mismatch");
  }
  process.stdout.write("ok mismatched QC generated_at rejection leaves no BIE execution ledger row\\n");

  // The immutable result row must reference the exact input snapshot recorded by the QC ledger.
  // This fixture keeps engine, version, source IDs and timestamps aligned while changing only the result snapshot.
  mismatchedSnapshotQcExecutionId = runSql(
    "with qc as (insert into public.engine_executions " +
    "(organization_id, request_id, idempotency_key, engine_id, engine_version, scope, input_record_ids, input_snapshot_sha256, request_payload, status, result_payload, requested_by, completed_at) values (" +
    "'" + organizationId + "'::uuid, '" + randomUUID() + "'::uuid, 'ci-qc-snapshot-mismatch-" + randomUUID() + "', " +
    "'environmental.timeseries.qc', '0.2.0', " +
    "jsonb_build_object('organization_id', '" + organizationId + "', 'location_id', '" + locationId + "'), " +
    "array['" + randomUUID() + "'::uuid], repeat('e', 64), " +
    "jsonb_build_object('parameters', jsonb_build_object('window_start', '" + windowStart + "', 'window_end', '" + windowEnd + "')), " +
    "'completed', jsonb_build_object('contract', 'BA-LABS/ENGINE-RESULT', 'status', 'completed', 'result', jsonb_build_object('outcome', 'success', 'value', '{}'::jsonb, 'limitations', '[]'::jsonb, 'quality_flags', '[]'::jsonb, 'provenance', '{}'::jsonb)), " +
    "'" + userId + "'::uuid, '2026-11-14T11:00:00Z'::timestamptz) returning organization_id, id, engine_id, engine_version, input_record_ids, completed_at), " +
    "result_row as (insert into public.engine_execution_results " +
    "(organization_id, execution_id, engine_id, engine_version, result_type, outcome, input_record_ids, input_snapshot_sha256, value, limitations, quality_flags, provenance, generated_at) " +
    "select organization_id, id, engine_id, engine_version, engine_id, 'success', input_record_ids, repeat('f', 64), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, completed_at from qc returning execution_id) " +
    "select execution_id::text from result_row",
  );
  if (!/^[0-9a-f-]{36}$/i.test(mismatchedSnapshotQcExecutionId)) {
    throw new Error("Could not create isolated synthetic QC snapshot mismatch fixture");
  }
  const mismatchedSnapshotIdempotencyKey = `auth-bie-qc-snapshot-mismatch-${randomUUID()}`;
  const bieMismatchedSnapshot = await invoke(userAccessToken, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    upstream_qc_execution_id: mismatchedSnapshotQcExecutionId,
    scope: { organization_id: organizationId, culture_id: cultureId },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: mismatchedSnapshotIdempotencyKey,
  });
  assertResponse(
    "BIE rejects QC result with mismatched input snapshot digest",
    bieMismatchedSnapshot,
    422,
    "upstream_qc_result_integrity_mismatch",
  );
  const mismatchedSnapshotBieRows = await api(
    `/rest/v1/engine_executions?organization_id=eq.${organizationId}&idempotency_key=eq.${encodeURIComponent(mismatchedSnapshotIdempotencyKey)}&select=id`,
  );
  if (mismatchedSnapshotBieRows.length !== 0) {
    throw new Error("BIE created a ledger row despite QC input snapshot digest mismatch");
  }
  process.stdout.write("ok mismatched QC input snapshot rejection leaves no BIE execution ledger row\\n");

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
  if (bieExecutionId && organizationId) {
    runSql("alter table public.engine_execution_dependencies disable trigger engine_execution_dependencies_immutable");
    runSql("delete from public.engine_execution_dependencies where organization_id = $tag$" + organizationId + "$tag$::uuid and downstream_execution_id = $tag$" + bieExecutionId + "$tag$::uuid");
    runSql("alter table public.engine_execution_dependencies enable trigger engine_execution_dependencies_immutable");
    runSql("delete from public.engine_executions where id = $tag$" + bieExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (mismatchedSnapshotQcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + mismatchedSnapshotQcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (mismatchedGeneratedAtQcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + mismatchedGeneratedAtQcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (mismatchedResultTypeQcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + mismatchedResultTypeQcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (mismatchedLineageQcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + mismatchedLineageQcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (missingResultQcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + missingResultQcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (qcExecutionId && organizationId) {
    runSql("delete from public.engine_executions where id = $tag$" + qcExecutionId + "$tag$::uuid and organization_id = $tag$" + organizationId + "$tag$::uuid");
  }
  if (organizationId) {
    runSql("alter table public.biological_reference_assertions disable trigger biological_reference_assertions_no_delete");
    runSql("delete from public.biological_reference_assertions where organization_id = $tag$" + organizationId + "$tag$::uuid and assertion_code like 'ci.%'");
    runSql("alter table public.biological_reference_assertions enable trigger biological_reference_assertions_no_delete");
    runSql("alter table public.biological_reference_registry disable trigger biological_reference_registry_no_delete");
    runSql("delete from public.biological_reference_registry where organization_id = $tag$" + organizationId + "$tag$::uuid and reference_id like 'ci.biological.reference.%'");
    runSql("alter table public.biological_reference_registry enable trigger biological_reference_registry_no_delete");
  }
  if (cultureId && organizationId) {
    runSql("delete from public.biological_contexts where organization_id = $tag$" + organizationId + "$tag$::uuid and culture_id = $tag$" + cultureId + "$tag$::uuid");
    runSql("delete from public.cultures where organization_id = $tag$" + organizationId + "$tag$::uuid and id = $tag$" + cultureId + "$tag$::uuid");
    runSql("delete from public.materials where organization_id = $tag$" + organizationId + "$tag$::uuid and material_code like 'MAT-CI-%'");
  }
  if (environmentId && organizationId) {
    runSql("delete from public.environments where organization_id = $tag$" + organizationId + "$tag$::uuid and id = $tag$" + environmentId + "$tag$::uuid");
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
