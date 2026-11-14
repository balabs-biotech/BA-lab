// SPDX-License-Identifier: MIT
// Tenant-authorized orchestration boundary for registered Python engines.
import { createClient } from "npm:@supabase/supabase-js@2";
import Ajv2020 from "npm:ajv@8.17.1/dist/2020.js";
import addFormats from "npm:ajv-formats@3.0.1";
import requestSchema from "../../../schemas/engine/v1/request.schema.json" with { type: "json" };
import responseSchema from "../../../schemas/engine/v1/response.schema.json" with { type: "json" };
import {
  loadAuthenticatedBiologicalContextSnapshot,
  loadAuthenticatedPlantBiologicalContextSnapshot,
} from "../_shared/biological-context-loader.ts";
import { loadAuthenticatedBiologicalInterpretationProfile } from "../_shared/biological-interpretation-profile.ts";
import { loadAuthenticatedBiologicalIdentityAssertions } from "../_shared/biological-identity-assertions.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const MAX_BODY_BYTES = 48_000;
const MAX_WORKER_RESPONSE_BYTES = 128_000;
const WORKER_TIMEOUT_MS = 20_000;
const EXECUTION_LEASE_SECONDS = 120;
const ENGINE_ALLOWLIST = new Map([["environmental.timeseries.qc", new Set(["0.2.0"])]]);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}
async function readBoundedWorkerResponse(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WORKER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("worker_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
function object(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function readBody(req: Request): Promise<string | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sameExecutionInput(prior: Record<string, any>, request: Record<string, any>): boolean {
  return prior.engine_id === request.engine.engine_id &&
    prior.engine_version === request.engine.engine_version &&
    prior.input_snapshot_sha256 === request.input.snapshot_sha256 &&
    stable(prior.scope) === stable(request.scope) &&
    stable(prior.request_payload?.parameters ?? {}) === stable(request.parameters ?? {}) &&
    stable(prior.request_payload?.datasets ?? []) === stable(request.datasets ?? []) &&
    stable(prior.request_payload?.upstream_artifacts ?? []) === stable(request.upstream_artifacts ?? []);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { error: "authentication_required" });

  let parsed: unknown;
  try {
    const raw = await readBody(req);
    if (raw === null) return reply(400, { error: "empty_body" });
    parsed = JSON.parse(raw);
  } catch (error) {
    return reply(error instanceof Error && error.message === "payload_too_large" ? 413 : 400,
      { error: error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : "invalid_body" });
  }
  if (!object(parsed)) return reply(422, { error: "invalid_request" });

  const organizationId = parsed.organization_id;
  const engineId = parsed.engine_id;
  const engineVersion = parsed.engine_version;
  const isBiologicalContextEngine = engineId === "biological.context.features";
  const upstreamQcExecutionId = parsed.upstream_qc_execution_id;
  const validUpstreamSelection = upstreamQcExecutionId === undefined ||
    (isBiologicalContextEngine && engineVersion === "0.2.0" &&
      typeof upstreamQcExecutionId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(upstreamQcExecutionId));
  const suppliedRecordIds = parsed.record_ids;
  // BIE source IDs are derived exclusively from RLS-authorized database rows.
  const recordIds = isBiologicalContextEngine ? [] : suppliedRecordIds;
  const recordType = parsed.record_type ?? "measurement";
  const parameters = parsed.parameters ?? {};
  const scope = parsed.scope;
  const idempotencyKey = req.headers.get("idempotency-key") ?? parsed.idempotency_key;
  const validRecordIds = isBiologicalContextEngine
    ? (suppliedRecordIds === undefined || (Array.isArray(suppliedRecordIds) && suppliedRecordIds.length === 0))
    : (Array.isArray(recordIds) && recordIds.length >= 1 && recordIds.length <= 500 &&
      recordIds.every((id) => typeof id === "string") && new Set(recordIds).size === recordIds.length);
  const validSourceType = isBiologicalContextEngine ||
    recordType === "measurement" || recordType === "environmental_observation";
  const validBiologicalSubject = isBiologicalContextEngine &&
    ((typeof scope?.culture_id === "string") !== (typeof scope?.plant_culture_id === "string"));
  const validBiologicalVersion = !isBiologicalContextEngine ||
    (scope?.plant_culture_id ? engineVersion === "0.2.0" : ["0.1.0", "0.2.0"].includes(engineVersion));
  const validBiologicalRequest = !isBiologicalContextEngine ||
    (validBiologicalSubject && validBiologicalVersion &&
      typeof parameters.window_start === "string" &&
      typeof parameters.window_end === "string" &&
      typeof parameters.timezone === "string");
  if (typeof organizationId !== "string" || typeof engineId !== "string" ||
      typeof engineVersion !== "string" || !validRecordIds || !validSourceType ||
      !validBiologicalRequest || !validUpstreamSelection ||
      typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 160 ||
      !object(parameters) || !object(scope ?? {})) {
    return reply(422, { error: "invalid_or_incomplete_request" });
  }
  const allowedVersions = ENGINE_ALLOWLIST.get(engineId) ??
    (isBiologicalContextEngine && Deno.env.get("BA_BIE_ENABLED") === "true"
      ? new Set(["0.1.0", "0.2.0"])
      : undefined);
  if (!allowedVersions?.has(engineVersion)) {
    return reply(422, { error: "engine_version_not_registered" });
  }
  if (scope?.organization_id && scope.organization_id !== organizationId) {
    return reply(422, { error: "scope_organization_mismatch" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const asyncDispatchEnabled = Deno.env.get("BA_ENGINE_ASYNC_DISPATCH") === "true";
  const workerUrl = Deno.env.get("BA_ENGINE_WORKER_URL");
  const workerToken = Deno.env.get("BA_ENGINE_WORKER_TOKEN");
  if (!url || !publishableKey || !serviceKey ||
      (!asyncDispatchEnabled && (!workerUrl || !workerToken))) {
    console.error("[engine-orchestrator] required server configuration is missing");
    return reply(503, { error: "orchestration_not_configured" });
  }

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return reply(401, { error: "invalid_session" });

  const { data: membership, error: membershipError } = await userClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membershipError || !membership) return reply(403, { error: "organization_access_denied" });
  if (!["owner", "admin", "member"].includes(String(membership.role))) {
    return reply(403, { error: "organization_role_not_permitted" });
  }

  // Source rows are read with the caller JWT. BIE derives all IDs from
  // authenticated culture/window queries; ordinary engines retain explicit IDs.
  let orderedRecords: Record<string, any>[];
  let effectiveRecordIds: string[];
  let effectiveScope: Record<string, any>;
  let effectiveParameters: Record<string, any>;
  let effectiveDatasets: Record<string, any>[] = [];
  let snapshotHash: string;

  if (isBiologicalContextEngine) {
    let snapshot;
    try {
      const window = {
        start: parameters.window_start,
        end: parameters.window_end,
        timezone: parameters.timezone,
      };
      snapshot = scope.plant_culture_id
        ? await loadAuthenticatedPlantBiologicalContextSnapshot({
          userClient, organizationId, plantCultureId: scope.plant_culture_id, window,
        })
        : await loadAuthenticatedBiologicalContextSnapshot({
          userClient, organizationId, cultureId: scope.culture_id, window,
        });
    } catch (error) {
      const code = error instanceof Error ? error.message : "biological_source_loading_failed";
      const allowedCodes = new Set([
        "caller_scoped_supabase_client_required", "biological_subject_scope_required",
        "culture_not_found_or_inaccessible", "culture_tenant_scope_mismatch",
        "plant_culture_not_found_or_inaccessible", "plant_culture_tenant_scope_mismatch",
        "plant_biological_context_scope_mismatch", "plant_culture_measurement_scope_mismatch",
        "biological_contexts_unavailable", "biological_analysis_context_limit_exceeded",
        "culture_measurements_unavailable", "plant_culture_measurements_unavailable",
        "biological_analysis_measurement_limit_exceeded", "biological_environments_unavailable",
        "biological_locations_unavailable", "environmental_observations_unavailable",
        "biological_strain_references_unavailable", "biological_organisms_unavailable",
        "biological_analysis_weather_limit_exceeded", "analysis_window_must_be_timezone_aware",
        "analysis_window_end_must_follow_start", "analysis_timezone_invalid",
      ]);
      return reply(422, { error: allowedCodes.has(code) ? code : "biological_source_loading_failed" });
    }
    orderedRecords = snapshot.input.records;
    effectiveRecordIds = snapshot.input.record_ids;
    effectiveScope = snapshot.scope;
    let interpretationProfile;
    try {
      interpretationProfile = await loadAuthenticatedBiologicalInterpretationProfile({
        userClient,
        organizationId,
        domain: snapshot.parameters.profile_domain,
        domainAmbiguous: snapshot.parameters.profile_domain_ambiguous === true,
        contextStable: snapshot.parameters.profile_context_stable === true,
        windowStartDate: snapshot.parameters.analysis_window_start_date,
        windowLastIncludedDate: snapshot.parameters.analysis_window_last_included_date,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "interpretation_profile_resolution_failed";
      const allowedCodes = new Set([
        "interpretation_profile_domain_invalid",
        "interpretation_profile_registry_unavailable",
        "active_interpretation_profile_ambiguous",
        "interpretation_profile_rules_invalid",
        "interpretation_profile_rule_shape_invalid",
        "interpretation_profile_rule_identity_invalid",
        "interpretation_profile_duplicate_rule_id",
        "biological_reference_registry_unavailable",
        "interpretation_reference_not_validated",
        "interpretation_reference_source_url_invalid",
      ]);
      return reply(422, { error: allowedCodes.has(code) ? code : "interpretation_profile_resolution_failed" });
    }
    let identityResolution;
    try {
      identityResolution = await loadAuthenticatedBiologicalIdentityAssertions({
        userClient,
        organizationId,
        biologicalContexts: snapshot.parameters.biological_contexts ?? [],
        windowStartDate: snapshot.parameters.analysis_window_start_date,
        windowLastIncludedDate: snapshot.parameters.analysis_window_last_included_date,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "biological_identity_resolution_failed";
      const allowedCodes = new Set([
        "biological_identity_context_invalid",
        "biological_identity_assertion_registry_unavailable",
        "biological_identity_assertion_limit_exceeded",
        "biological_reference_registry_unavailable",
        "biological_identity_reference_ambiguous",
        "biological_identity_assertion_identity_ambiguous",
        "biological_identity_source_provenance_integrity_failure",
      ]);
      return reply(422, { error: allowedCodes.has(code) ? code : "biological_identity_resolution_failed" });
    }
    effectiveParameters = {
      ...snapshot.parameters,
      interpretation_rules: interpretationProfile.rules,
      interpretation_profile_state: interpretationProfile.state,
      interpretation_profile: interpretationProfile.profile,
      biological_identity_state: identityResolution.state,
      biological_identity_assertions: identityResolution.assertions,
    };
    effectiveDatasets = [...interpretationProfile.datasets, ...identityResolution.datasets];
    snapshotHash = snapshot.input.snapshot_sha256;
  } else {
    let sourceRows: Record<string, any>[];
    if (recordType === "measurement") {
      const { data, error: sourceError } = await userClient
        .from("measurements")
        .select("id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,culture_id,sample_id,experimental_unit_id,event_id,result_id,metadata")
        .eq("organization_id", organizationId)
        .in("id", recordIds);
      if (sourceError) return reply(422, { error: "source_records_unavailable" });
      if (!data || data.length !== recordIds.length) {
        return reply(422, { error: "one_or_more_source_records_missing_or_inaccessible" });
      }
      if (data.some((row) => row.quality_state === "excluded")) {
        return reply(422, { error: "excluded_source_records_not_eligible" });
      }
      if (scope?.culture_id && data.some((row) => row.culture_id !== scope.culture_id)) {
        return reply(422, { error: "source_scope_mismatch" });
      }
      sourceRows = data;
    } else {
      if (typeof scope?.location_id !== "string") {
        return reply(422, { error: "environmental_location_scope_required" });
      }
      const { data, error: sourceError } = await userClient
        .from("environmental_observations")
        .select("id,location_id,data_family,provider_code,dataset_code,variable_code,value,unit_code,observed_at,retrieved_at,spatial_resolution_m,quality_flag,source_url,metadata")
        .eq("organization_id", organizationId)
        .eq("location_id", scope.location_id)
        .eq("data_family", "weather")
        .in("id", recordIds);
      if (sourceError) return reply(422, { error: "source_records_unavailable" });
      if (!data || data.length !== recordIds.length) {
        return reply(422, { error: "one_or_more_source_records_missing_or_inaccessible" });
      }
      const sourceIdentities = new Set(data.map((row) => row.provider_code + "/" + row.dataset_code));
      if (sourceIdentities.size !== 1) {
        return reply(422, { error: "environmental_source_mismatch" });
      }
      sourceRows = data;
    }

    const records = sourceRows.map((row) => recordType === "measurement" ? ({
      record_id: row.id,
      record_type: "measurement",
      payload_sha256: "",
      data: {
        variable_code: row.variable_code,
        raw_value: row.raw_value,
        raw_unit_code: row.raw_unit_code,
        normalized_value: row.normalized_value,
        normalized_unit_code: row.normalized_unit_code,
        measured_at: row.measured_at,
        method: row.method,
        instrument: row.instrument,
        quality_state: row.quality_state,
        exclusion_reason: row.exclusion_reason,
        metadata: row.metadata ?? {},
      },
      context: {
        culture_id: row.culture_id,
        sample_id: row.sample_id,
        experimental_unit_id: row.experimental_unit_id,
        event_id: row.event_id,
        result_id: row.result_id,
      },
    }) : ({
      record_id: row.id,
      record_type: "environmental_observation",
      payload_sha256: "",
      data: {
        variable_code: row.variable_code,
        value: row.value,
        unit_code: row.unit_code,
        observed_at: row.observed_at,
        data_family: row.data_family,
        provider_code: row.provider_code,
        dataset_code: row.dataset_code,
        retrieved_at: row.retrieved_at,
        spatial_resolution_m: row.spatial_resolution_m,
        quality_flag: row.quality_flag,
      },
      context: { location_id: row.location_id },
    }));
    const sourceRowById = new Map(sourceRows.map((row) => [row.id, row]));
    for (const record of records) {
      const sourceRow = sourceRowById.get(record.record_id);
      record.payload_sha256 = await sha256(stable(sourceRow) + stable(record.context ?? {}));
    }
    const recordMap = new Map(records.map((record) => [record.record_id, record]));
    orderedRecords = recordIds.map((id) => recordMap.get(id)!);
    effectiveRecordIds = recordIds;
    effectiveScope = { ...scope, organization_id: organizationId };
    effectiveParameters = parameters;
    snapshotHash = await sha256(stable(orderedRecords));
  }
  let upstreamArtifacts: Record<string, any>[] = [];
  if (upstreamQcExecutionId !== undefined) {
    const { data: upstream, error: upstreamError } = await serviceClient
      .from("engine_executions")
      .select("id,organization_id,request_id,engine_id,engine_version,scope,input_snapshot_sha256,status,completed_at,request_payload")
      .eq("organization_id", organizationId)
      .eq("id", upstreamQcExecutionId)
      .maybeSingle();
    if (upstreamError || !upstream || upstream.status !== "completed" ||
        upstream.engine_id !== "environmental.timeseries.qc" || upstream.engine_version !== "0.2.0") {
      return reply(422, { error: "upstream_qc_execution_unavailable_or_incompatible" });
    }
    const qcParameters = upstream.request_payload?.parameters ?? {};
    const windowStart = effectiveParameters.window_start;
    const windowEnd = effectiveParameters.window_end;
    if (typeof effectiveScope.location_id !== "string" ||
        upstream.scope?.location_id !== effectiveScope.location_id ||
        qcParameters.window_start !== windowStart || qcParameters.window_end !== windowEnd) {
      return reply(422, { error: "upstream_qc_scope_or_window_mismatch" });
    }
    const { data: qcResult, error: qcResultError } = await serviceClient
      .from("engine_execution_results")
      .select("id,execution_id,engine_id,engine_version,outcome,input_snapshot_sha256,value,limitations,quality_flags,provenance,generated_at")
      .eq("organization_id", organizationId)
      .eq("execution_id", upstream.id)
      .maybeSingle();
    if (qcResultError || !qcResult ||
        qcResult.execution_id !== upstream.id ||
        qcResult.engine_id !== upstream.engine_id ||
        qcResult.engine_version !== upstream.engine_version ||
        qcResult.input_snapshot_sha256 !== upstream.input_snapshot_sha256) {
      return reply(422, { error: "upstream_qc_result_integrity_mismatch" });
    }
    const artifact: Record<string, any> = {
      contract: "BA-LABS/UPSTREAM-ENGINE-ARTIFACT",
      contract_version: "1.0.0",
      role: "environmental_qc",
      execution_id: upstream.id,
      result_id: qcResult.id,
      request_id: upstream.request_id,
      engine_id: upstream.engine_id,
      engine_version: upstream.engine_version,
      completed_at: upstream.completed_at,
      input_snapshot_sha256: upstream.input_snapshot_sha256,
      scope: {
        organization_id: organizationId,
        location_id: effectiveScope.location_id,
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
    artifact.artifact_sha256 = await sha256(stable(artifact));
    if (new TextEncoder().encode(JSON.stringify(artifact)).byteLength > 64_000) {
      return reply(413, { error: "upstream_qc_artifact_too_large" });
    }
    upstreamArtifacts = [artifact];
  }

  const requestId = crypto.randomUUID();
  const engineRequest = {
    contract: "BA-LABS/ENGINE",
    contract_version: "1.0.0",
    request_id: requestId,
    created_at: new Date().toISOString(),
    engine: { engine_id: engineId, engine_version: engineVersion },
    scope: effectiveScope,
    input: { record_ids: effectiveRecordIds, snapshot_sha256: snapshotHash, records: orderedRecords },
    parameters: effectiveParameters,
    datasets: effectiveDatasets,
    ...(upstreamArtifacts.length ? { upstream_artifacts: upstreamArtifacts } : {}),
  };
  if (!validateRequest(engineRequest)) {
    console.error("[engine-orchestrator] internally generated request failed schema validation");
    return reply(500, { error: "engine_request_contract_invalid" });
  }
  const workerRequestBody = JSON.stringify(engineRequest);
  if (new TextEncoder().encode(workerRequestBody).byteLength > 240_000) {
    return reply(413, { error: "engine_request_too_large", hint: "Reduce the selected date range or record count." });
  }

  const { data: prior, error: priorError } = await serviceClient
    .from("engine_executions")
    .select("id,request_id,engine_id,engine_version,scope,input_snapshot_sha256,request_payload,status,result_payload,error_code")
    .eq("organization_id", organizationId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (priorError) return reply(500, { error: "execution_ledger_unavailable" });
  if (prior) {
    if (!sameExecutionInput(prior, engineRequest)) {
      return reply(409, { error: "idempotency_key_reused_with_different_input" });
    }
    const asyncMode = Deno.env.get("BA_ENGINE_ASYNC_DISPATCH") === "true";
    const responseStatus = asyncMode && ["queued", "running"].includes(prior.status) ? 202 : 200;
    return reply(responseStatus, { execution_id: prior.id, request_id: prior.request_id, status: prior.status,
      result: prior.result_payload, error_code: prior.error_code, reused: true });
  }

  let execution: { id: string } | null = null;
  let insertError: any = null;
  if (upstreamArtifacts.length === 1) {
    const { data, error } = await serviceClient.rpc("enqueue_bie_with_environmental_qc", {
      p_organization_id: organizationId,
      p_request_id: requestId,
      p_idempotency_key: idempotencyKey,
      p_scope: engineRequest.scope,
      p_input_record_ids: effectiveRecordIds,
      p_input_snapshot_sha256: snapshotHash,
      p_request_payload: engineRequest,
      p_requested_by: auth.user.id,
      p_upstream_execution_id: upstreamQcExecutionId,
    });
    const row = Array.isArray(data) ? data[0] : null;
    execution = row?.execution_id ? { id: row.execution_id } : null;
    insertError = error;
  } else {
    const { data, error } = await serviceClient
      .from("engine_executions")
      .insert({
        organization_id: organizationId,
        request_id: requestId,
        idempotency_key: idempotencyKey,
        engine_id: engineId,
        engine_version: engineVersion,
        scope: engineRequest.scope,
        input_record_ids: effectiveRecordIds,
        input_snapshot_sha256: snapshotHash,
        request_payload: engineRequest,
        status: "queued",
        requested_by: auth.user.id,
      })
      .select("id")
      .single();
    execution = data;
    insertError = error;
  }
  if (insertError || !execution) {
    // Resolve the unique-key race without creating a second execution.
    const { data: raced } = await serviceClient.from("engine_executions")
      .select("id,request_id,engine_id,engine_version,scope,input_snapshot_sha256,request_payload,status,result_payload,error_code")
      .eq("organization_id", organizationId).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (raced && sameExecutionInput(raced, engineRequest)) {
      return reply(asyncDispatchEnabled && ["queued", "running"].includes(raced.status) ? 202 : 200, {
        execution_id: raced.id, request_id: raced.request_id, status: raced.status,
        result: raced.result_payload, error_code: raced.error_code, reused: true,
      });
    }
    return reply(409, { error: "execution_creation_conflict" });
  }

  if (asyncDispatchEnabled) {
    return reply(202, {
      execution_id: execution.id,
      request_id: requestId,
      status: "queued",
      queued: true,
    });
  }

  // Failure writes are scoped to the state/worker that this invocation owns.
  async function persistExecutionFailure(
    code: string,
    message: string,
    at = new Date().toISOString(),
    claimedWorkerId?: string,
  ) {
    let update = serviceClient.from("engine_executions").update({
      status: "failed",
      error_code: code,
      error_message: message,
      completed_at: at,
      updated_at: at,
    }).eq("organization_id", organizationId).eq("id", execution.id);
    update = claimedWorkerId
      ? update.eq("claimed_by", claimedWorkerId).eq("status", "running")
      : update.eq("status", "queued");
    const { data, error } = await update.select("id").maybeSingle();
    return !error && !!data;
  }

  const workerId = "edge-engine-orchestrator:" + crypto.randomUUID();
  const { data: claimedExecutions, error: startError } = await serviceClient.rpc("claim_engine_executions", {
    p_worker_id: workerId,
    p_limit: 1,
    p_lease_seconds: EXECUTION_LEASE_SECONDS,
    p_execution_id: execution.id,
    p_organization_id: organizationId,
  });
  const startedExecution = Array.isArray(claimedExecutions) ? claimedExecutions[0] : null;
  if (startError || !startedExecution) {
    const persisted = startError ? await persistExecutionFailure(
      "execution_start_failed",
      "Execution could not enter the running state.",
    ) : false;
    const { data: latest } = await serviceClient.from("engine_executions")
      .select("id,request_id,status,result_payload,error_code")
      .eq("organization_id", organizationId)
      .eq("id", execution.id)
      .maybeSingle();
    if (!persisted && latest && ["queued", "running", "completed"].includes(latest.status)) {
      return reply(latest.status === "completed" ? 200 : 202, {
        execution_id: latest.id,
        request_id: latest.request_id,
        status: latest.status,
        result: latest.result_payload,
        error_code: latest.error_code,
        reused: true,
      });
    }
    if (!persisted && latest?.status === "failed") {
      return reply(200, {
        execution_id: latest.id,
        request_id: latest.request_id,
        status: "failed",
        error_code: latest.error_code,
        reused: true,
      });
    }
    return reply(500, {
      error: persisted ? "execution_start_failed" : "execution_state_persistence_failed",
      execution_id: execution.id,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  let workerResponse: Response;
  let workerBody: string;
  try {
    workerResponse = await fetch(new URL("/v1/execute", workerUrl), {
      method: "POST",
      headers: { "Authorization": `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: workerRequestBody,
      signal: controller.signal,
    });
    workerBody = await readBoundedWorkerResponse(workerResponse);
  } catch (error) {
    const code = controller.signal.aborted ? "worker_timeout" :
      error instanceof Error && error.message === "worker_response_too_large" ? "worker_response_too_large" : "worker_unreachable";
    const persisted = await persistExecutionFailure(
      code,
      "The registered engine worker did not return a usable response.",
      new Date().toISOString(),
      workerId,
    );
    return reply(persisted ? 502 : 500, {
      error: persisted ? code : "execution_state_persistence_failed",
      execution_id: execution.id,
    });
  } finally { clearTimeout(timeout); }

  let result: unknown;
  try { result = JSON.parse(workerBody); } catch {
    result = null;
  }
  if (!workerResponse.ok || !validateResponse(result) || !object(result) ||
      result.request_id !== requestId || result.engine.engine_id !== engineId ||
      result.engine.engine_version !== engineVersion || result.input_snapshot_sha256 !== snapshotHash) {
    const code = !workerResponse.ok ? "worker_http_error" : "worker_response_invalid_or_unbound";
    const persisted = await persistExecutionFailure(
      code,
      "Worker response failed transport or correlation validation.",
      new Date().toISOString(),
      workerId,
    );
    return reply(persisted ? 502 : 500, {
      error: persisted ? code : "execution_state_persistence_failed",
      execution_id: execution.id,
    });
  }

  // The durable ledger ID is authoritative; do not persist the worker-local UUID
  // as though it were the database execution identity.
  result.execution_id = execution.id;
  const completedAt = new Date().toISOString();
  if (result.status === "completed") {
    const { data: resultId, error: saveError } = await serviceClient.rpc("complete_claimed_engine_execution", {
      p_organization_id: organizationId,
      p_execution_id: execution.id,
      p_result: result,
      p_completed_at: completedAt,
      p_worker_id: workerId,
    });
    if (saveError || !resultId) {
      console.error("[engine-orchestrator] atomic result persistence failed");
      const persisted = await persistExecutionFailure(
        "result_persistence_failed",
        "The worker result could not be committed atomically to the execution ledger.",
        completedAt,
        workerId,
      );
      return reply(500, {
        error: persisted ? "result_persistence_failed" : "execution_state_persistence_failed",
        execution_id: execution.id,
      });
    }
    return reply(200, {
      execution_id: execution.id,
      result_id: resultId,
      request_id: requestId,
      status: "completed",
      result,
    });
  }

  const persisted = await persistExecutionFailure(result.error.code, result.error.message, completedAt, workerId);
  if (!persisted) {
    return reply(500, { error: "execution_state_persistence_failed", execution_id: execution.id });
  }
  return reply(422, { execution_id: execution.id, request_id: requestId, status: "failed", error: result.error });
});
