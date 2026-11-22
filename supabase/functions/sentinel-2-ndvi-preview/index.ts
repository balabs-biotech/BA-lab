// SPDX-License-Identifier: MIT
// Returns a rendered Sentinel-2 L2A NDVI PNG for a small area around a saved location.
// Requires SENTINELHUB_CLIENT_ID and SENTINELHUB_CLIENT_SECRET Edge Function secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Geo-Bounds, X-Image-Date, X-Image-Source",
  "Vary": "Access-Control-Request-Headers",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const validDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("authorization");
  if (!authorization) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json(500, { error: "server_configuration_error" });
  const clientId = Deno.env.get("SENTINELHUB_CLIENT_ID");
  const clientSecret = Deno.env.get("SENTINELHUB_CLIENT_SECRET");
  if (!clientId || !clientSecret) return json(503, { error: "sentinelhub_credentials_not_configured", setup: "Configure SENTINELHUB_CLIENT_ID and SENTINELHUB_CLIENT_SECRET as Supabase Edge Function secrets." });
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json(401, { error: "invalid_session" });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json_body" });
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const date = body.date;
    if (!locationId) return json(400, { error: "location_id_required" });
    if (!validDate(date) || Date.parse(date + "T00:00:00Z") >= Date.now()) return json(422, { error: "past_valid_date_required" });
    const { data: loc, error: locError } = await db.from("locations").select("id,latitude,longitude").eq("id", locationId).maybeSingle();
    if (locError || !loc) return json(404, { error: "location_not_found_or_access_denied" });
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number" || loc.latitude < -90 || loc.latitude > 90 || loc.longitude < -180 || loc.longitude > 180) {
      return json(422, { error: "valid_location_coordinates_required" });
    }
    // Approximate 1.1 km study window; not a parcel boundary.
    const halfLat = 0.005;
    const halfLon = Math.min(0.01, halfLat / Math.max(0.2, Math.cos(loc.latitude * Math.PI / 180)));
    const west = Math.max(-180, loc.longitude - halfLon), east = Math.min(180, loc.longitude + halfLon);
    const south = Math.max(-90, loc.latitude - halfLat), north = Math.min(90, loc.latitude + halfLat);
    const tokenResponse = await fetch("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenResponse.ok) {
      console.error("[sentinel-2-ndvi-preview] OAuth status", tokenResponse.status);
      return json(502, { error: "sentinelhub_authentication_failed" });
    }
    const tokenPayload = await tokenResponse.json();
    if (typeof tokenPayload.access_token !== "string") return json(502, { error: "sentinelhub_token_response_invalid" });
    const evalscript = `//VERSION=3
function setup() {
  return { input: [{ bands: ["B04", "B08", "dataMask"] }], output: { bands: 4, sampleType: "UINT8" } };
}
function evaluatePixel(s) {
  if (s.dataMask === 0) return [0, 0, 0, 0];
  const ndvi = (s.B08 - s.B04) / Math.max(0.000001, s.B08 + s.B04);
  let c;
  if (ndvi < 0) c = [120, 90, 180];
  else if (ndvi < 0.15) c = [180, 70, 60];
  else if (ndvi < 0.30) c = [235, 165, 55];
  else if (ndvi < 0.45) c = [220, 220, 90];
  else if (ndvi < 0.60) c = [100, 190, 95];
  else c = [20, 115, 55];
  return [c[0], c[1], c[2], 230];
}`;
    const processResponse = await fetch("https://sh.dataspace.copernicus.eu/process/v1", {
      method: "POST",
      headers: { "Authorization": "Bearer " + tokenPayload.access_token, "Content-Type": "application/json", "Accept": "image/png" },
      body: JSON.stringify({
        input: {
          bounds: { bbox: [west, south, east, north], properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
          data: [{ type: "sentinel-2-l2a", dataFilter: { timeRange: { from: date + "T00:00:00Z", to: date + "T23:59:59Z" }, maxCloudCoverage: 60, mosaickingOrder: "mostRecent" } }]
        },
        output: { width: 512, height: 512, responses: [{ identifier: "default", format: { type: "image/png" } }] },
        evalscript
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!processResponse.ok) {
      const status = processResponse.status;
      const detail = (await processResponse.text().catch(() => "")).slice(0, 300);
      console.error("[sentinel-2-ndvi-preview] Process API status", status, detail);
      return json(status === 429 ? 429 : 502, { error: status === 429 ? "sentinelhub_rate_limited" : "sentinelhub_processing_failed", upstream_status: status });
    }
    const image = await processResponse.arrayBuffer();
    if (!image.byteLength || image.byteLength > 5_000_000) return json(502, { error: "sentinelhub_image_size_invalid" });
    return new Response(image, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "image/png", "Cache-Control": "private, max-age=900",
        "X-Geo-Bounds": [west, south, east, north].join(","),
        "X-Image-Date": date, "X-Image-Source": "Sentinel-2 L2A NDVI; 10 m source bands; 512 px rendered preview" }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    const timeout = msg.includes("timeout");
    console.error("[sentinel-2-ndvi-preview] request failed", timeout ? "timeout" : "upstream_or_internal_error");
    return json(timeout ? 504 : 500, { error: timeout ? "sentinelhub_timeout" : "internal_error" });
  }
});
