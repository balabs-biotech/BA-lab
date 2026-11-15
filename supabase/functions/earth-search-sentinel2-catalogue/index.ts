// SPDX-License-Identifier: MIT
// Anonymous-source fallback for Sentinel-2 scene discovery.
// Uses Element84 Earth Search (public AWS Open Data COG catalogue); no Copernicus OAuth secrets.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Access-Control-Request-Headers",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const validDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("authorization");
  if (!authorization) return reply(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return reply(500, { error: "server_configuration_error" });

  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return reply(401, { error: "invalid_session" });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "invalid_json_body" });
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const start = body.start_date;
    const end = body.end_date;
    const limit = body.limit === undefined ? 10 : Number(body.limit);
    const cloud = body.max_cloud_cover === undefined ? 60 : Number(body.max_cloud_cover);
    if (!locationId) return reply(400, { error: "location_id_required" });
    if (!validDate(start) || !validDate(end) || start > end) return reply(400, { error: "valid_date_range_required" });
    const days = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000 + 1;
    if (days > 180 || Date.parse(end + "T00:00:00Z") > Date.now()) return reply(422, { error: "date_range_must_be_past_180_days_or_less" });
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return reply(422, { error: "limit_must_be_1_to_20" });
    if (!Number.isFinite(cloud) || cloud < 0 || cloud > 100) return reply(422, { error: "max_cloud_cover_must_be_0_to_100" });

    const { data: loc, error: locError } = await db.from("locations")
      .select("id,latitude,longitude").eq("id", locationId).maybeSingle();
    if (locError || !loc) return reply(404, { error: "location_not_found_or_access_denied" });
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number" ||
        loc.latitude < -90 || loc.latitude > 90 || loc.longitude < -180 || loc.longitude > 180) {
      return reply(422, { error: "valid_location_coordinates_required" });
    }
    const dLat = 0.03;
    const dLon = Math.min(0.15, dLat / Math.max(0.2, Math.cos(loc.latitude * Math.PI / 180)));
    const bbox = [Math.max(-180, loc.longitude - dLon), Math.max(-90, loc.latitude - dLat),
      Math.min(180, loc.longitude + dLon), Math.min(90, loc.latitude + dLat)];
    const search = new URL("https://earth-search.aws.element84.com/v1/search");
    search.searchParams.set("collections", "sentinel-2-l2a");
    search.searchParams.set("bbox", bbox.join(","));
    search.searchParams.set("datetime", start + "T00:00:00Z/" + end + "T23:59:59Z");
    search.searchParams.set("limit", String(limit));
    search.searchParams.set("sortby", "-properties.datetime");
    search.searchParams.set("query", JSON.stringify({ "eo:cloud_cover": { "lte": cloud } }));
    search.searchParams.set("fields", "id,collection,bbox,properties.datetime,properties.eo:cloud_cover,properties.platform,properties.constellation,links,assets,-geometry");
    const upstream = await fetch(search, { signal: AbortSignal.timeout(20000), headers: { Accept: "application/geo+json" } });
    if (!upstream.ok) {
      console.error("[earth-search-sentinel2-catalogue] STAC status", upstream.status);
      return reply(502, { error: "earth_search_catalogue_unavailable", upstream_status: upstream.status });
    }
    const payload = await upstream.json();
    if (!Array.isArray(payload?.features)) return reply(502, { error: "earth_search_response_invalid" });
    const scenes = payload.features.map((f: Record<string, any>) => {
      const p = f.properties ?? {};
      const links = Array.isArray(f.links) ? f.links : [];
      const self = links.find((l: any) => l?.rel === "self" && typeof l.href === "string");
      const assets = f.assets && typeof f.assets === "object" ? f.assets : {};
      const safeAssetUrl = (candidate: unknown): string | null => {
        if (typeof candidate !== "string") return null;
        try {
          const u = new URL(candidate);
          return u.protocol === "https:" && (u.hostname === "earth-search.aws.element84.com" ||
            u.hostname.endsWith(".amazonaws.com") || u.hostname.endsWith(".cloudfront.net")) ? u.toString() : null;
        } catch { return null; }
      };
      const previewUrl = safeAssetUrl(assets.thumbnail?.href) ?? safeAssetUrl(assets.preview?.href);
      const itemUrl = typeof self?.href === "string" && self.href.startsWith("https://earth-search.aws.element84.com/") ? self.href : null;
      const sceneBbox = Array.isArray(f.bbox) && f.bbox.length === 4 && f.bbox.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) ? f.bbox : null;
      const date = typeof p.datetime === "string" ? p.datetime : null;
      const browser = new URL("https://sentinel-2.allthingsspatial.io/");
      if (sceneBbox) {
        browser.searchParams.set("lat", String((sceneBbox[1] + sceneBbox[3]) / 2));
        browser.searchParams.set("lon", String((sceneBbox[0] + sceneBbox[2]) / 2));
      }
      if (date) browser.searchParams.set("date", date.slice(0, 10));
      return {
        id: typeof f.id === "string" ? f.id : null,
        acquired_at: date,
        cloud_cover_percent: typeof p["eo:cloud_cover"] === "number" ? p["eo:cloud_cover"] : null,
        platform: typeof p.platform === "string" ? p.platform : "Sentinel-2",
        constellation: typeof p.constellation === "string" ? p.constellation : "Sentinel-2",
        bbox: sceneBbox,
        catalogue_item_url: itemUrl,
        preview_url: previewUrl,
        preview_source: previewUrl ? "Earth Search public asset" : null,
        browser_url: browser.toString(),
      };
    });
    return reply(200, {
      ok: true, provider: "Earth Search / AWS Open Data", collection: "sentinel-2-l2a",
      location_id: loc.id, search_bbox_wgs84: bbox, bbox_note: "Regional context window, not a parcel boundary.",
      date_range: { start, end }, max_cloud_cover_percent: cloud, scenes_found: scenes.length, scenes,
      note: "Catalogue and public preview assets only. This fallback does not compute NDVI; full-resolution COG bands are available for a later processing step.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    console.error("[earth-search-sentinel2-catalogue] request failed", message);
    return reply(message.toLowerCase().includes("timeout") ? 504 : 500,
      { error: message.toLowerCase().includes("timeout") ? "earth_search_catalogue_timeout" : "internal_error" });
  }
});
