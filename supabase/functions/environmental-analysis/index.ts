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



type InterpretationResolution = {
  status: string;
  payload?: Record<string, unknown>;
};
type PersistedInterpretationStatus =
  | "observed_only"
  | "supporting_evidence"
  | "discordant_evidence"
  | "insufficient_evidence"
  | "requires_review";

function persistedInterpretationStatus(findingStatus: unknown): PersistedInterpretationStatus {
  switch (findingStatus) {
    case "normal":
      return "observed_only";
    case "insufficient_history":
    case "insufficient_coverage":
      return "insufficient_evidence";
    case "suspect":
    case "indeterminate":
    default:
      return "requires_review";
  }
}


async function resolveBiologicalInterpretation(
  adminClient: any,
  organizationId: string,
  locationId: string,
  domain: "mycology" | "greentech" | "lab",
  subjectId: string,
  startDate: string,
  endDate: string,
): Promise<InterpretationResolution> {
  const subjectColumn = domain === "greentech" ? "plant_culture_id" : "culture_id";
  const { data: contexts, error: contextError } = await adminClient
    .from("biological_contexts")
    .select("*,environment:environments!biological_contexts_environment_fk(location_id)")
    .eq("organization_id", organizationId)
    .eq("domain", domain)
    .eq(subjectColumn, subjectId)
    .lte("valid_from", startDate)
    .or(`valid_to.is.null,valid_to.gte.${endDate}`)
    .order("valid_from", { ascending: false })
    .limit(2);

  if (contextError) {
    console.error("[environmental-analysis] Biological context lookup failed", contextError.message);
    return { status: "context_lookup_failed" };
  }
  if (!contexts?.length) {
    // Distinguish an unknown subject from a context that covers only part of
    // the requested window. Neither case may produce a biological signal.
    const { data: overlappingContexts, error: overlapError } = await adminClient
      .from("biological_contexts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("domain", domain)
      .eq(subjectColumn, subjectId)
      .lte("valid_from", endDate)
      .or(`valid_to.is.null,valid_to.gte.${startDate}`)
      .limit(1);
    if (overlapError) {
      console.error("[environmental-analysis] Biological context overlap lookup failed", overlapError.message);
      return { status: "context_lookup_failed" };
    }
    return {
      status: overlappingContexts?.length
        ? "context_does_not_cover_scope"
        : "context_unavailable",
    };
  }
  if (contexts.length > 1) return { status: "ambiguous_context" };

  const context = contexts[0];
  const contextLocationId = context.environment?.location_id;
  if (!contextLocationId || contextLocationId !== locationId) {
    return { status: "context_environment_mismatch" };
  }

  const { data: environmentProfiles, error: environmentProfileError } = await adminClient
    .from("environment_context_profiles")
    .select(
      "*,environment:environments!environment_context_profiles_environment_fk(location_id)," +
      "sensors:environment_context_profile_sensors!environment_context_profile_sensors_profile_fk(sensor_id)",
    )
    .eq("organization_id", organizationId)
    .eq("environment_id", context.environment_id)
    .in("status", ["active", "retired"])
    .lte("valid_from", startDate)
    .or(`valid_to.is.null,valid_to.gte.${endDate}`)
    .order("valid_from", { ascending: false })
    .limit(2);

  if (environmentProfileError) {
    console.error("[environmental-analysis] Environment profile lookup failed", environmentProfileError.message);
    return { status: "profile_lookup_failed" };
  }
  if (!environmentProfiles?.length) return { status: "environment_profile_unavailable" };
  if (environmentProfiles.length > 1) return { status: "ambiguous_environment_profile" };

  const environmentProfile = environmentProfiles[0];
  if (environmentProfile.valid_from > startDate ||
      (environmentProfile.valid_to !== null && environmentProfile.valid_to < endDate)) {
    return { status: "environment_profile_unavailable" };
  }
  if (environmentProfile.environment?.location_id !== locationId) {
    return { status: "environment_profile_location_mismatch" };
  }

  const { data: domainProfiles, error: domainProfileError } = await adminClient
    .from("domain_interpretation_profiles")
    .select("id,organization_id,domain,profile_code,profile_version,rules,recommendations,status,valid_from,valid_to")
    .eq("organization_id", organizationId)
    .eq("domain", domain)
    .in("status", ["active", "retired"])
    .lte("valid_from", startDate)
    .or(`valid_to.is.null,valid_to.gte.${endDate}`)
    .order("valid_from", { ascending: false })
    .limit(2);

  if (domainProfileError) {
    console.error("[environmental-analysis] Domain profile lookup failed", domainProfileError.message);
    return { status: "profile_lookup_failed" };
  }
  if (!domainProfiles?.length) return { status: "domain_profile_unavailable" };
  if (domainProfiles.length > 1) return { status: "ambiguous_domain_profile" };

  const domainProfile = domainProfiles[0];
  if (domainProfile.valid_from > startDate ||
      (domainProfile.valid_to !== null && domainProfile.valid_to < endDate)) {
    return { status: "domain_profile_unavailable" };
  }

  // This endpoint consumes NASA POWER gridded outdoor weather, not in-situ
  // greenhouse or laboratory sensor measurements.
  if (
    environmentProfile.origin !== "weather_provider" ||
    environmentProfile.context_type !== "outdoor"
  ) {
    return { status: "environment_source_mismatch" };
  }

  return {
    status: "ready",
    payload: {
      biological_context: {
        context_id: context.id,
        subject_id: domain === "greentech" ? context.plant_culture_id : context.culture_id,
        organization_id: context.organization_id,
        location_id: contextLocationId,
        environment_context_id: context.environment_id,
        domain: context.domain,
        organism_kind: context.organism_kind,
        taxon_code: context.taxon_code,
        strain_code: context.strain_code,
        cultivar_code: context.cultivar_code,
        culture_stage: context.culture_stage,
        substrate_code: context.substrate_code,
        production_system: context.production_system,
        context_tags: context.context_tags ?? [],
        valid_from: context.valid_from,
        valid_to: context.valid_to,
      },
      environment_context: {
        context_id: environmentProfile.environment_id,
        organization_id: environmentProfile.organization_id,
        location_id: environmentProfile.environment.location_id,
        context_type: environmentProfile.context_type,
        label: environmentProfile.label,
        timezone: environmentProfile.timezone,
        origin: environmentProfile.origin,
        sensor_ids: (environmentProfile.sensors ?? []).map((sensor: { sensor_id: string }) => sensor.sensor_id),
        profile_code: environmentProfile.profile_code,
        profile_version: environmentProfile.profile_version,
      },
      domain_profile: {
        profile_id: domainProfile.profile_code,
        module: domainProfile.domain,
        version: domainProfile.profile_version,
        rules: domainProfile.rules,
        recommendations: domainProfile.recommendations ?? [],
      },
    },
  };
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
    const hasDomain = body.domain !== undefined && body.domain !== null;
    const hasSubject = body.subject_id !== undefined && body.subject_id !== null;
    if (hasDomain !== hasSubject) {
      return reply(400, { error: "domain_and_subject_id_must_be_provided_together" });
    }
    if (hasDomain && !["mycology", "greentech", "lab"].includes(String(body.domain))) {
      return reply(422, { error: "unsupported_biological_domain" });
    }
    if (hasSubject && (typeof body.subject_id !== "string" || !body.subject_id.trim())) {
      return reply(400, { error: "valid_subject_id_required" });
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

    let interpretationResolution: InterpretationResolution = { status: "not_requested" };
    if (hasDomain && hasSubject) {
      interpretationResolution = await resolveBiologicalInterpretation(
        adminClient,
        location.organization_id,
        location.id,
        body.domain as "mycology" | "greentech" | "lab",
        body.subject_id.trim(),
        startDate,
        endDate,
      );
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
    const enginePayload: Record<string, unknown> = {
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
    };
    if (interpretationResolution.payload) {
      enginePayload.biological_interpretation = interpretationResolution.payload;
    }
    const engineResponse = await fetch(engineEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BA-Engine-Key": engineKey,
      },
      body: JSON.stringify(enginePayload),
      signal: AbortSignal.timeout(60_000),
    });
    if (!engineResponse.ok) {
      const detail = await engineResponse.text();
      console.error("[environmental-analysis] Engine request failed", engineResponse.status, detail.slice(0, 500));
      if (engineResponse.status === 422) return reply(422, { error: "environmental_analysis_rejected", detail: "The selected observations do not satisfy the engine's scientific input contract." });
      return reply(502, { error: "environmental_engine_unavailable" });
    }
    const result = await engineResponse.json();
    const analysisResult = {
      ...result,
      interpretation_status: interpretationResolution.status === "ready"
        ? (result.interpretation_status ?? "context_invalid")
        : interpretationResolution.status,
      domain_interpretation: interpretationResolution.status === "ready"
        ? (result.domain_interpretation ?? null)
        : null,
    };

    let signalPersistenceStatus = "not_requested";
    const signals = Array.isArray(analysisResult.domain_interpretation?.signals)
      ? analysisResult.domain_interpretation.signals
      : [];
    let interpretationPersistenceStatus = "not_requested";
    let persistedInterpretationCount = 0;
    if (interpretationResolution.status === "ready" && signals.length > 0) {
      const engineVersion = typeof analysisResult.engine_version === "string"
        ? analysisResult.engine_version.trim()
        : "";
      if (!engineVersion || engineVersion.length > 64) {
        console.error("[environmental-analysis] Engine version is missing or invalid");
        return reply(502, { error: "environmental_engine_version_missing" });
      }
      const domainInterpretation = analysisResult.domain_interpretation as Record<string, any>;
      const biological = interpretationResolution.payload!.biological_context as Record<string, any>;
      const environment = interpretationResolution.payload!.environment_context as Record<string, any>;
      const domainProfile = interpretationResolution.payload!.domain_profile as Record<string, any>;
      const signalRows = signals.map((signal: Record<string, any>) => ({
        organization_id: location.organization_id,
        signal_id: signal.signal_id,
        domain: biological.domain,
        signal_code: signal.signal_code,
        severity: signal.severity,
        message_code: signal.message_code,
        recommendation_code: signal.recommendation_code ?? null,
        rule_id: signal.rule_id,
        source_analysis_id: signal.source_analysis_id ?? analysisResult.analysis_id,
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
        analysis_method: "environmental_daily",
        analysis_evidence: signal.evidence ?? {},
      }));

      const { error: signalPersistenceError } = await adminClient
        .from("biological_signals")
        .upsert(signalRows, {
          onConflict: "organization_id,source_analysis_id,source_finding_id,rule_id,biological_context_id,domain_profile_code,domain_profile_version,environment_profile_code,environment_profile_version",
          ignoreDuplicates: true,
        });
      if (signalPersistenceError) {
        console.error("[environmental-analysis] Biological signal persistence failed", signalPersistenceError.message);
        return reply(500, { error: "biological_signal_persistence_failed" });
      }
      signalPersistenceStatus = "persisted";

      for (const signal of signals as Record<string, any>[]) {
        const interpretationPayload = {
          schema_version: "ba.biological_interpretation.v1",
          engine: { code: "ba_environmental_engine", version: engineVersion },
          analysis: {
            analysis_id: analysisResult.analysis_id,
            generated_at: analysisResult.generated_at ?? null,
          },
          domain_profile: {
            profile_id: domainInterpretation.profile_id,
            profile_version: domainInterpretation.profile_version,
            module: domainInterpretation.module,
          },
          interpretation: {
            status: analysisResult.interpretation_status,
            evaluated_findings: domainInterpretation.evaluated_findings,
            matched_findings: domainInterpretation.matched_findings,
          },
          finding: {
            signal_id: signal.signal_id,
            source_finding_id: signal.source_finding_id,
            signal_code: signal.signal_code,
            finding_status: signal.finding_status,
            severity: signal.severity,
            rule_id: signal.rule_id,
            variable_code: signal.variable_code,
            observed_date: signal.observed_date,
            observed_value: signal.observed_value ?? null,
            unit: signal.unit,
            source_observation_ids: signal.source_observation_ids ?? [],
            context_tags: signal.context_tags ?? [],
            evidence: signal.evidence ?? {},
          },
        };
        const { error: interpretationError } = await adminClient.rpc(
          "record_biological_interpretation",
          {
            p_organization_id: location.organization_id,
            p_interpretation_id: crypto.randomUUID(),
            p_event_id: crypto.randomUUID(),
            p_source_signal_id: signal.signal_id,
            p_engine_code: "ba_environmental_engine",
            p_engine_version: engineVersion,
            p_interpretation_status: persistedInterpretationStatus(signal.finding_status),
            p_interpretation_payload: interpretationPayload,
          },
        );
        if (interpretationError) {
          console.error("[environmental-analysis] Interpretation snapshot persistence failed", interpretationError.message);
          return reply(500, { error: "biological_interpretation_persistence_failed" });
        }
        persistedInterpretationCount += 1;
      }
      interpretationPersistenceStatus = "persisted";
    } else if (interpretationResolution.status === "ready") {
      signalPersistenceStatus = "no_signals";
      interpretationPersistenceStatus = "no_findings";
    }

    let recommendationPersistenceStatus = "not_requested";
    let persistedRecommendationCount = 0;
    if (interpretationResolution.status === "ready") {
      const resolution = analysisResult.recommendation_resolution;
      if (!resolution || !Array.isArray(resolution.proposals)) {
        console.error("[environmental-analysis] Engine omitted recommendation resolution");
        return reply(502, { error: "recommendation_resolution_missing" });
      }
      if (resolution.proposals.length > 500) {
        return reply(422, { error: "recommendation_proposal_limit_exceeded" });
      }

      const signalById = new Map(
        signals.map((signal: Record<string, any>) => [signal.signal_id, signal]),
      );
      const recommendationIds = new Set<string>();
      for (const proposal of resolution.proposals as Record<string, any>[]) {
        const sourceSignal = signalById.get(proposal.source_signal_id) as Record<string, any> | undefined;
        if (
          !sourceSignal ||
          recommendationIds.has(proposal.recommendation_id) ||
          proposal.source_analysis_id !== sourceSignal.source_analysis_id ||
          proposal.source_finding_id !== sourceSignal.source_finding_id ||
          proposal.recommendation_code !== sourceSignal.recommendation_code ||
          proposal.profile_id !== sourceSignal.profile_id ||
          proposal.profile_version !== sourceSignal.profile_version ||
          proposal.module !== sourceSignal.module
        ) {
          console.error("[environmental-analysis] Recommendation provenance did not match persisted signal");
          return reply(500, { error: "recommendation_provenance_mismatch" });
        }
        recommendationIds.add(proposal.recommendation_id);

        const { error: recommendationError } = await adminClient.rpc(
          "create_biological_recommendation",
          {
            p_organization_id: location.organization_id,
            p_recommendation_id: proposal.recommendation_id,
            p_recommendation_code: proposal.recommendation_code,
            p_profile_id: proposal.profile_id,
            p_profile_version: proposal.profile_version,
            p_module: proposal.module,
            p_source_signal_id: proposal.source_signal_id,
            p_source_analysis_id: proposal.source_analysis_id,
            p_source_finding_id: proposal.source_finding_id,
            p_instruction_code: proposal.instruction_code ?? null,
            p_rationale_code: proposal.rationale_code ?? null,
            p_proposal_status: proposal.status,
            p_withholding_reasons: proposal.withholding_reasons ?? [],
          },
        );
        if (recommendationError) {
          console.error("[environmental-analysis] Recommendation persistence failed", recommendationError.message);
          return reply(500, { error: "biological_recommendation_persistence_failed" });
        }
        persistedRecommendationCount += 1;
      }
      recommendationPersistenceStatus = resolution.proposals.length
        ? "persisted"
        : "no_recommendations";
    }

    return reply(200, {
      ok: true,
      analysis: {
        ...analysisResult,
        signal_persistence_status: signalPersistenceStatus,
        recommendation_persistence_status: recommendationPersistenceStatus,
        persisted_recommendation_count: persistedRecommendationCount,
        interpretation_persistence_status: interpretationPersistenceStatus,
        persisted_interpretation_count: persistedInterpretationCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[environmental-analysis] Request failed", message);
    if (message.toLowerCase().includes("timeout")) return reply(504, { error: "environmental_analysis_timeout" });
    return reply(500, { error: "internal_error" });
  }
});
