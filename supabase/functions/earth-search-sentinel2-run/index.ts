// SPDX-License-Identifier: MIT
// Authenticated Sentinel-2 gateway: resolves a BA Labs location, searches STAC,
// and delegates raster processing to the private Python worker.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Access-Control-Request-Headers",
};
const STAC_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_STAC_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAX_DAYS = 90;
const MAX_SCENES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function readBoundedJson(input: Request | Response, maxBytes: number): Promise<any> {
  const declaredLength = Number(input.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("json_body_too_large");
  if (!input.body) throw new Error("empty_json_body");
  const reader = input.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("json_body_too_large");
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

function trustedWorkerUrl(base: string): string | null {
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
        url.search || url.hash || url.port && url.port !== "443") return null;
    url.pathname = url.pathname.replace(/\/$/, "") + "/v1/sentinel2/process-and-persist";
    return url.toString();
  } catch {
    return null;
  }
}

function trustedStacNextUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "earth-search.aws.element84.com" &&
      !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function makeLocationAoi(latitude: number, longitude: number) {
  // Same approximate study window as the existing preview; not a cadastral parcel.
  const halfLat = 0.005;
  const halfLon = Math.min(0.01, halfLat / Math.max(0.2, Math.cos(latitude * Math.PI / 180)));
  const west = Math.max(-180, longitude - halfLon);
  const east = Math.min(180, longitude + halfLon);
  const south = Math.max(-90, latitude - halfLat);
  const north = Math.min(90, latitude + halfLat);
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authorization = req.headers.get("authorization");
  if (!authorization) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const engineBaseUrl = Deno.env.get("BA_ENVIRONMENTAL_ENGINE_URL");
  const engineApiKey = Deno.env.get("BA_ENVIRONMENTAL_ENGINE_API_KEY");
  const workerUrl = engineBaseUrl ? trustedWorkerUrl(engineBaseUrl) : null;
  if (!supabaseUrl || !publishableKey || !engineApiKey || !workerUrl) {
    console.error("[earth-search-sentinel2-run] Required server configuration is missing or invalid");
    return json(503, { error: "sentinel2_worker_not_configured" });
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    let body: any;
    try {
      body = await readBoundedJson(req, MAX_REQUEST_BYTES);
    } catch (error) {
      return error instanceof Error && error.message === "json_body_too_large"
        ? json(413, { error: "request_body_too_large", max_bytes: MAX_REQUEST_BYTES })
        : json(400, { error: "invalid_json_body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json_body" });

    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const startDate = body.start_date;
    const endDate = body.end_date;
    const cloudLimit = body.max_cloud_cover_pct === undefined ? 30 : body.max_cloud_cover_pct;
    const requestedScenes = body.max_scenes === undefined ? 10 : body.max_scenes;
    if (!locationId || !validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      return json(422, { error: "location_and_valid_date_range_required" });
    }
    if (typeof cloudLimit !== "number" || !Number.isFinite(cloudLimit) || cloudLimit < 0 || cloudLimit > 100) {
      return json(422, { error: "max_cloud_cover_pct_must_be_between_0_and_100" });
    }
    if (!Number.isInteger(requestedScenes) || requestedScenes < 1 || requestedScenes > MAX_SCENES) {
      return json(422, { error: "max_scenes_must_be_between_1_and_20" });
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

    const aoi = makeLocationAoi(location.latitude, location.longitude);
    const searchBody: Record<string, unknown> = {
      collections: ["sentinel-2-l2a"],
      intersects: aoi,
      datetime: startDate + "T00:00:00Z/" + endDate + "T23:59:59.999Z",
      query: { "eo:cloud_cover": { lte: cloudLimit } },
      limit: Math.min(requestedScenes, 10),
      sortby: [{ field: "properties.datetime", direction: "desc" }],
    };
    let nextUrl = STAC_SEARCH_URL;
    let nextMethod = "POST";
    let nextBody: unknown = searchBody;
    const items: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let pagesRead = 0;
    let itemsSeen = 0;

    while (nextUrl && items.length < requestedScenes && pagesRead < 5) {
      const safeUrl = trustedStacNextUrl(nextUrl);
      if (!safeUrl) return json(502, { error: "earth_search_pagination_url_rejected" });
      const response = await fetch(safeUrl, {
        method: nextMethod,
        headers: { Accept: "application/geo+json", ...(nextMethod === "POST" ? { "Content-Type": "application/json" } : {}) },
        body: nextMethod === "POST" ? JSON.stringify(nextBody) : undefined,
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        console.error("[earth-search-sentinel2-run] STAC search failed", response.status);
        return json(502, { error: "earth_search_catalogue_unavailable" });
      }
      let result: any;
      try {
        result = await readBoundedJson(response, MAX_STAC_RESPONSE_BYTES);
      } catch {
        return json(502, { error: "earth_search_catalogue_response_invalid_or_too_large" });
      }
      if (!Array.isArray(result?.features)) return json(502, { error: "earth_search_catalogue_invalid" });
      pagesRead++;
      for (const feature of result.features) {
        if (items.length >= requestedScenes) break;
        itemsSeen++;
        const id = typeof feature?.id === "string" ? feature.id : "";
        const acquired = Date.parse(feature?.properties?.datetime ?? "");
        const cloud = Number(feature?.properties?.["eo:cloud_cover"]);
        if (!id || seen.has(id) || !Number.isFinite(acquired) ||
            acquired < startMs || acquired >= endMs + DAY_MS ||
            !Number.isFinite(cloud) || cloud < 0 || cloud > cloudLimit) continue;
        seen.add(id);
        items.push(feature);
      }
      const links = Array.isArray(result.links) ? result.links : [];
      const nextLinks = links.filter((link: any) => link && link.rel === "next");
      if (nextLinks.length > 1) return json(502, { error: "earth_search_pagination_ambiguous" });
      if (!nextLinks.length) {
        nextUrl = "";
      } else {
        const link = nextLinks[0];
        nextUrl = trustedStacNextUrl(link.href) ?? "";
        if (!nextUrl) return json(502, { error: "earth_search_pagination_url_rejected" });
        nextMethod = String(link.method ?? "GET").toUpperCase();
        if (nextMethod !== "GET" && nextMethod !== "POST") return json(502, { error: "earth_search_pagination_method_unsupported" });
        nextBody = nextMethod === "POST" ? link.body : undefined;
      }
    }

    if (!items.length) {
      return json(404, {
        error: "no_usable_sentinel2_scenes",
        date_range: { start: startDate, end: endDate },
        items_seen: itemsSeen,
      });
    }

    const workerRequest = {
      organization_id: location.organization_id,
      location_id: location.id,
      aoi_geojson: aoi,
      items,
      retrieved_at: new Date().toISOString(),
      processing_version: "ba-sentinel2-native-v1",
      minimum_valid_ratio: 0.2,
      max_pixels: 4_000_000,
    };
    const workerResponse = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BA-Engine-Key": engineApiKey,
        Authorization: authorization,
      },
      body: JSON.stringify(workerRequest),
      signal: AbortSignal.timeout(120_000),
    });
    if (!workerResponse.ok) {
      console.error("[earth-search-sentinel2-run] Private worker failed", workerResponse.status);
      return json(workerResponse.status === 504 ? 504 : 502, { error: "sentinel2_processing_worker_failed" });
    }
    const workerResult = await workerResponse.json().catch(() => null);
    if (!workerResult || workerResult.ok !== true) return json(502, { error: "sentinel2_processing_worker_response_invalid" });

    return json(200, {
      ok: true,
      provider: "EARTH_SEARCH",
      dataset: "SENTINEL_2_L2A",
      location_id: location.id,
      date_range: { start: startDate, end: endDate },
      max_cloud_cover_pct: cloudLimit,
      aoi_method: "approximate_location_buffer_not_cadastral_boundary",
      stac: { pages_read: pagesRead, items_seen: itemsSeen, scenes_selected: items.length },
      processing: workerResult,
    });
  } catch (error) {
    console.error(
      "[earth-search-sentinel2-run] Request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return json(500, { error: "internal_error" });
  }
});
