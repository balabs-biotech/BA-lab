// SPDX-License-Identifier: MIT
// Sentinel-2 NDVI raster preview from public Earth Search / AWS Open Data COGs.
// No Copernicus OAuth credentials required. Requires authenticated BA Labs session.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fromUrl } from "npm:geotiff@2.1.3";
import proj4 from "npm:proj4@2.12.1";
import { PNG } from "npm:pngjs@7.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Geo-Bounds, X-Image-Date, X-Image-Source, X-NDVI-Stats",
  "Vary": "Access-Control-Request-Headers",
};
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_STAC_RESPONSE_BYTES = 2 * 1024 * 1024;

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
        await reader.cancel("json_body_too_large");
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

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const validDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const safeCogUrl = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (!(h === "earth-search.aws.element84.com" || h.endsWith(".amazonaws.com") || h.endsWith(".cloudfront.net"))) return null;
    return u.toString();
  } catch { return null; }
};
function palette(ndvi: number): [number, number, number, number] {
  if (ndvi < -0.05) return [104, 82, 158, 220];
  if (ndvi < 0.10) return [166, 66, 58, 235];
  if (ndvi < 0.20) return [214, 126, 55, 235];
  if (ndvi < 0.35) return [231, 192, 76, 240];
  if (ndvi < 0.50) return [161, 197, 81, 245];
  if (ndvi < 0.65) return [76, 166, 83, 250];
  return [24, 112, 58, 255];
}
Deno.serve(async (req: Request) => {
  let diagnosticStage = "request";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("authorization");
  if (!authorization) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json(500, { error: "server_configuration_error" });
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: authData, error: authError } = await db.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });
    diagnosticStage = "parse_request";
    let body: any;
    try {
      body = await readBoundedJson(req, MAX_REQUEST_BYTES);
    } catch (bodyError) {
      if (bodyError instanceof Error && bodyError.message === "json_body_too_large") {
        return json(413, { error: "request_body_too_large", max_bytes: MAX_REQUEST_BYTES });
      }
      return json(400, { error: "invalid_json_body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json_body" });
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const date = body.date;
    if (!locationId) return json(400, { error: "location_id_required" });
    if (!validDate(date) || Date.parse(date + "T00:00:00Z") >= Date.now()) return json(422, { error: "past_valid_date_required" });
    const displayMode = ["ndvi", "true_color", "false_color"].includes(body.mode) ? body.mode : "ndvi";
    const { data: loc, error: locError } = await db.from("locations").select("id,latitude,longitude").eq("id", locationId).maybeSingle();
    if (locError || !loc) return json(404, { error: "location_not_found_or_access_denied" });
    if (typeof loc.latitude !== "number" || typeof loc.longitude !== "number" || loc.latitude < -90 || loc.latitude > 90 || loc.longitude < -180 || loc.longitude > 180) {
      return json(422, { error: "valid_location_coordinates_required" });
    }

    // Rough 1.1 km study window; never presented as a parcel boundary.
    const halfLat = 0.005;
    const halfLon = Math.min(0.01, halfLat / Math.max(0.2, Math.cos(loc.latitude * Math.PI / 180)));
    const west = Math.max(-180, loc.longitude - halfLon), east = Math.min(180, loc.longitude + halfLon);
    const south = Math.max(-90, loc.latitude - halfLat), north = Math.min(90, loc.latitude + halfLat);
    const stac = new URL("https://earth-search.aws.element84.com/v1/search");
    stac.searchParams.set("collections", "sentinel-2-l2a");
    stac.searchParams.set("bbox", [west, south, east, north].join(","));
    stac.searchParams.set("datetime", date + "T00:00:00Z/" + date + "T23:59:59Z");
    stac.searchParams.set("limit", "10");
    stac.searchParams.set("sortby", "-properties.eo:cloud_cover");
    stac.searchParams.set("query", JSON.stringify({ "eo:cloud_cover": { "lte": 80 } }));
    diagnosticStage = "search_stac";
    const searchResponse = await fetch(stac, { signal: AbortSignal.timeout(18000), headers: { Accept: "application/geo+json" } });
    if (!searchResponse.ok) return json(502, { error: "earth_search_catalogue_unavailable", upstream_status: searchResponse.status });
    let searchData: any;
    try {
      searchData = await readBoundedJson(searchResponse, MAX_STAC_RESPONSE_BYTES);
    } catch (stacError) {
      if (stacError instanceof Error && stacError.message === "json_body_too_large") return json(502, { error: "earth_search_catalogue_response_too_large" });
      return json(502, { error: "earth_search_catalogue_invalid_json" });
    }
    const features = Array.isArray(searchData?.features) ? searchData.features : [];
    if (!features.length) return json(404, { error: "no_sentinel2_scene_for_date", date, detail: "No Sentinel-2 L2A scene intersects this location on the selected date. Try a nearby acquisition date." });

    diagnosticStage = "select_scene";
    const feature = features.sort((a: any, b: any) =>
      Number(a?.properties?.["eo:cloud_cover"] ?? 101) - Number(b?.properties?.["eo:cloud_cover"] ?? 101)
    )[0];
    const assets = feature?.assets ?? {};
    const redUrl = safeCogUrl(assets.red?.href ?? assets.B04?.href);
    const nirUrl = safeCogUrl(assets.nir?.href ?? assets.B08?.href);
    const greenUrl = safeCogUrl(assets.green?.href ?? assets.B03?.href);
    const blueUrl = safeCogUrl(assets.blue?.href ?? assets.B02?.href);
    if (!redUrl || !nirUrl || (displayMode !== "ndvi" && !greenUrl) || (displayMode === "true_color" && !blueUrl)) {
      console.error("[earth-search-sentinel2-ndvi] missing red/nir COG assets", Object.keys(assets));
      return json(502, { error: "sentinel2_red_nir_assets_unavailable" });
    }

    // Read only the raster window intersecting the site, not the whole Sentinel tile.
    diagnosticStage = "open_red_nir_cogs";
    const [redTif, nirTif] = await Promise.all([
      fromUrl(redUrl, { allowFullFile: false }),
      fromUrl(nirUrl, { allowFullFile: false }),
    ]);
    diagnosticStage = "read_geotiff_metadata";
    const [redImage, nirImage] = await Promise.all([redTif.getImage(), nirTif.getImage()]);
    const greenTif = displayMode !== "ndvi" ? await fromUrl(greenUrl!, { allowFullFile: false }) : null;
    const blueTif = displayMode === "true_color" ? await fromUrl(blueUrl!, { allowFullFile: false }) : null;
    const greenImage = greenTif ? await greenTif.getImage() : null;
    const blueImage = blueTif ? await blueTif.getImage() : null;
    diagnosticStage = "project_raster_window";
    const redKeys = redImage.getGeoKeys() ?? {};
    const nirKeys = nirImage.getGeoKeys() ?? {};
    const epsg = Number(redKeys.ProjectedCSTypeGeoKey ?? redKeys.GeographicTypeGeoKey ?? feature?.properties?.["proj:epsg"]);
    if (!Number.isFinite(epsg) || epsg <= 0 || epsg === 32767) return json(502, { error: "sentinel2_projection_metadata_missing" });
    const crs = "EPSG:" + epsg;
    // proj4js does not ship every EPSG definition. Sentinel-2 COGs around
    // Sétif commonly use UTM zone 31N (EPSG:32631), so register UTM CRS
    // definitions explicitly before attempting the coordinate transform.
    if (!proj4.defs(crs)) {
      const northUtm = epsg >= 32601 && epsg <= 32660;
      const southUtm = epsg >= 32701 && epsg <= 32760;
      if (northUtm || southUtm) {
        const zone = epsg - (northUtm ? 32600 : 32700);
        proj4.defs(crs, "+proj=utm +zone=" + zone + (southUtm ? " +south" : "") + " +datum=WGS84 +units=m +no_defs +type=crs");
      }
    }
    if (!proj4.defs(crs)) return json(502, { error: "sentinel2_projection_unsupported", epsg });
    const project = (lon: number, lat: number) => proj4("EPSG:4326", crs, [lon, lat]);
    const corners = [project(west, south), project(west, north), project(east, south), project(east, north)];
    const minX = Math.min(...corners.map((p: number[]) => p[0]));
    const maxX = Math.max(...corners.map((p: number[]) => p[0]));
    const minY = Math.min(...corners.map((p: number[]) => p[1]));
    const maxY = Math.max(...corners.map((p: number[]) => p[1]));
    const makeWindow = (img: any) => {
      const [originX, originY] = img.getOrigin();
      const [resX, resY] = img.getResolution();
      if (!Number.isFinite(originX) || !Number.isFinite(originY) || !Number.isFinite(resX) || !Number.isFinite(resY) || resX === 0 || resY === 0) throw new Error("raster_transform_invalid");
      const colA = (minX - originX) / resX, colB = (maxX - originX) / resX;
      const rowA = (minY - originY) / resY, rowB = (maxY - originY) / resY;
      const width = img.getWidth(), height = img.getHeight();
      const x0 = clamp(Math.floor(Math.min(colA, colB)), 0, width - 1);
      const x1 = clamp(Math.ceil(Math.max(colA, colB)), x0 + 1, width);
      const y0 = clamp(Math.floor(Math.min(rowA, rowB)), 0, height - 1);
      const y1 = clamp(Math.ceil(Math.max(rowA, rowB)), y0 + 1, height);
      return { window: [x0, y0, x1, y1] as [number, number, number, number], originX, originY, resX, resY };
    };
    const redWin = makeWindow(redImage);
    const nirWin = makeWindow(nirImage);
    const greenWin = greenImage ? makeWindow(greenImage) : null;
    const blueWin = blueImage ? makeWindow(blueImage) : null;
    const redWidth = redWin.window[2] - redWin.window[0], redHeight = redWin.window[3] - redWin.window[1];
    const nirWidth = nirWin.window[2] - nirWin.window[0], nirHeight = nirWin.window[3] - nirWin.window[1];
    if (redWidth < 2 || redHeight < 2 || nirWidth < 2 || nirHeight < 2 || redWidth * redHeight > 2_000_000 || nirWidth * nirHeight > 2_000_000) {
      return json(422, { error: "raster_window_invalid_or_too_large" });
    }
    diagnosticStage = "read_raster_windows";
    const [redRaster, nirRaster, greenRaster, blueRaster] = await Promise.all([
      redImage.readRasters({ window: redWin.window, samples: [0], interleave: true }),
      nirImage.readRasters({ window: nirWin.window, samples: [0], interleave: true }),
      greenImage && greenWin ? greenImage.readRasters({ window: greenWin.window, samples: [0], interleave: true }) : Promise.resolve(null),
      blueImage && blueWin ? blueImage.readRasters({ window: blueWin.window, samples: [0], interleave: true }) : Promise.resolve(null),
    ]);
    // SCL is a 20 m classification raster. Mask cloud/shadow/snow classes when available.
    let sclRaster: any = null, sclWin: any = null, sclWidth = 0, sclHeight = 0;
    let cloudMaskApplied = false;
    const sclUrl = safeCogUrl(assets.scl?.href);
    if (sclUrl) {
      try {
        const sclTif = await fromUrl(sclUrl, { allowFullFile: false });
        const sclImage = await sclTif.getImage();
        sclWin = makeWindow(sclImage);
        sclWidth = sclWin.window[2] - sclWin.window[0];
        sclHeight = sclWin.window[3] - sclWin.window[1];
        if (sclWidth > 0 && sclHeight > 0 && sclWidth * sclHeight <= 1_000_000) {
          sclRaster = await sclImage.readRasters({ window: sclWin.window, samples: [0], interleave: true });
          cloudMaskApplied = true;
        }
      } catch (maskError) {
        console.warn("[earth-search-sentinel2-ndvi] SCL mask unavailable; continuing without cloud mask",
          maskError instanceof Error ? maskError.message.slice(0, 120) : "unknown");
      }
    }
    const width = 512, height = 512;
    const png = new PNG({ width, height, colorType: 6 });
    let valid = 0, sum = 0, min = 1, max = -1;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const i = (py * width + px) * 4;
        // Sample corresponding positions in each band; bands are both nominally 10 m.
        const rx = Math.min(redWidth - 1, Math.floor(px * redWidth / width));
        const ry = Math.min(redHeight - 1, Math.floor(py * redHeight / height));
        const nx = Math.min(nirWidth - 1, Math.floor(px * nirWidth / width));
        const ny = Math.min(nirHeight - 1, Math.floor(py * nirHeight / height));
        if (cloudMaskApplied && sclRaster && sclWin) {
          const mapX = minX + (px + 0.5) * (maxX - minX) / width;
          const mapY = maxY - (py + 0.5) * (maxY - minY) / height;
          const sc = Math.floor((mapX - sclWin.originX) / sclWin.resX) - sclWin.window[0];
          const sr = Math.floor((mapY - sclWin.originY) / sclWin.resY) - sclWin.window[1];
          if (sc < 0 || sr < 0 || sc >= sclWidth || sr >= sclHeight) {
            png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
            continue;
          }
          const classification = Number(sclRaster[sr * sclWidth + sc]);
          // SCL: 0 no data, 1 saturated/defective, 3 cloud shadow, 8/9 clouds,
          // 10 cirrus and 11 snow/ice. Leave class 2 (dark area) and 7 (unclassified) visible.
          if ([0, 1, 3, 8, 9, 10, 11].includes(classification)) {
            png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
            continue;
          }
        }
        const red = Number((redRaster as any)[ry * redWidth + rx]);
        const nir = Number((nirRaster as any)[ny * nirWidth + nx]);
        const denom = nir + red;
        if (!Number.isFinite(red) || !Number.isFinite(nir) || red <= 0 || nir <= 0 || denom <= 0) {
          png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
          continue;
        }
        const ndvi = clamp((nir - red) / denom, -1, 1);
        if (displayMode === "ndvi") {
          const c = palette(ndvi);
          png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = c[3];
        } else {
          const gx = Math.min((greenWin!.window[2] - greenWin!.window[0]) - 1, Math.floor(px * (greenWin!.window[2] - greenWin!.window[0]) / width));
          const gy = Math.min((greenWin!.window[3] - greenWin!.window[1]) - 1, Math.floor(py * (greenWin!.window[3] - greenWin!.window[1]) / height));
          const green = Number((greenRaster as any)[gy * (greenWin!.window[2] - greenWin!.window[0]) + gx]);
          const blue = displayMode === "true_color" ? Number((blueRaster as any)[Math.min((blueWin!.window[3]-blueWin!.window[1])-1,Math.floor(py*(blueWin!.window[3]-blueWin!.window[1])/height)) * (blueWin!.window[2]-blueWin!.window[0]) + Math.min((blueWin!.window[2]-blueWin!.window[0])-1,Math.floor(px*(blueWin!.window[2]-blueWin!.window[0])/width))]) : green;
          const stretch = (v: number) => Math.round(255 * Math.pow(clamp(v / 3500, 0, 1), 0.72));
          const rgb = displayMode === "true_color" ? [stretch(red), stretch(green), stretch(blue)] : [stretch(nir), stretch(red), stretch(green)];
          png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2]; png.data[i + 3] = 255;
        }
        valid++; sum += ndvi; min = Math.min(min, ndvi); max = Math.max(max, ndvi);
      }
    }
    if (!valid) return json(422, { error: "ndvi_no_valid_pixels" });
    diagnosticStage = "encode_png";
    const pngBuffer = PNG.sync.write(png);
    if (pngBuffer.byteLength > 5_000_000) return json(502, { error: "ndvi_png_size_invalid" });
    const stats = { display_mode: displayMode, valid_pixel_percent: Math.round(valid / (width * height) * 1000) / 10, mean_ndvi: Math.round(sum / valid * 1000) / 1000, min_ndvi: Math.round(min * 1000) / 1000, max_ndvi: Math.round(max * 1000) / 1000, cloud_cover_scene_percent: Number(feature?.properties?.["eo:cloud_cover"] ?? NaN), cloud_mask_applied: cloudMaskApplied };
    return new Response(pngBuffer, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "image/png", "Cache-Control": "private, max-age=900",
        "X-Geo-Bounds": [west, south, east, north].join(","),
        "X-Image-Date": String(feature?.properties?.datetime ?? date),
        "X-Image-Source": "Sentinel-2 L2A public COG; mode=" + displayMode + "; SCL cloud mask when available",
        "X-NDVI-Stats": JSON.stringify(stats),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : (typeof e === "string" ? e : (() => { try { return JSON.stringify(e); } catch { return String(e); } })());
    console.error("[earth-search-sentinel2-ndvi-preview] failed", JSON.stringify({ stage: diagnosticStage, error: message.slice(0, 400), errorType: typeof e }));
    const lower = message.toLowerCase();
    if (lower.includes("timeout")) return json(504, { error: "earth_search_raster_timeout" });
    if (lower.includes("not found") || lower.includes("404")) return json(502, { error: "sentinel2_cog_asset_not_found" });
    return json(500, { error: "ndvi_raster_processing_failed" });
  }
});
