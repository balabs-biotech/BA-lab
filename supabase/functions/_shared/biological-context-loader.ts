// SPDX-License-Identifier: MIT
/**
 * Authenticated BIE source loader.
 *
 * The supplied Supabase client must be created with the caller's JWT. This
 * module never accepts a service-role client and never trusts caller-provided
 * organization/environment/location IDs as database authority.
 */
import { assembleResolvedBiologicalContextSnapshot } from "./biological-context-assembly.ts";
import { resolveBiologicalContext } from "./biological-context-resolver.ts";

const MAX_MEASUREMENTS = 1000;
const MAX_WEATHER_OBSERVATIONS = 3000;

function requireRows<T>(result: { data: T[] | null; error: unknown }, code: string): T[] {
  if (result.error || !Array.isArray(result.data)) throw new Error(code);
  return result.data;
}

export async function loadAuthenticatedBiologicalContextSnapshot(input: {
  userClient: any;
  organizationId: string;
  cultureId: string;
  window: { start: string; end: string; timezone: string };
}) {
  const { userClient, organizationId, cultureId, window } = input;
  if (!userClient || typeof userClient.from !== "function") {
    throw new Error("caller_scoped_supabase_client_required");
  }
  if (!organizationId || !cultureId) throw new Error("biological_subject_scope_required");

  const cultureResult = await userClient.from("cultures")
    .select("id,organization_id,environment_id")
    .eq("organization_id", organizationId)
    .eq("id", cultureId)
    .maybeSingle();
  if (cultureResult.error || !cultureResult.data) {
    throw new Error("culture_not_found_or_inaccessible");
  }
  const culture = cultureResult.data;
  if (culture.organization_id !== organizationId || culture.id !== cultureId) {
    throw new Error("culture_tenant_scope_mismatch");
  }

  const [contextResult, measurementResult] = await Promise.all([
    userClient.from("biological_contexts")
      .select("id,organization_id,culture_id,environment_id,valid_from,valid_to")
      .eq("organization_id", organizationId)
      .eq("culture_id", cultureId),
    userClient.from("measurements")
      .select("id,organization_id,culture_id,environment_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,sample_id,experimental_unit_id,event_id,result_id,metadata")
      .eq("organization_id", organizationId)
      .eq("culture_id", cultureId)
      .gte("measured_at", window.start)
      .lt("measured_at", window.end)
      .order("measured_at", { ascending: true })
      .limit(MAX_MEASUREMENTS + 1),
  ]);
  const contexts = requireRows(contextResult, "biological_contexts_unavailable");
  const measurements = requireRows(measurementResult, "culture_measurements_unavailable");
  if (measurements.length > MAX_MEASUREMENTS) {
    throw new Error("biological_analysis_measurement_limit_exceeded");
  }

  const environmentIds = [...new Set([
    ...contexts.map((row: any) => row.environment_id),
    ...measurements.map((row: any) => row.environment_id),
  ].filter((value): value is string => typeof value === "string" && value.length > 0))];

  let environments: any[] = [];
  if (environmentIds.length) {
    const environmentResult = await userClient.from("environments")
      .select("id,organization_id,location_id")
      .eq("organization_id", organizationId)
      .in("id", environmentIds);
    environments = requireRows(environmentResult, "biological_environments_unavailable");
  }

  // A location is usable for external weather only if it is itself visible
  // under the caller's RLS scope and belongs to the same organization.
  const locationIds = [...new Set(environments
    .map((row) => row.location_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0))];
  let visibleLocationIds = new Set<string>();
  if (locationIds.length) {
    const locationResult = await userClient.from("locations")
      .select("id,organization_id")
      .eq("organization_id", organizationId)
      .in("id", locationIds);
    const locations = requireRows(locationResult, "biological_locations_unavailable");
    visibleLocationIds = new Set(locations
      .filter((row: any) => row.organization_id === organizationId)
      .map((row: any) => row.id));
  }
  environments = environments.map((row) => ({
    ...row,
    location_id: row.location_id && visibleLocationIds.has(row.location_id) ? row.location_id : null,
  }));

  const preflight = resolveBiologicalContext({
    organizationId,
    cultureId,
    currentEnvironmentId: culture.environment_id,
    contexts,
    environments,
    measurements: measurements.map((row: any) => ({
      id: row.id,
      measured_at: row.measured_at,
      environment_id: row.environment_id ?? null,
    })),
    window,
  });

  let environmentalObservations: any[] = [];
  if (preflight.window.status === "resolved" && preflight.window.location_id) {
    const observationResult = await userClient.from("environmental_observations")
      .select("id,organization_id,location_id,data_family,provider_code,dataset_code,variable_code,value,unit_code,observed_at,retrieved_at,spatial_resolution_m,quality_flag,source_url,metadata")
      .eq("organization_id", organizationId)
      .eq("location_id", preflight.window.location_id)
      .eq("data_family", "weather")
      .gte("observed_at", window.start)
      .lt("observed_at", window.end)
      .order("observed_at", { ascending: true })
      .limit(MAX_WEATHER_OBSERVATIONS + 1);
    environmentalObservations = requireRows(observationResult, "environmental_observations_unavailable");
    if (environmentalObservations.length > MAX_WEATHER_OBSERVATIONS) {
      throw new Error("biological_analysis_weather_limit_exceeded");
    }
  }

  return assembleResolvedBiologicalContextSnapshot({
    organizationId,
    culture,
    contexts,
    environments,
    measurements,
    environmentalObservations,
    window,
  });
}
