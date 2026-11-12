// SPDX-License-Identifier: MIT
// Authenticated persistence boundary for trusted Sentinel-2 processing workers.
// The worker must sign the exact request body with BA_SENTINEL2_WORKER_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-ba-worker-signature, x-ba-worker-timestamp",
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
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyWorkerSignature(body: Uint8Array, signature: string | null, timestamp: string | null, secret: string): Promise<boolean> {
  if (!signature || !timestamp || !/^\d{10}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) return false;
  const supplied = hexToBytes(signature);
  if (!supplied) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const timestampPrefix = new TextEncoder().encode(timestamp + ".");
  const signedPayload = new Uint8Array(timestampPrefix.length + body.length);
  signedPayload.set(timestampPrefix, 0);
  signedPayload.set(body, timestampPrefix.length);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signedPayload));
  if (expected.length !== supplied.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ supplied[i];
  return mismatch === 0;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function validSourceUrl(value: unknown, sceneId: string): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase()) &&
      url.pathname.startsWith("/v1/collections/sentinel-2-l2a/items/") &&
      decodeURIComponent(url.pathname.split("/").pop() ?? "") === sceneId;
  } catch {
    return false;
  }
}

function validateRows(rows: unknown, organizationId: string, locationId: string): string | null {
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > MAX_ROWS || rows.length % 2 !== 0) {
    return "rows_must_contain_2_to_200_entries_in_scene_pairs";
  }
  const pairs = new Map<string, { variables: Set<string>; observedAt: string; retrievedAt: string; sourceUrl: string }>();
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return "invalid_observation_row";
    const row = candidate as Record<string, unknown>;
    if (row.organization_id !== organizationId || row.location_id !== locationId) return "tenant_scope_mismatch";
    if (row.data_family !== "satellite" || row.provider_code !== "EARTH_SEARCH" ||
        row.dataset_code !== "SENTINEL_2_L2A") return "source_identity_mismatch";
    if (!["ndvi_mean", "ndvi_median"].includes(String(row.variable_code))) return "unsupported_variable";
    if (typeof row.value !== "number" || !Number.isFinite(row.value) || row.value < -1 || row.value > 1) return "invalid_ndvi_value";
    if (row.unit_code !== "1" || row.quality_flag !== "valid" || !validTimestamp(row.observed_at) || !validTimestamp(row.retrieved_at) ||
        Date.parse(row.retrieved_at) < Date.parse(row.observed_at)) return "invalid_observation_timestamp_or_unit";
    const sceneId = row.source_record_id;
    if (typeof sceneId !== "string" || sceneId.trim().length < 3 || sceneId.length > 200) {
      return "source_record_id_required";
    }
    if (!validSourceUrl(row.source_url, sceneId)) return "invalid_stac_source_url";
    if (!row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) return "metadata_required";
    const metadata = row.metadata as Record<string, unknown>;
    if (metadata.scene_id !== row.source_record_id ||
        typeof metadata.processing_version !== "string" || metadata.processing_version.length < 1 || metadata.processing_version.length > 80 ||
        typeof metadata.valid_pixel_ratio !== "number" || metadata.valid_pixel_ratio < 0.2 ||
        metadata.valid_pixel_ratio > 1 ||
        typeof metadata.cloud_cover_pct !== "number" || metadata.cloud_cover_pct < 0 ||
        metadata.cloud_cover_pct > 100) return "invalid_processing_provenance";
    const pair = pairs.get(sceneId);
    if (pair) {
      if (pair.observedAt !== row.observed_at || pair.retrievedAt !== row.retrieved_at || pair.sourceUrl !== row.source_url) {
        return "scene_pair_provenance_mismatch";
      }
      if (pair.variables.has(String(row.variable_code))) return "duplicate_scene_variable_row";
      pair.variables.add(String(row.variable_code));
    } else {
      pairs.set(sceneId, {
        variables: new Set([String(row.variable_code)]),
        observedAt: String(row.observed_at),
        retrievedAt: String(row.retrieved_at),
        sourceUrl: String(row.source_url),
      });
    }
  }
  for (const pair of pairs.values()) {
    if (pair.variables.size !== 2 || !pair.variables.has("ndvi_mean") || !pair.variables.has("ndvi_median")) {
      return "each_scene_requires_mean_and_median";
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization");
  if (!authorization) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerSecret = Deno.env.get("BA_SENTINEL2_WORKER_SECRET");
  if (!supabaseUrl || !publishableKey || !serviceKey || !workerSecret || new TextEncoder().encode(workerSecret).length < 32) {
    console.error("[earth-search-sentinel2-ingest] Required server configuration is missing");
    return json(500, { error: "server_configuration_error" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    let rawBody: Uint8Array;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      return error instanceof Error && error.message === "body_too_large"
        ? json(413, { error: "request_body_too_large", max_bytes: MAX_BODY_BYTES })
        : json(400, { error: "invalid_request_body" });
    }
    if (!await verifyWorkerSignature(rawBody, req.headers.get("x-ba-worker-signature"), req.headers.get("x-ba-worker-timestamp"), workerSecret)) {
      return json(401, { error: "trusted_worker_signature_required" });
    }

    let body: any;
    try {
      body = JSON.parse(new TextDecoder().decode(rawBody));
    } catch {
      return json(400, { error: "invalid_json_body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json_body" });
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    if (!UUID_RE.test(organizationId) || !UUID_RE.test(locationId)) return json(422, { error: "valid_scope_ids_required" });

    // Verify both location visibility and explicit write membership using the caller JWT.
    const { data: location, error: locationError } = await userClient.from("locations")
      .select("id,organization_id").eq("id", locationId).eq("organization_id", organizationId).maybeSingle();
    if (locationError || !location) return json(404, { error: "location_not_found_or_access_denied" });
    const { data: membership, error: membershipError } = await userClient.from("organization_members")
      .select("role").eq("organization_id", organizationId).eq("user_id", authData.user.id).maybeSingle();
    if (membershipError || !membership ||
        !["owner", "admin", "member"].includes(String(membership.role))) {
      return json(403, { error: "write_permission_required" });
    }

    const invalidRows = validateRows(body.rows, organizationId, locationId);
    if (invalidRows) return json(422, { error: invalidRows });

    // The satellite deduplication index is partial. Route through the SQL
    // function so PostgreSQL can infer the matching data_family predicate.
    const { data: persistedCount, error: upsertError } = await adminClient.rpc(
      "upsert_satellite_environmental_observations",
      { p_rows: body.rows },
    );
    if (upsertError || typeof persistedCount !== "number") {
      console.error("[earth-search-sentinel2-ingest] Persistence failed", upsertError?.code ?? "unknown");
      return json(500, { error: "observation_persistence_failed" });
    }
    return json(200, {
      ok: true,
      provider: "Earth Search",
      dataset: "Sentinel-2 L2A",
      location_id: locationId,
      scenes_persisted: persistedCount / 2,
      observations_upserted: persistedCount,
      idempotent: true,
    });
  } catch (error) {
    console.error("[earth-search-sentinel2-ingest] Request failed", error instanceof Error ? error.name : "unknown");
    return json(500, { error: "internal_error" });
  }
});
