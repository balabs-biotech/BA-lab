import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const PARAMETERS = {
  T2M: { variable: "air_temperature_mean", unit: "degC", resolution: 55000 },
  T2M_MAX: { variable: "air_temperature_max", unit: "degC", resolution: 55000 },
  T2M_MIN: { variable: "air_temperature_min", unit: "degC", resolution: 55000 },
  PRECTOTCORR: { variable: "precipitation_corrected", unit: "mm/day", resolution: 55000 },
  ALLSKY_SFC_SW_DWN: { variable: "solar_radiation_all_sky", unit: "kWh/m2/day", resolution: 111000 },
  ALLSKY_SFC_UV_INDEX: { variable: "uv_index_daily_mean", unit: "index", resolution: 111000 },
  RH2M: { variable: "relative_humidity_mean", unit: "%", resolution: 55000 },
  WS2M: { variable: "wind_speed_mean", unit: "m/s", resolution: 55000 },
};
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
const MAX_LOCATIONS_PER_RUN = 100;
const LOCATION_CONCURRENCY = 8;

async function readBoundedJson(response: Response, maxBytes = MAX_UPSTREAM_BYTES): Promise<any> {
  if (!response.body) throw new Error("empty_provider_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("provider_response_too_large");
        throw new Error("provider_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });
  const candidate = req.headers.get("x-ba-cron-secret") ?? "";
  if (candidate.length < 32) return response(401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return response(500, { error: "server_configuration_error" });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: verified, error: verifyError } = await db.rpc("verify_nasa_power_cron_secret", { p_candidate: candidate });
    if (verifyError || verified !== true) return response(401, { error: "unauthorized" });

    const end = new Date(Date.now() - 2 * 86400000);
    const start = new Date(end.getTime() - 13 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const startDate = fmt(start), endDate = fmt(end);
    const { data: locations, error: locationsError, count } = await db.from("locations")
      .select("id,organization_id,name,latitude,longitude,coordinate_accuracy_m,coordinate_source", { count: "exact" })
      .not("latitude", "is", null).not("longitude", "is", null)
      .gte("latitude", -90).lte("latitude", 90).gte("longitude", -180).lte("longitude", 180)
      .order("id", { ascending: true })
      .range(0, MAX_LOCATIONS_PER_RUN - 1);
    if (locationsError) throw new Error("locations_query_failed");
    const results: Record<string, unknown>[] = [];
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= (locations ?? []).length) return;
        const loc = locations![index];
      const sourceUrl = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
      sourceUrl.search = new URLSearchParams({
        parameters: Object.keys(PARAMETERS).join(","), community: "AG",
        longitude: String(loc.longitude), latitude: String(loc.latitude),
        start: startDate.replaceAll("-", ""), end: endDate.replaceAll("-", ""), format: "JSON",
      }).toString();
      try {
        const upstream = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
        if (!upstream.ok) { results.push({ location_id: loc.id, ok: false, error: "nasa_power_http_" + upstream.status }); continue; }
        const payload = await readBoundedJson(upstream);
        const series = payload?.properties?.parameter;
        if (!series || typeof series !== "object") { results.push({ location_id: loc.id, ok: false, error: "invalid_provider_response" }); continue; }
        const retrievedAt = new Date().toISOString();
        const rows: Record<string, unknown>[] = [];
        for (const [param, def] of Object.entries(PARAMETERS)) {
          const values = series[param];
          if (!values || typeof values !== "object") continue;
          for (const [keyDate, raw] of Object.entries(values as Record<string, unknown>)) {
            if (!/^\d{8}$/.test(keyDate) || typeof raw !== "number" || !Number.isFinite(raw) || raw <= -900) continue;
            const date = keyDate.slice(0,4) + "-" + keyDate.slice(4,6) + "-" + keyDate.slice(6,8);
            rows.push({
              organization_id: loc.organization_id, location_id: loc.id, data_family: "weather",
              provider_code: "NASA_POWER", dataset_code: "POWER_DAILY_AGRO",
              variable_code: def.variable, value: raw, unit_code: def.unit,
              observed_at: date + "T12:00:00.000Z", retrieved_at: retrievedAt,
              spatial_resolution_m: def.resolution, quality_flag: "gridded_estimate",
              source_url: sourceUrl.toString(),
              metadata: { source_parameter: param, source_date: date,
                source_time_standard: "NASA POWER daily local solar time",
                coordinate_source: loc.coordinate_source ?? null,
                coordinate_accuracy_m: loc.coordinate_accuracy_m ?? null,
                automation: "daily_cron_import", provider_metadata: payload?.header ?? null }
            });
          }
        }
        if (rows.length) {
          const { error } = await db.from("environmental_observations").upsert(rows, {
            onConflict: "organization_id,location_id,provider_code,dataset_code,variable_code,observed_at",
            ignoreDuplicates: false,
          });
          if (error) results.push({ location_id: loc.id, ok: false, error: "persistence_failed" });
          else results.push({ location_id: loc.id, ok: true, records: rows.length });
        } else results.push({ location_id: loc.id, ok: false, error: "no_valid_values" });
      } catch (e) {
        results.push({ location_id: loc.id, ok: false, error: e instanceof Error ? e.message : "unknown_error" });
      }
      }
    };
    await Promise.all(Array.from({ length: Math.min(LOCATION_CONCURRENCY, locations?.length ?? 0) }, () => worker()));
    const truncated = (locations?.length ?? 0) === MAX_LOCATIONS_PER_RUN && (locationsError === null);
    return response(200, { ok: results.every(r => r.ok === true) && !truncated, provider: "NASA POWER", range: { start: startDate, end: endDate }, locations_processed: results.length, locations_limit: MAX_LOCATIONS_PER_RUN, locations_total: count ?? null, possibly_truncated: (count ?? 0) > MAX_LOCATIONS_PER_RUN, results, note: "Daily gridded estimates; not local sensor measurements." });
  } catch (e) {
    console.error("[nasa-power-scheduled-import]", e instanceof Error ? e.message : "unknown_error");
    return response(500, { error: "scheduled_import_failed" });
  }
});