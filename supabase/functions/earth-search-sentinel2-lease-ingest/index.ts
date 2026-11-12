// SPDX-License-Identifier: MIT
// Server-to-server Sentinel-2 persistence boundary for leased queue workers.
// Authorization is the active database lease plus an HMAC over the exact body;
// user JWTs are neither stored in jobs nor replayed by background workers.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ba-worker-signature, x-ba-worker-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Access-Control-Request-Headers",
};
const MAX_BODY_BYTES = 256 * 1024;
const MAX_ROWS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_HOSTS = new Set(["earth-search.aws.element84.com"]);
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function readRawBody(req: Request): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("body_too_large");
  if (!req.body) throw new Error("empty_body");
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
        throw new Error("body_too_large");
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
  return bytes;
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function verifySignature(body: Uint8Array, signature: string | null, timestamp: string | null, secret: string) {
  if (!signature || !timestamp || !/^\d{10}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300) return false;
  const supplied = hexToBytes(signature);
  if (!supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = new TextEncoder().encode(timestamp + ".");
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ supplied[i];
  return mismatch === 0;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function validateRows(rows: unknown, organizationId: string, locationId: string): string | null {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > MAX_ROWS || rows.length % 2 !== 0) {
    return "rows_must_contain_2_to_200_entries_in_scene_pairs";
  }
  const pairs = new Map<string, Set<string>>();
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return "invalid_observation_row";
    const row = candidate as Record<string, unknown>;
    if (row.organization_id !== organizationId || row.location_id !== locationId) return "tenant_scope_mismatch";
    if (row.data_family !== "satellite" || row.provider_code !== "EARTH_SEARCH" ||
        row.dataset_code !== "SENTINEL_2_L2A") return "source_identity_mismatch";
    if (!["ndvi_mean", "ndvi_median"].includes(String(row.variable_code))) return "unsupported_variable";
    if (typeof row.value !== "number" || !Number.isFinite(row.value) || row.value < -1 || row.value > 1) return "invalid_ndvi_value";
    if (row.unit_code !== "1" || row.quality_flag !== "valid" ||
        !validTimestamp(row.observed_at) || !validTimestamp(row.retrieved_at) ||
        Date.parse(row.retrieved_at) < Date.parse(row.observed_at)) return "invalid_observation_timestamp_or_unit";
    const sceneId = row.source_record_id;
    if (typeof sceneId !== "string" || sceneId.trim().length < 3 || sceneId.length > 200) return "source_record_id_required";
    if (typeof row.source_url !== "string") return "invalid_stac_source_url";
    try {
      const url = new URL(row.source_url);
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
          !url.pathname.startsWith("/v1/collections/sentinel-2-l2a/items/") ||
          decodeURIComponent(url.pathname.split("/").pop() ?? "") !== sceneId) return "invalid_stac_source_url";
    } catch {
      return "invalid_stac_source_url";
    }
    if (!row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) return "metadata_required";
    const metadata = row.metadata as Record<string, unknown>;
    if (metadata.scene_id !== sceneId ||
        typeof metadata.processing_version !== "string" ||
        typeof metadata.valid_pixel_ratio !== "number" || metadata.valid_pixel_ratio < 0.2 ||
        metadata.valid_pixel_ratio > 1 ||
        typeof metadata.cloud_cover_pct !== "number" || metadata.cloud_cover_pct < 0 ||
        metadata.cloud_cover_pct > 100) return "invalid_processing_provenance";
    const variables = pairs.get(sceneId) ?? new Set<string>();
    if (variables.has(String(row.variable_code))) return "duplicate_scene_variable_row";
    variables.add(String(row.variable_code));
    pairs.set(sceneId, variables);
  }
  for (const variables of pairs.values()) {
    if (variables.size !== 2 || !variables.has("ndvi_mean") || !variables.has("ndvi_median")) {
      return "each_scene_requires_mean_and_median";
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = Deno.env.get("BA_SENTINEL2_WORKER_SECRET");
  if (!supabaseUrl || !serviceKey || !workerSecret || new TextEncoder().encode(workerSecret).length < 32) {
    console.error("[earth-search-sentinel2-lease-ingest] Server configuration is missing");
    return json(500, { error: "server_configuration_error" });
  }

  try {
    let rawBody: Uint8Array;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      return error instanceof Error && error.message === "body_too_large"
        ? json(413, { error: "request_body_too_large", max_bytes: MAX_BODY_BYTES })
        : json(400, { error: "invalid_request_body" });
    }
    if (!await verifySignature(rawBody, req.headers.get("x-ba-worker-signature"),
      req.headers.get("x-ba-worker-timestamp"), workerSecret)) {
      return json(401, { error: "trusted_worker_signature_required" });
    }

    let body: any;
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return json(400, { error: "invalid_json_body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        !UUID_RE.test(String(body.job_id ?? "")) || !UUID_RE.test(String(body.lease_token ?? ""))) {
      return json(422, { error: "valid_job_and_lease_ids_required" });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // The opaque lease is checked against the live row on every write. A
    // reclaimed/expired lease cannot persist, even with a valid worker HMAC.
    const { data: job, error: jobError } = await admin.from("environmental_ingestion_jobs")
      .select("id,organization_id,location_id,status,job_type,provider_code,dataset_code,lease_token,lease_expires_at")
      .eq("id", body.job_id).maybeSingle();
    if (jobError) {
      console.error("[earth-search-sentinel2-lease-ingest] Lease lookup failed", jobError.code);
      return json(500, { error: "lease_validation_failed" });
    }
    if (!job || job.status !== "processing" || job.job_type !== "sentinel2_scene_ingestion" ||
        job.provider_code !== "EARTH_SEARCH" || job.dataset_code !== "SENTINEL_2_L2A" ||
        job.lease_token !== body.lease_token || !job.lease_expires_at ||
        Date.parse(job.lease_expires_at) <= Date.now()) {
      return json(409, { error: "active_job_lease_required" });
    }

    const invalidRows = validateRows(body.rows, job.organization_id, job.location_id);
    if (invalidRows) return json(422, { error: invalidRows });
    const { data: persistedCount, error: upsertError } = await admin.rpc(
      "upsert_satellite_environmental_observations", { p_rows: body.rows },
    );
    if (upsertError || typeof persistedCount !== "number") {
      console.error("[earth-search-sentinel2-lease-ingest] Persistence failed", upsertError?.code ?? "unknown");
      return json(500, { error: "observation_persistence_failed" });
    }
    return json(200, {
      ok: true,
      job_id: job.id,
      location_id: job.location_id,
      scenes_persisted: persistedCount / 2,
      observations_upserted: persistedCount,
      idempotent: true,
    });
  } catch (error) {
    console.error("[earth-search-sentinel2-lease-ingest] Request failed",
      error instanceof Error ? error.name : "unknown");
    return json(500, { error: "internal_error" });
  }
});
