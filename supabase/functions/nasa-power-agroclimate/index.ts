// SPDX-License-Identifier: MIT
// Server-side import of NASA POWER daily agroclimate data.
// External gridded estimates remain separate from manual measurements and IoT telemetry.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const PARAMETERS = {
  T2M: { variable: "air_temperature_mean", unit: "degC", resolution: 55_000 },
  T2M_MAX: { variable: "air_temperature_max", unit: "degC", resolution: 55_000 },
  T2M_MIN: { variable: "air_temperature_min", unit: "degC", resolution: 55_000 },
  PRECTOTCORR: { variable: "precipitation_corrected", unit: "mm/day", resolution: 55_000 },
  ALLSKY_SFC_SW_DWN: { variable: "solar_radiation_all_sky", unit: "kWh/m2/day", resolution: 111_000 },
  RH2M: { variable: "relative_humidity_mean", unit: "%", resolution: 55_000 },
  WS2M: { variable: "wind_speed_mean", unit: "m/s", resolution: 55_000 },
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isDate(value: unknown): value is string {
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
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceKey) {
    console.error("[nasa-power-agroclimate] Supabase server configuration is incomplete");
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "invalid_json_body" });
    const locationId = typeof body.location_id === "string" ? body.location_id : "";
    const startDate = body.start_date;
    const endDate = body.end_date;
    const forceRefresh = body.refresh === true;
    if (!locationId) return json(400, { error: "location_id_required" });
    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) {
      return json(400, { error: "valid_start_date_and_end_date_required" });
    }

    const startMs = Date.parse(startDate + "T00:00:00Z");
    const endMs = Date.parse(endDate + "T00:00:00Z");
    const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;
    if (dayCount > MAX_DAYS) return json(422, { error: "date_range_exceeds_366_days" });
    if (endMs > Date.now() + DAY_MS) return json(422, { error: "end_date_too_far_in_future" });

    // The user-scoped query verifies that this location belongs to an organization
    // the caller can access before the service role is used.
    const { data: location, error: locationError } = await userClient
      .from("locations")
      .select("id, organization_id, name, latitude, longitude, coordinate_accuracy_m, coordinate_source")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError || !location) return json(404, { error: "location_not_found_or_access_denied" });
    if (typeof location.latitude !== "number" || typeof location.longitude !== "number") {
      return json(422, { error: "location_coordinates_required" });
    }

    const observedStart = startDate + "T00:00:00.000Z";
    const observedEnd = endDate + "T23:59:59.999Z";
    if (!forceRefresh) {
      // A global row count can hide missing variables. Check each core series
      // independently; solar radiation is intentionally optional because its
      // upstream coverage can lag behind the other NASA POWER daily variables.
      const coreVariables = [
        "air_temperature_mean",
        "air_temperature_max",
        "air_temperature_min",
        "precipitation_corrected",
        "relative_humidity_mean",
        "wind_speed_mean",
      ];
      const now = Date.now();
      const recentPeriod = now - endMs <= 7 * DAY_MS;
      const freshAfterMs = now - 24 * 60 * 60 * 1000;
      const minimumDays = Math.max(1, Math.ceil(dayCount * 0.9));
      const coverage = await Promise.all(coreVariables.map(async (variable) => {
        const { data, error } = await userClient
          .from("environmental_observations")
          .select("observed_at,retrieved_at")
          .eq("location_id", location.id)
          .eq("provider_code", "NASA_POWER")
          .eq("dataset_code", "POWER_DAILY_AGRO")
          .eq("variable_code", variable)
          .gte("observed_at", observedStart)
          .lte("observed_at", observedEnd)
          .order("observed_at", { ascending: false })
          .limit(dayCount);
        if (error) return { variable, error: error.message, dates: [] as string[], latestRetrievedAt: null as string | null };
        const rows = data ?? [];
        const dates = [...new Set(rows.map((row) => String(row.observed_at).slice(0, 10)))];
        return { variable, error: null, dates, latestRetrievedAt: rows[0]?.retrieved_at ?? null };
      }));
      const failedLookup = coverage.find((item) => item.error !== null);
      if (failedLookup) {
        console.error("[nasa-power-agroclimate] Cache lookup failed", failedLookup.variable, failedLookup.error);
        return json(500, { error: "cache_lookup_failed" });
      }
      const complete = coverage.every((item) => {
        const latest = item.dates[0];
        const recentEnough = Boolean(latest) &&
          Date.parse(endDate + "T00:00:00Z") - Date.parse(latest + "T00:00:00Z") <= 2 * DAY_MS;
        // Historical ranges are stable enough to reuse. For a range ending in
        // the last seven days, require a fresh retrieval so recent revisions
        // and provider lag can be picked up without re-downloading old history.
        const latestIsFresh = !recentPeriod ||
          Boolean(item.latestRetrievedAt && Date.parse(item.latestRetrievedAt) >= freshAfterMs);
        return item.dates.length >= minimumDays && recentEnough && latestIsFresh;
      });
      if (complete) {
        return json(200, {
          ok: true, cached: true, provider: "NASA POWER", location_id: location.id,
          start_date: startDate, end_date: endDate,
          variables_checked: coreVariables.length,
          coverage_by_variable: coverage.map((item) => ({ variable: item.variable, days: item.dates.length })),
          note: "Cache récent vérifié variable par variable; le rayonnement solaire peut avoir une couverture distincte. Données estimées sur grille, pas des mesures locales.",
        });
      }
    }

    const powerStart = startDate.replaceAll("-", "");
    const powerEnd = endDate.replaceAll("-", "");
    const parameters = Object.keys(PARAMETERS).join(",");
    const sourceUrl = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
    sourceUrl.search = new URLSearchParams({
      parameters,
      community: "AG",
      longitude: String(location.longitude),
      latitude: String(location.latitude),
      start: powerStart,
      end: powerEnd,
      format: "JSON",
    }).toString();

    const upstream = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok) {
      console.error("[nasa-power-agroclimate] NASA POWER returned", upstream.status);
      return json(502, { error: "nasa_power_unavailable", upstream_status: upstream.status });
    }
    const payload = await upstream.json();
    const parameterData = payload?.properties?.parameter;
    if (!parameterData || typeof parameterData !== "object") {
      console.error("[nasa-power-agroclimate] Unexpected NASA POWER response structure");
      return json(502, { error: "nasa_power_response_invalid" });
    }

    const retrievedAt = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    for (const [parameter, definition] of Object.entries(PARAMETERS)) {
      const series = parameterData[parameter];
      if (!series || typeof series !== "object") continue;
      for (const [dateKey, rawValue] of Object.entries(series as Record<string, unknown>)) {
        if (!/^\d{8}$/.test(dateKey) || typeof rawValue !== "number" || !Number.isFinite(rawValue) || rawValue <= -900) continue;
        const date = dateKey.slice(0, 4) + "-" + dateKey.slice(4, 6) + "-" + dateKey.slice(6, 8);
        rows.push({
          organization_id: location.organization_id,
          location_id: location.id,
          data_family: "weather",
          provider_code: "NASA_POWER",
          dataset_code: "POWER_DAILY_AGRO",
          variable_code: definition.variable,
          value: rawValue,
          unit_code: definition.unit,
          observed_at: date + "T12:00:00.000Z",
          retrieved_at: retrievedAt,
          spatial_resolution_m: definition.resolution,
          quality_flag: "gridded_estimate",
          source_url: sourceUrl.toString(),
          metadata: {
            source_parameter: parameter,
            source_date: date,
            source_time_standard: "NASA POWER daily local solar time",
            coordinate_source: location.coordinate_source ?? null,
            coordinate_accuracy_m: location.coordinate_accuracy_m ?? null,
            spatial_resolution_note: parameter === "ALLSKY_SFC_SW_DWN"
              ? "Approximate solar grid scale; not parcel resolution"
              : "Approximate meteorological grid scale; not parcel resolution",
            provider_metadata: payload?.header ?? null,
          },
        });
      }
    }
    if (rows.length === 0) {
      return json(502, { error: "nasa_power_returned_no_valid_values" });
    }

    const { error: upsertError } = await adminClient
      .from("environmental_observations")
      .upsert(rows, {
        onConflict: "organization_id,location_id,provider_code,dataset_code,variable_code,observed_at",
        ignoreDuplicates: false,
      });
    if (upsertError) {
      console.error("[nasa-power-agroclimate] Observation upsert failed", upsertError.message);
      return json(500, { error: "observation_persistence_failed" });
    }

    return json(200, {
      ok: true, cached: false, provider: "NASA POWER", location_id: location.id,
      start_date: startDate, end_date: endDate, records: rows.length,
      variables: [...new Set(rows.map(row => row.variable_code))],
      note: "Données quotidiennes estimées sur grille; ce ne sont pas des mesures locales.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[nasa-power-agroclimate] Request failed", message);
    if (message.includes("timed out") || message.includes("Timeout")) return json(504, { error: "nasa_power_timeout" });
    return json(500, { error: "internal_error" });
  }
});
