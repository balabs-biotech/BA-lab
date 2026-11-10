// SPDX-License-Identifier: MIT
// Authenticated gateway for the independent IoT Sensor Engine.
// All service-role reads happen only after the caller JWT and organization membership are checked.
import { createClient } from "npm:@supabase/supabase-js@2";

const HEADERS = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Vary": "Origin",
};
const MAX_DAYS = 366;
const MAX_ROWS = 5_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value: string, amount: number): string {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  return new Promise(async (resolve, reject) => {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > maxBytes) return reject(new Error("payload_too_large"));
    if (!req.body) return reject(new Error("invalid_json_body"));
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
          return reject(new Error("payload_too_large"));
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      reject(new Error("invalid_json_body"));
    } finally {
      reader.releaseLock();
    }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const allowedOrigins = new Set(
    (Deno.env.get("BA_ENVIRONMENTAL_ALLOWED_ORIGINS") ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
  if (origin && !allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403, headers: HEADERS,
    });
  }
  const headers = new Headers(HEADERS);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return reply(401, { error: "bearer_token_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const engineUrl = Deno.env.get("BA_ENVIRONMENTAL_ENGINE_URL");
  const engineKey = Deno.env.get("BA_ENVIRONMENTAL_ENGINE_API_KEY");
  if (!supabaseUrl || !publishableKey || !serviceKey || !engineUrl || !engineKey) {
    console.error("[sensor-analysis] Server configuration is incomplete");
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
    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authData.user) return reply(401, { error: "invalid_session" });

    let body: any;
    try {
      body = await readBoundedJson(req, 8_000);
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_json_body";
      return reply(code === "payload_too_large" ? 413 : 400, { error: code });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply(400, { error: "invalid_json_body" });
    }

    const environmentId = body.environment_id;
    const fromDate = body.start_date;
    const toDate = body.end_date;
    if (typeof environmentId !== "string" || !UUID_RE.test(environmentId)) {
      return reply(400, { error: "valid_environment_id_required" });
    }
    if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) {
      return reply(400, { error: "valid_start_date_and_end_date_required" });
    }
    const dayCount = Math.floor((Date.parse(toDate + "T00:00:00Z") -
      Date.parse(fromDate + "T00:00:00Z")) / 86_400_000) + 1;
    if (dayCount > MAX_DAYS || Date.parse(toDate + "T00:00:00Z") > Date.now() + 86_400_000) {
      return reply(422, { error: "date_range_exceeds_supported_scope" });
    }
    const expectedInterval = body.expected_interval_seconds;
    if (expectedInterval !== undefined &&
        (!Number.isSafeInteger(expectedInterval) || expectedInterval <= 0)) {
      return reply(422, { error: "expected_interval_seconds_must_be_positive_integer" });
    }

    // RLS-scoped environment lookup and membership check precede every service-role read.
    const { data: authorizedEnvironment, error: environmentError } = await userClient
      .from("environments")
      .select("id,organization_id,location_id")
      .eq("id", environmentId)
      .maybeSingle();
    if (environmentError || !authorizedEnvironment) {
      return reply(404, { error: "environment_not_found_or_access_denied" });
    }
    if (!authorizedEnvironment.location_id) {
      return reply(422, { error: "sensor_environment_location_missing" });
    }
    const { data: membership, error: membershipError } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", authorizedEnvironment.organization_id)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError || !membership ||
        !["owner", "admin", "member", "viewer"].includes(String(membership.role))) {
      return reply(403, { error: "organization_membership_required" });
    }

    // Resolve a single profile covering the complete requested calendar window.
    const { data: profiles, error: profileError } = await adminClient
      .from("environment_context_profiles")
      .select(
        "id,organization_id,environment_id,profile_code,profile_version,context_type,label,timezone,origin,valid_from,valid_to,status," +
        "environment:environments!environment_context_profiles_environment_fk(id,location_id)," +
        "sensors:environment_context_profile_sensors!environment_context_profile_sensors_profile_fk(sensor_id)",
      )
      .eq("organization_id", authorizedEnvironment.organization_id)
      .eq("environment_id", environmentId)
      .eq("origin", "sensor")
      .in("status", ["active", "retired"])
      .lte("valid_from", fromDate)
      .or(`valid_to.is.null,valid_to.gte.${toDate}`)
      .order("valid_from", { ascending: false })
      .limit(2);
    if (profileError) {
      console.error("[sensor-analysis] Profile lookup failed", profileError.message);
      return reply(500, { error: "sensor_profile_lookup_failed" });
    }
    if (!profiles?.length) return reply(422, { error: "sensor_profile_unavailable" });
    if (profiles.length !== 1) return reply(422, { error: "ambiguous_sensor_profile" });
    const profile = profiles[0];
    if (profile.origin !== "sensor" || !["active", "retired"].includes(profile.status)) {
      return reply(422, { error: "sensor_profile_not_activated" });
    }
    if (profile.valid_from > fromDate || (profile.valid_to && profile.valid_to < toDate)) {
      return reply(422, { error: "sensor_profile_does_not_cover_scope" });
    }
    if (typeof profile.timezone !== "string" || !profile.timezone) {
      return reply(422, { error: "sensor_profile_timezone_missing" });
    }
    const locationId = profile.environment?.location_id;
    if (!locationId || locationId !== authorizedEnvironment.location_id ||
        profile.organization_id !== authorizedEnvironment.organization_id) {
      return reply(422, { error: "sensor_profile_environment_mismatch" });
    }

    const sensorIds = [...new Set((profile.sensors ?? [])
      .map((row: { sensor_id?: string }) => row.sensor_id)
      .filter((id: unknown): id is string => typeof id === "string" && UUID_RE.test(id)))];
    if (!sensorIds.length) return reply(422, { error: "sensor_profile_has_no_bound_devices" });

    // Query with a one-day UTC guard band on both sides. The engine applies the
    // exact local-calendar window using the profile IANA timezone.
    const queryFrom = addDays(fromDate, -1) + "T00:00:00.000Z";
    const queryTo = addDays(toDate, 2) + "T00:00:00.000Z";
    const { data: rows, error: rowsError } = await adminClient
      .from("measurements")
      .select(
        "id,organization_id,environment_id,iot_device_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,metadata," +
        "device:iot_devices!measurements_org_iot_device_fk(id,organization_id,environment_id,device_code,device_type)," +
        "environment:environments!measurements_org_environment_fk(id,organization_id,location_id)," +
        "variable:variables!measurements_variable_code_fkey(canonical_unit_code)",
      )
      .eq("organization_id", profile.organization_id)
      .eq("environment_id", environmentId)
      .in("iot_device_id", sensorIds)
      .eq("metadata->>source", "iot")
      .gte("measured_at", queryFrom)
      .lt("measured_at", queryTo)
      .order("measured_at", { ascending: true })
      .limit(MAX_ROWS + 1);
    if (rowsError) {
      console.error("[sensor-analysis] Measurement lookup failed", rowsError.message);
      return reply(500, { error: "sensor_measurement_lookup_failed" });
    }
    if (!rows?.length) return reply(422, { error: "no_sensor_measurements_in_scope" });
    if (rows.length > MAX_ROWS) return reply(422, { error: "sensor_observation_limit_reached_narrow_date_range" });

    const sensorMeasurements = rows.map((row: any) => ({
      ...row,
      device_organization_id: row.device?.organization_id,
      device_environment_id: row.device?.environment_id,
      environment_organization_id: row.environment?.organization_id,
      location_id: row.environment?.location_id,
      device_code: row.device?.device_code,
      device_type: row.device?.device_type,
      canonical_unit_code: row.variable?.canonical_unit_code,
      profile_origin: profile.origin,
      profile_status: profile.status,
      profile_valid_from: profile.valid_from,
      profile_valid_to: profile.valid_to,
      profile_timezone: profile.timezone,
      profile_sensor_bound: sensorIds.includes(row.iot_device_id),
    }));

    const endpoint = new URL("/v1/analyses/sensors", engineUrl);
    const engineResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-BA-Engine-Key": engineKey },
      body: JSON.stringify({
        analysis_id: crypto.randomUUID(),
        organization_id: profile.organization_id,
        environment_id: environmentId,
        from_date: fromDate,
        to_date: toDate,
        profile_timezone: profile.timezone,
        expected_interval_seconds: expectedInterval,
        measurements: sensorMeasurements,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!engineResponse.ok) {
      const detail = await engineResponse.text();
      console.error("[sensor-analysis] Private engine failed", engineResponse.status, detail.slice(0, 500));
      if (engineResponse.status === 422) {
        return reply(422, { error: "sensor_analysis_rejected", detail: "Sensor measurements did not satisfy the scientific input contract." });
      }
      return reply(502, { error: "sensor_engine_unavailable" });
    }
    const result = await engineResponse.json();
    return reply(200, { ok: true, analysis: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[sensor-analysis] Request failed", message);
    if (message.toLowerCase().includes("timeout")) return reply(504, { error: "sensor_analysis_timeout" });
    return reply(500, { error: "internal_error" });
  }
});
