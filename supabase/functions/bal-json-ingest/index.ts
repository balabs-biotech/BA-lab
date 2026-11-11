// SPDX-License-Identifier: MIT
// Authenticated BAL-JSON v1 ingestion. Validation and tenant authorization are
// performed before the atomic, idempotent PostgreSQL write RPC.
import { createClient } from "npm:@supabase/supabase-js@2";
import Ajv2020 from "npm:ajv@8.17.1/dist/2020.js";
import addFormats from "npm:ajv-formats@3.0.1";
import recordSchema from "../../../schemas/bal-json/v1/record.schema.json" with { type: "json" };
import measurementSchema from "../../../schemas/bal-json/v1/measurement.schema.json" with { type: "json" };
import observationSchema from "../../../schemas/bal-json/v1/observation.schema.json" with { type: "json" };

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const MAX_BODY_BYTES = 64_000;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(measurementSchema);
ajv.addSchema(observationSchema);
const validateRecord = ajv.compile(recordSchema);

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function readBoundedBody(req: Request): Promise<string | null> {
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
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return response(401, { error: "authentication_required" });

  let raw: string;
  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return response(413, { error: "payload_too_large" });
    const body = await readBoundedBody(req);
    if (body === null) return response(400, { error: "empty_body" });
    raw = body;
  } catch (error) {
    return response(error instanceof Error && error.message === "payload_too_large" ? 413 : 400,
      { error: error instanceof Error && error.message === "payload_too_large" ? "payload_too_large" : "invalid_body" });
  }

  let record: unknown;
  try { record = JSON.parse(raw); } catch { return response(400, { error: "invalid_json" }); }
  if (!validateRecord(record)) {
    return response(422, {
      error: "schema_validation_failed",
      details: (validateRecord.errors ?? []).slice(0, 12).map((e) => ({
        path: e.instancePath, keyword: e.keyword, message: e.message,
      })),
    });
  }
  if (!isObject(record)) return response(422, { error: "invalid_record" });

  const data = record.data;
  if (data.quality_state !== undefined && data.quality_state !== "raw") {
    return response(422, { error: "unsupported_quality_transition", message: "v1 ingestion currently accepts raw records only; review states must be applied through a controlled review workflow" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    console.error("[bal-json-ingest] Supabase configuration missing");
    return response(500, { error: "server_configuration_error" });
  }
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return response(401, { error: "invalid_session" });

    const organizationId = record.organization_id;
    const context = data.context;
    let cultureId = context.culture_id ?? null;
    const plantCultureId = context.plant_culture_id ?? null;
    const environmentId = context.environment_id ?? null;
    const locationId = context.location_id ?? null;
    const batchId = context.batch_id ?? null;

    if (batchId) {
      const { data: batch, error } = await supabase
        .from("batches")
        .select("id, culture_id, material_id")
        .eq("organization_id", organizationId)
        .eq("id", batchId)
        .maybeSingle();
      if (error || !batch) return response(422, { error: "batch_not_found_or_access_denied" });
      if (cultureId && cultureId !== batch.culture_id) return response(422, { error: "batch_culture_mismatch" });
      cultureId = cultureId ?? batch.culture_id ?? null;
      if (!cultureId && !batch.material_id) return response(422, { error: "batch_has_no_supported_traceability_anchor" });
    }

    if (!cultureId && !plantCultureId && !batchId) {
      return response(422, { error: "biological_context_required" });
    }

    if (record.record_type === "measurement") {
      const { data: variable, error: variableError } = await supabase
        .from("variables").select("code, dimension").eq("code", data.variable_code).maybeSingle();
      if (variableError || !variable) return response(422, { error: "unknown_variable_code" });

      const unitCodes = [data.raw_unit_code, data.normalized_unit_code].filter(Boolean);
      const { data: units, error: unitsError } = await supabase
        .from("units").select("code, dimension").in("code", unitCodes);
      if (unitsError) return response(422, { error: "unit_catalogue_unavailable" });
      const unitMap = new Map((units ?? []).map((unit) => [unit.code, unit]));
      for (const code of unitCodes) {
        const unit = unitMap.get(code);
        if (!unit || unit.dimension !== variable.dimension) {
          return response(422, { error: "unit_dimension_mismatch", variable_code: data.variable_code, unit_code: code });
        }
      }
    } else {
      const { data: variable, error } = await supabase
        .from("variables").select("code").eq("code", data.variable_code).maybeSingle();
      if (error || !variable) return response(422, { error: "unknown_variable_code" });
    }

    const recordData: Record<string, unknown> = {
      variable_code: data.variable_code,
      culture_id: cultureId,
      plant_culture_id: plantCultureId,
      environment_id: environmentId,
      metadata: {
        ...(isObject(data.metadata) ? data.metadata : {}),
        bal_json: {
          record_id: record.record_id,
          contract_version: record.contract_version,
          quality_state: data.quality_state ?? "raw",
          provenance: record.provenance,
          extensions: record.extensions ?? {},
        },
      },
    };

    let eventType: string;
    if (record.record_type === "measurement") {
      eventType = "measurement_recorded";
      Object.assign(recordData, {
        raw_value: data.raw_value,
        raw_unit_code: data.raw_unit_code,
        normalized_value: data.normalized_value,
        normalized_unit_code: data.normalized_unit_code,
        measured_at: data.measured_at,
        method: data.method,
        instrument: data.instrument,
      });
    } else {
      eventType = "observation_recorded";
      Object.assign(recordData, {
        value_text: data.value_text,
        observed_at: data.observed_at,
      });
    }

    const event = {
      organization_id: organizationId,
      event_type: eventType,
      occurred_at: record.created_at,
      culture_id: cultureId,
      plant_culture_id: plantCultureId,
      environment_id: environmentId,
      location_id: locationId,
      batch_id: batchId,
      payload: {
        bal_json_record_id: record.record_id,
        bal_json_contract_version: record.contract_version,
        provenance: record.provenance,
        extensions: record.extensions ?? {},
      },
    };

    const result = await supabase.rpc("ingest_bal_json_record", {
      p_record_id: record.record_id,
      p_payload_sha256: await sha256Hex(raw),
      p_record_type: record.record_type,
      p_event: event,
      p_data: recordData,
    });
    if (result.error) {
      const message = result.error.message ?? "";
      if (message.includes("bal_json_record_id_payload_mismatch")) return response(409, { error: "record_id_reused_with_different_payload" });
      if (message.includes("Organization access denied")) return response(403, { error: "organization_access_denied" });
      if (message.includes("22023")) return response(422, { error: "record_rejected_by_domain_constraints" });
      console.error("[bal-json-ingest] Atomic ingestion failed", message);
      return response(500, { error: "ingestion_failed" });
    }
    return response(200, result.data ?? { status: "processed" });
  } catch (error) {
    console.error("[bal-json-ingest] Unexpected failure", error instanceof Error ? error.message : "unknown");
    return response(500, { error: "internal_error" });
  }
});
