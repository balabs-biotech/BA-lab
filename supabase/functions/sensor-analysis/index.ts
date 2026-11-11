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
const MAX_TEMPORAL_WINDOW_SECONDS = 30 * 24 * 60 * 60;
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

function localCalendarDate(value: string, timezone: string): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("invalid_measurement_timestamp");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
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
    const subjectId = body.subject_id;
    if (subjectId !== undefined && (typeof subjectId !== "string" || !UUID_RE.test(subjectId))) {
      return reply(400, { error: "subject_id_must_be_a_valid_uuid" });
    }

    const expectedInterval = body.expected_interval_seconds;
    if (expectedInterval !== undefined &&
        (!Number.isSafeInteger(expectedInterval) || expectedInterval <= 0)) {
      return reply(422, { error: "expected_interval_seconds_must_be_positive_integer" });
    }

    const transmissionExpectedInterval = body.transmission_expected_interval_seconds;
    const transmissionGapToleranceFactor = body.transmission_gap_tolerance_factor;
    const transmissionOptions = [
      transmissionExpectedInterval, transmissionGapToleranceFactor,
    ];
    if (transmissionOptions.some((value) => value !== undefined)) {
      if (
        !Number.isSafeInteger(transmissionExpectedInterval) ||
        transmissionExpectedInterval <= 0 ||
        transmissionExpectedInterval > MAX_TEMPORAL_WINDOW_SECONDS ||
        typeof transmissionGapToleranceFactor !== "number" ||
        !Number.isFinite(transmissionGapToleranceFactor) ||
        transmissionGapToleranceFactor <= 1 ||
        transmissionGapToleranceFactor > 10
      ) {
        return reply(422, { error: "transmission_diagnostics_parameters_must_be_supplied_together_and_within_limits" });
      }
    }

    const flatlineMinimumObservations = body.flatline_minimum_repeated_observations;
    const flatlineMinimumDurationSeconds = body.flatline_minimum_duration_seconds;
    const flatlineOptions = [flatlineMinimumObservations, flatlineMinimumDurationSeconds];
    if (flatlineOptions.some((value) => value !== undefined)) {
      if (
        !Number.isSafeInteger(flatlineMinimumObservations) ||
        flatlineMinimumObservations < 2 || flatlineMinimumObservations > MAX_ROWS ||
        !Number.isSafeInteger(flatlineMinimumDurationSeconds) ||
        flatlineMinimumDurationSeconds <= 0 ||
        flatlineMinimumDurationSeconds > MAX_TEMPORAL_WINDOW_SECONDS
      ) {
        return reply(422, { error: "flatline_diagnostic_parameters_must_be_supplied_together_and_within_limits" });
      }
    }

    const temporalWindowSeconds = body.temporal_window_seconds;
    const temporalMinimumHistory = body.temporal_minimum_history;
    const temporalThreshold = body.temporal_threshold;
    const temporalOptions = [
      temporalWindowSeconds, temporalMinimumHistory, temporalThreshold,
    ];
    if (temporalOptions.some((value) => value !== undefined)) {
      if (
        !Number.isSafeInteger(temporalWindowSeconds) || temporalWindowSeconds <= 0 ||
        temporalWindowSeconds > MAX_TEMPORAL_WINDOW_SECONDS ||
        !Number.isSafeInteger(temporalMinimumHistory) || temporalMinimumHistory <= 0 ||
        typeof temporalThreshold !== "number" || !Number.isFinite(temporalThreshold) ||
        temporalThreshold <= 0
      ) {
        return reply(422, { error: "temporal_screening_parameters_must_be_supplied_together_and_positive" });
      }
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

    let transmissionDevicePayload: Record<string, unknown>[] | undefined;
    if (transmissionExpectedInterval !== undefined) {
      const { data: devices, error: devicesError } = await adminClient
        .from("iot_devices")
        .select("id,organization_id,environment_id,device_code,enabled,created_at,last_seen_at")
        .eq("organization_id", profile.organization_id)
        .eq("environment_id", environmentId)
        .in("id", sensorIds)
        .limit(101);
      if (devicesError) {
        console.error("[sensor-analysis] Device registry lookup failed", devicesError.message);
        return reply(500, { error: "sensor_device_registry_lookup_failed" });
      }
      if (!devices || devices.length !== sensorIds.length || devices.length > 100 ||
          devices.some((device: any) =>
            device.organization_id !== profile.organization_id ||
            device.environment_id !== environmentId ||
            !sensorIds.includes(device.id)
          )) {
        return reply(422, { error: "sensor_device_registry_profile_binding_mismatch" });
      }
      transmissionDevicePayload = devices.map((device: any) => ({
        device_id: device.id,
        device_code: device.device_code,
        enabled: device.enabled,
        created_at: device.created_at,
        profile_bound: sensorIds.includes(device.id),
        expected_from: profile.valid_from,
        expected_to: profile.valid_to,
        last_seen_at: device.last_seen_at,
      }));
    }

    let biologicalInterpretationPayload: Record<string, unknown> | undefined;
    if (subjectId !== undefined) {
      const { data: contexts, error: contextError } = await adminClient
        .from("biological_contexts")
        .select(
          "id,organization_id,domain,culture_id,plant_culture_id,environment_id,organism_kind,taxon_code,strain_code,cultivar_code,culture_stage,substrate_code,production_system,context_tags,valid_from,valid_to," +
          "environment:environments!biological_contexts_environment_fk(id,location_id)",
        )
        .eq("organization_id", profile.organization_id)
        .eq("environment_id", environmentId)
        .or(`culture_id.eq.${subjectId},plant_culture_id.eq.${subjectId}`)
        .lte("valid_from", fromDate)
        .or(`valid_to.is.null,valid_to.gte.${toDate}`)
        .order("valid_from", { ascending: false })
        .limit(2);
      if (contextError) {
        console.error("[sensor-analysis] Biological context lookup failed", contextError.message);
        return reply(500, { error: "biological_context_lookup_failed" });
      }
      if (!contexts?.length) return reply(422, { error: "biological_context_unavailable_for_subject_and_scope" });
      if (contexts.length !== 1) return reply(422, { error: "ambiguous_biological_context_for_subject_and_scope" });

      const biological = contexts[0];
      const resolvedSubjectId = biological.culture_id ?? biological.plant_culture_id;
      const biologicalLocationId = biological.environment?.location_id;
      if (
        resolvedSubjectId !== subjectId ||
        biological.organization_id !== profile.organization_id ||
        biological.environment_id !== environmentId ||
        biologicalLocationId !== locationId ||
        biological.valid_from > fromDate ||
        (biological.valid_to && biological.valid_to < toDate)
      ) {
        return reply(422, { error: "biological_context_binding_or_validity_mismatch" });
      }

      const { data: domainProfiles, error: domainProfileError } = await adminClient
        .from("domain_interpretation_profiles")
        .select("id,organization_id,domain,profile_code,profile_version,rules,valid_from,valid_to,status")
        .eq("organization_id", profile.organization_id)
        .eq("domain", biological.domain)
        .in("status", ["active", "retired"])
        .lte("valid_from", fromDate)
        .or(`valid_to.is.null,valid_to.gte.${toDate}`)
        .order("valid_from", { ascending: false })
        .limit(2);
      if (domainProfileError) {
        console.error("[sensor-analysis] Domain profile lookup failed", domainProfileError.message);
        return reply(500, { error: "domain_interpretation_profile_lookup_failed" });
      }
      if (!domainProfiles?.length) return reply(422, { error: "domain_interpretation_profile_unavailable" });
      if (domainProfiles.length !== 1) return reply(422, { error: "ambiguous_domain_interpretation_profile" });
      const domainProfile = domainProfiles[0];
      if (
        domainProfile.domain !== biological.domain ||
        domainProfile.valid_from > fromDate ||
        (domainProfile.valid_to && domainProfile.valid_to < toDate)
      ) {
        return reply(422, { error: "domain_interpretation_profile_scope_mismatch" });
      }

      biologicalInterpretationPayload = {
        biological_context: {
          context_id: biological.id,
          subject_id: resolvedSubjectId,
          organization_id: biological.organization_id,
          location_id: biologicalLocationId,
          environment_context_id: biological.environment_id,
          domain: biological.domain,
          organism_kind: biological.organism_kind,
          taxon_code: biological.taxon_code,
          strain_code: biological.strain_code,
          cultivar_code: biological.cultivar_code,
          culture_stage: biological.culture_stage,
          substrate_code: biological.substrate_code,
          production_system: biological.production_system,
          context_tags: biological.context_tags ?? [],
          valid_from: biological.valid_from,
          valid_to: biological.valid_to,
        },
        environment_context: {
          context_id: environmentId,
          organization_id: profile.organization_id,
          location_id: locationId,
          context_type: profile.context_type,
          label: profile.label,
          timezone: profile.timezone,
          origin: profile.origin,
          sensor_ids: sensorIds,
          profile_code: profile.profile_code,
          profile_version: profile.profile_version,
        },
        domain_profile: {
          profile_id: domainProfile.profile_code,
          module: domainProfile.domain,
          version: domainProfile.profile_version,
          rules: domainProfile.rules ?? [],
        },
      };
    }

    // Query with a one-day UTC guard band on both sides. The engine applies the
    // exact local-calendar window using the profile IANA timezone.
    const historyGuardDays = temporalWindowSeconds === undefined
      ? 1
      : Math.ceil(temporalWindowSeconds / 86_400) + 1;
    const queryFrom = addDays(fromDate, -historyGuardDays) + "T00:00:00.000Z";
    const queryTo = addDays(toDate, 2) + "T00:00:00.000Z";
    let transmissionReceiptPayload: Record<string, unknown>[] | undefined;
    if (transmissionExpectedInterval !== undefined) {
      const { data: receipts, error: receiptsError } = await adminClient
        .from("iot_ingest_receipts")
        .select("id,device_id,received_at")
        .in("device_id", sensorIds)
        .gte("received_at", queryFrom)
        .lt("received_at", queryTo)
        .order("received_at", { ascending: true })
        .limit(MAX_ROWS + 1);
      if (receiptsError) {
        console.error("[sensor-analysis] Ingestion receipt lookup failed", receiptsError.message);
        return reply(500, { error: "sensor_receipt_lookup_failed" });
      }
      if (!receipts || receipts.length > MAX_ROWS) {
        return reply(422, { error: "sensor_receipt_limit_reached_narrow_date_range" });
      }
      transmissionReceiptPayload = receipts.map((receipt: any) => ({
        receipt_id: receipt.id,
        device_id: receipt.device_id,
        received_at: receipt.received_at,
      }));
    }
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
    if (!rows?.length && transmissionExpectedInterval === undefined) {
      return reply(422, { error: "no_sensor_measurements_in_scope" });
    }
    if (rows.length > MAX_ROWS) return reply(422, { error: "sensor_observation_limit_reached_narrow_date_range" });

    // A historical screening guard band may cross the profile's validity dates.
    // Keep only readings whose local calendar date belongs to this exact profile.
    const profileScopedRows = (rows ?? []).filter((row: any) => {
      const localDate = localCalendarDate(row.measured_at, profile.timezone);
      return localDate >= profile.valid_from &&
        (profile.valid_to === null || localDate <= profile.valid_to);
    });
    if (!profileScopedRows.length && transmissionExpectedInterval === undefined) {
      return reply(422, { error: "no_sensor_measurements_in_profile_validity" });
    }

    const sensorMeasurements = profileScopedRows.map((row: any) => ({
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
        transmission_expected_interval_seconds: transmissionExpectedInterval,
        transmission_gap_tolerance_factor: transmissionGapToleranceFactor,
        transmission_current_window: transmissionExpectedInterval !== undefined &&
          toDate === localCalendarDate(new Date().toISOString(), profile.timezone),
        transmission_devices: transmissionDevicePayload,
        transmission_receipts: transmissionReceiptPayload,
        temporal_window_seconds: temporalWindowSeconds,
        temporal_minimum_history: temporalMinimumHistory,
        temporal_threshold: temporalThreshold,
        flatline_minimum_repeated_observations: flatlineMinimumObservations,
        flatline_minimum_duration_seconds: flatlineMinimumDurationSeconds,
        biological_interpretation: biologicalInterpretationPayload,
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
    let signalPersistenceStatus = "not_requested";
    const signals = Array.isArray(result.domain_interpretation?.signals)
      ? result.domain_interpretation.signals
      : [];
    if (biologicalInterpretationPayload && result.interpretation_status === "interpreted") {
      if (signals.length > 0) {
        const biological = biologicalInterpretationPayload.biological_context as Record<string, any>;
        const environment = biologicalInterpretationPayload.environment_context as Record<string, any>;
        const domainProfile = biologicalInterpretationPayload.domain_profile as Record<string, any>;
        const signalRows = signals.map((signal: Record<string, any>) => ({
          organization_id: profile.organization_id,
          signal_id: signal.signal_id,
          domain: biological.domain,
          signal_code: signal.signal_code,
          severity: signal.severity,
          message_code: signal.message_code,
          recommendation_code: signal.recommendation_code ?? null,
          rule_id: signal.rule_id,
          source_analysis_id: signal.source_analysis_id ?? result.analysis_id,
          source_finding_id: signal.source_finding_id,
          biological_context_id: signal.biological_context_id ?? biological.context_id,
          biological_subject_id: signal.biological_subject_id ?? biological.subject_id,
          environment_id: signal.environment_context_id ?? environment.context_id,
          domain_profile_code: domainProfile.profile_id,
          domain_profile_version: domainProfile.version,
          environment_profile_code: environment.profile_code,
          environment_profile_version: environment.profile_version,
          variable_code: signal.variable_code,
          observed_date: signal.observed_date,
          observed_value: signal.observed_value ?? null,
          unit: signal.unit,
          finding_status: signal.finding_status,
          source_observation_ids: signal.source_observation_ids ?? [],
          context_tags: signal.context_tags ?? [],
          analysis_method: signal.evidence?.assessment_type === "causal_robust_temporal_screen"
            ? "sensor_temporal"
            : "sensor_series",
          analysis_evidence: signal.evidence ?? {},
        }));

        const { error: signalPersistenceError } = await adminClient
          .from("biological_signals")
          .upsert(signalRows, {
            onConflict: "organization_id,source_analysis_id,source_finding_id,rule_id,biological_context_id,domain_profile_code,domain_profile_version,environment_profile_code,environment_profile_version",
            ignoreDuplicates: true,
          });
        if (signalPersistenceError) {
          console.error("[sensor-analysis] Biological signal persistence failed", signalPersistenceError.message);
          return reply(500, { error: "biological_signal_persistence_failed" });
        }
        signalPersistenceStatus = "persisted";
      } else {
        signalPersistenceStatus = "no_signals";
      }
    }

    return reply(200, {
      ok: true,
      analysis: {
        ...result,
        signal_persistence_status: signalPersistenceStatus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[sensor-analysis] Request failed", message);
    if (message.toLowerCase().includes("timeout")) return reply(504, { error: "sensor_analysis_timeout" });
    return reply(500, { error: "internal_error" });
  }
});
