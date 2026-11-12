// SPDX-License-Identifier: MIT
// Authenticated enqueue-only gateway for the durable Sentinel-2 worker queue.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Access-Control-Request-Headers",
};
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_DAYS = 90;
const MAX_SCENES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function readBoundedJson(req: Request): Promise<any> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) throw new Error("body_too_large");
  if (!req.body) throw new Error("empty_body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
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
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization");
  if (!authorization) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    console.error("[earth-search-sentinel2-enqueue] Server configuration is missing");
    return json(503, { error: "enqueue_not_configured" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    let body: any;
    try {
      body = await readBoundedJson(req);
    } catch (error) {
      return error instanceof Error && error.message === "body_too_large"
        ? json(413, { error: "request_body_too_large", max_bytes: MAX_REQUEST_BYTES })
        : json(400, { error: "invalid_json_body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(400, { error: "invalid_json_body" });
    }

    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const startDate = body.start_date;
    const endDate = body.end_date;
    const cloudLimit = body.max_cloud_cover_pct === undefined ? 30 : body.max_cloud_cover_pct;
    const requestedScenes = body.max_scenes === undefined ? 10 : body.max_scenes;
    if (!UUID_RE.test(locationId) || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      return json(422, { error: "location_and_valid_date_range_required" });
    }
    if (typeof cloudLimit !== "number" || !Number.isFinite(cloudLimit) || cloudLimit < 0 || cloudLimit > 100) {
      return json(422, { error: "max_cloud_cover_pct_must_be_between_0_and_100" });
    }
    if (!Number.isInteger(requestedScenes) || requestedScenes < 1 || requestedScenes > MAX_SCENES) {
      return json(422, { error: "max_scenes_must_be_between_1_and_10" });
    }

    const startMs = Date.parse(startDate + "T00:00:00Z");
    const endMs = Date.parse(endDate + "T00:00:00Z");
    const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;
    if (dayCount > MAX_DAYS) return json(422, { error: "date_range_exceeds_90_days" });
    if (endMs > Date.now()) return json(422, { error: "future_date_range_not_allowed" });

    const { data: location, error: locationError } = await userClient
      .from("locations")
      .select("id,organization_id,latitude,longitude")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError || !location) return json(404, { error: "location_not_found_or_access_denied" });

    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", location.organization_id)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError || !membership ||
        !["owner", "admin", "member"].includes(String(membership.role))) {
      return json(403, { error: "write_permission_required" });
    }
    if (typeof location.latitude !== "number" || typeof location.longitude !== "number" ||
        location.latitude < -90 || location.latitude > 90 ||
        location.longitude < -180 || location.longitude > 180) {
      return json(422, { error: "valid_location_coordinates_required" });
    }

    const { data: job, error: jobError } = await adminClient
      .from("environmental_ingestion_jobs")
      .insert({
        organization_id: location.organization_id,
        location_id: location.id,
        requested_by: authData.user.id,
        job_type: "sentinel2_scene_ingestion",
        provider_code: "EARTH_SEARCH",
        dataset_code: "SENTINEL_2_L2A",
        status: "queued",
        request_parameters: {
          start_date: startDate,
          end_date: endDate,
          max_cloud_cover_pct: cloudLimit,
          max_scenes: requestedScenes,
          aoi_method: "approximate_location_buffer_not_cadastral_boundary",
        },
      })
      .select("id,status,created_at")
      .single();

    if (jobError || !job?.id) {
      console.error("[earth-search-sentinel2-enqueue] Job insert failed", jobError?.code ?? "unknown");
      return json(503, { error: "ingestion_job_creation_failed" });
    }

    return json(202, {
      ok: true,
      job_id: job.id,
      status: job.status,
      created_at: job.created_at,
      message: "sentinel2_job_queued",
    });
  } catch (error) {
    console.error("[earth-search-sentinel2-enqueue] Request failed",
      error instanceof Error ? error.name : "unknown");
    return json(500, { error: "internal_error" });
  }
});
