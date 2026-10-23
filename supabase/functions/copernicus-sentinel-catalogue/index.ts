// SPDX-License-Identifier: MIT
// Read-only Sentinel-2 L2A STAC metadata search. Does not download imagery or write database rows.
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });
const validDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("authorization");
  if (!authorization) return reply(401, { error: "authentication_required" });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) return reply(500, { error: "server_configuration_error" });
  const db = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: session, error: authError } = await db.auth.getUser();
    if (authError || !session.user) return reply(401, { error: "invalid_session" });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "invalid_json_body" });
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const start = body.start_date, end = body.end_date;
    const limit = body.limit === undefined ? 10 : body.limit;
    const cloud = body.max_cloud_cover === undefined ? 80 : body.max_cloud_cover;
    if (!locationId) return reply(400, { error: "location_id_required" });
    if (!validDate(start) || !validDate(end) || start > end) return reply(400, { error: "valid_date_range_required" });
    const days = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86400000 + 1;
    if (days > 180 || Date.parse(end + "T00:00:00Z") > Date.now()) return reply(422, { error: "date_range_must_be_past_180_days_or_less" });
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return reply(422, { error: "limit_must_be_1_to_20" });
    if (typeof cloud !== "number" || !Number.isFinite(cloud) || cloud < 0 || cloud > 100) return reply(422, { error: "max_cloud_cover_must_be_0_to_100" });

    // User-scoped RLS query validates access to the selected location.
    const { data: loc, error } = await db.from("locations")
      .select("id,latitude,longitude").eq("id", locationId).maybeSingle();
    if (error || !loc) return reply(404, { error: "location_not_found_or_access_denied" });
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number" ||
        loc.latitude < -90 || loc.latitude > 90 || loc.longitude < -180 || loc.longitude > 180) {
      return reply(422, { error: "valid_location_coordinates_required" });
    }

    // Regional context box only; without a parcel polygon this cannot confirm parcel-level coverage.
    const dLat = 0.03;
    const dLon = Math.min(0.15, 0.03 / Math.max(0.2, Math.cos(loc.latitude * Math.PI / 180)));
    const bbox = [Math.max(-180, loc.longitude - dLon), Math.max(-90, loc.latitude - dLat),
      Math.min(180, loc.longitude + dLon), Math.min(90, loc.latitude + dLat)];
    const search = new URL("https://stac.dataspace.copernicus.eu/v1/search");
    search.searchParams.set("collections", "sentinel-2-l2a");
    search.searchParams.set("bbox", bbox.join(","));
    search.searchParams.set("datetime", start + "T00:00:00Z/" + end + "T23:59:59Z");
    search.searchParams.set("limit", String(limit));
    // Return the newest matching scenes first so the UI does not show an arbitrary subset.
    search.searchParams.set("sortby", "-properties.datetime");
    search.searchParams.set("query", JSON.stringify({ "eo:cloud_cover": { "lte": cloud } }));
    search.searchParams.set("fields", "id,collection,bbox,properties.datetime,properties.eo:cloud_cover,properties.platform,properties.constellation,links,assets,-geometry");
    const upstream = await fetch(search, { signal: AbortSignal.timeout(20000) });
    if (!upstream.ok) {
      console.error("[copernicus-sentinel-catalogue] STAC status", upstream.status);
      return reply(502, { error: "copernicus_catalogue_unavailable", upstream_status: upstream.status });
    }
    const payload = await upstream.json();
    if (!Array.isArray(payload?.features)) return reply(502, { error: "copernicus_response_invalid" });

    const scenes = payload.features.map((f: Record<string, any>) => {
      const p = f.properties ?? {};
      const self = Array.isArray(f.links) ? f.links.find((l: any) => l?.rel === "self" && typeof l.href === "string") : null;
      let itemUrl: string | null = null;
      try {
        const parsed = new URL(self?.href ?? "");
        if (parsed.protocol === "https:" && parsed.hostname === "stac.dataspace.copernicus.eu") itemUrl = parsed.toString();
      } catch { /* omit malformed catalogue link */ }
      const assets = f.assets && typeof f.assets === "object" ? f.assets : {};
      const previewAsset = ["thumbnail", "rendered_preview", "preview", "visual"].map((key) => assets[key])
        .find((asset: any) => asset && typeof asset.href === "string");
      let previewUrl: string | null = null;
      try {
        const parsedPreview = new URL(previewAsset?.href ?? "");
        if (parsedPreview.protocol === "https:" &&
            (parsedPreview.hostname === "stac.dataspace.copernicus.eu" ||
             parsedPreview.hostname.endsWith(".dataspace.copernicus.eu"))) {
          previewUrl = parsedPreview.toString();
        }
      } catch { /* omit missing or malformed preview */ }
      return {
        id: typeof f.id === "string" ? f.id : null,
        acquired_at: typeof p.datetime === "string" ? p.datetime : null,
        cloud_cover_percent: typeof p["eo:cloud_cover"] === "number" ? p["eo:cloud_cover"] : null,
        platform: typeof p.platform === "string" ? p.platform : null,
        constellation: typeof p.constellation === "string" ? p.constellation : "Sentinel-2",
        bbox: Array.isArray(f.bbox) && f.bbox.length === 4 ? f.bbox : null,
        catalogue_item_url: itemUrl,
        preview_url: previewUrl,
      };
    });
    return reply(200, { ok: true, provider: "Copernicus Data Space STAC", collection: "sentinel-2-l2a",
      location_id: loc.id, search_bbox_wgs84: bbox,
      bbox_note: "Regional context window, not a parcel boundary.",
      date_range: { start, end }, max_cloud_cover_percent: cloud, scenes_found: scenes.length, scenes,
      note: "Scene metadata and available preview URLs; full-resolution imagery and vegetation indices are not processed." });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    console.error("[copernicus-sentinel-catalogue] request failed", message);
    return reply(message.toLowerCase().includes("timeout") ? 504 : 500,
      { error: message.toLowerCase().includes("timeout") ? "copernicus_catalogue_timeout" : "internal_error" });
  }
});
