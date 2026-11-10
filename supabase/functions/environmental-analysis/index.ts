// SPDX-License-Identifier: MIT
// Authenticated CultureOps gateway to the private BA Labs environmental engine.
// User authorization is checked with the caller JWT before service-role reads.
// The engine secret is never returned to the caller or sent to a browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const baseHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const MAX_OBSERVATIONS = 5_000;
const ENGINE_VARIABLES = new Set([
  "air_temperature_mean",
  "air_temperature_max",
  "air_temperature_min",
  "wind_speed_mean",
  "relative_humidity_mean",
  "solar_radiation_all_sky",
]);

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function readJsonBounded(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new Error("payload_too_large");
  if (!req.body) throw new Error("invalid_json_body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
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
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("invalid_json_body");
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const allowedOrigins = new Set(
    (Deno.env.get("BA_ENVIRONMENTAL_ALLOWED_ORIGINS") ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
  if (origin && !allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { ...baseHeaders },
    });
  }
  const headers = new Headers(baseHeaders);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization");
  if (!authorization) return reply(401, { error: "authentication_required" });
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
  const accessToken = bearer?.[1]?.trim();
  if (!accessToken) return reply(401, { error: "bearer_token_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const engineUrl = Deno.env.get("BA_ENVIRONMENTAL_ENGINE_URL");
  const engineKey = Deno.env.get("BA_ENVIRONMENTAL_ENGINE_API_KEY");
  if (!supabaseUrl || !publishableKey || !serviceKey || !engineUrl || !engineKey) {
    console.error("[environmental-analysis] Server configuration is incomplete");
    return reply(500, { error: "server_configuration_error" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Pass the JWT explicitly: with persistSession=false there is no local session
    // for getUser() to recover, even though the REST client has a global header.
    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authData.user) return reply(401, { error: "invalid_session" });

    let body: any;
    try {
      body = await readJsonBounded(req, 16_000);
    } catch (error) {
      return reply(error instanceof Error && error.message === "payload_too_large" ? 413 : 400,
        { error: error instanceof Error ? error.message : "invalid_json_body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply(400, { error: "invalid_json_body" });
    }
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const startDate = body.start_date;
    const endDate = body.end_date;
    if (!locationId) return reply(400, { error: "location_id_required" });
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      return reply(400, { error: "valid_start_date_and_end_date_required" });
    }
    const dayCount = Math.floor((Date.parse(endDate + "T00:00:00Z") -
      Date.parse(startDate + "T00:00:00Z")) / DAY_MS) + 1;
    if (dayCount > MAX_DAYS || Date.parse(endDate + "T00:00:00Z") > Date.now() + DAY_MS) {
      return reply(422, { error: "date_range_exceeds_supported_scope" });
    }

    // This RLS-scoped lookup proves the caller can see this location.
    const { data: location, error: locationError } = await userClient
      .from("locations")
      .select("id, organization_id, latitude, longitude, altitude_m")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError || !location) return reply(404, { error: "location_not_found_or_access_denied" });

    // Analysis is read-only: any active organization member, including viewer, may request it.
    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", location.organization_id)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError || !membership ||
        !["owner", "admin", "member", "viewer"].includes(String(membership.role))) {
      return reply(403, { error: "organization_membership_required" });
    }

    if (typeof location.latitude !== "number" || typeof location.longitude !== "number" ||
        location.latitude < -90 || location.latitude > 90 ||
        location.longitude < -180 || location.longitude > 180) {
      return reply(422, { error: "valid_location_coordinates_required" });
    }
    const altitude = location.altitude_m;
    if (typeof altitude !== "number" || !Number.isFinite(altitude) || altitude < -500 || altitude > 9000) {
      return reply(422, { error: "location_altitude_m_required_in_location_metadata" });
    }

    // The service role is used only after JWT, RLS location visibility and membership checks.
    const { data: rows, error: rowsError } = await adminClient
      .from("environmental_observations")
      .select("id,organization_id,location_id,data_family,provider_code,dataset_code,variable_code,value,unit_code,observed_at,retrieved_at,spatial_resolution_m,quality_flag,source_url,metadata")
      .eq("organization_id", location.organization_id)
      .eq("location_id", location.id)
      .eq("data_family", "weather")
      .eq("provider_code", "NASA_POWER")
      .eq("dataset_code", "POWER_DAILY_AGRO")
      .in("variable_code", [...ENGINE_VARIABLES])
      .gte("observed_at", startDate + "T00:00:00.000Z")
      .lte("observed_at", endDate + "T23:59:59.999Z")
      .order("observed_at", { ascending: true })
      .limit(MAX_OBSERVATIONS);
    if (rowsError) {
      console.error("[environmental-analysis] Observation lookup failed", rowsError.message);
      return reply(500, { error: "environmental_observation_lookup_failed" });
    }
    if (!rows?.length) return reply(422, { error: "no_supported_environmental_observations" });
    if (rows.length >= MAX_OBSERVATIONS) return reply(422, { error: "observation_limit_reached_narrow_date_range" });

    const engineEndpoint = new URL("/v1/analyses/nasa-power", engineUrl);
    const engineResponse = await fetch(engineEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BA-Engine-Key": engineKey,
      },
      body: JSON.stringify({
        analysis_id: crypto.randomUUID(),
        scope: {
          organization_id: location.organization_id,
          location_id: location.id,
          from: startDate,
          to: endDate,
        },
        latitude_deg: location.latitude,
        altitude_m: altitude,
        observations: rows,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!engineResponse.ok) {
      const detail = await engineResponse.text();
      console.error("[environmental-analysis] Engine request failed", engineResponse.status, detail.slice(0, 500));
      if (engineResponse.status === 422) return reply(422, { error: "environmental_analysis_rejected", detail: "The selected observations do not satisfy the engine's scientific input contract." });
      return reply(502, { error: "environmental_engine_unavailable" });
    }
    const result = await engineResponse.json();
    return reply(200, { ok: true, analysis: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[environmental-analysis] Request failed", message);
    if (message.toLowerCase().includes("timeout")) return reply(504, { error: "environmental_analysis_timeout" });
    return reply(500, { error: "internal_error" });
  }
});
