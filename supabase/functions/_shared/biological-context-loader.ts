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

const MAX_CONTEXTS = 500;
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
      .select("id,organization_id,domain,culture_id,environment_id,organism_kind,taxon_code,strain_code,cultivar_code,culture_stage,substrate_code,production_system,context_tags,valid_from,valid_to")
      .eq("organization_id", organizationId)
      .eq("culture_id", cultureId)
      .limit(MAX_CONTEXTS + 1),
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
  if (contexts.length > MAX_CONTEXTS) {
    throw new Error("biological_analysis_context_limit_exceeded");
  }
  if (measurements.length > MAX_MEASUREMENTS) {
    throw new Error("biological_analysis_measurement_limit_exceeded");
  }

  // Resolve strain codes only inside the caller's organization. The biological
  // context stores a code, not a foreign key, so the catalogue lookup is explicit.
  const strainCodes = [...new Set(contexts
    .map((row: any) => row.strain_code)
    .filter((value): value is string => typeof value === "string" && value.length > 0))];
  let strainReferences: any[] = [];
  let organisms: any[] = [];
  if (strainCodes.length) {
    const strainResult = await userClient.from("strains")
      .select("id,organization_id,strain_code,organism_id,designation,origin,source_description")
      .eq("organization_id", organizationId)
      .in("strain_code", strainCodes);
    strainReferences = requireRows(strainResult, "biological_strain_references_unavailable")
      .filter((row: any) => row.organization_id === organizationId && strainCodes.includes(row.strain_code));
    const organismIds = [...new Set(strainReferences.map((row: any) => row.organism_id))];
    if (organismIds.length) {
      const organismResult = await userClient.from("organisms")
        .select("id,scientific_name,common_name,taxonomy_source,taxonomy_id")
        .in("id", organismIds);
      organisms = requireRows(organismResult, "biological_organisms_unavailable")
        .filter((row: any) => organismIds.includes(row.id));
    }
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
    strainReferences,
    organisms,
    window,
  });
}


/**
 * GreenTech variant of the authenticated source loader. Plant identity and
 * measurements remain bound to plant_culture_id throughout; no fungal culture
 * surrogate or mutable current-environment fallback is permitted.
 */
export async function loadAuthenticatedPlantBiologicalContextSnapshot(input: {
  userClient: any;
  organizationId: string;
  plantCultureId: string;
  window: { start: string; end: string; timezone: string };
}) {
  const { userClient, organizationId, plantCultureId, window } = input;
  if (!userClient || typeof userClient.from !== "function") {
    throw new Error("caller_scoped_supabase_client_required");
  }
  if (!organizationId || !plantCultureId) throw new Error("biological_subject_scope_required");

  const plantResult = await userClient.from("plant_cultures")
    .select("id,organization_id,environment_id,species_name,cultivar_name,crop_type,substrate,started_at")
    .eq("organization_id", organizationId)
    .eq("id", plantCultureId)
    .maybeSingle();
  if (plantResult.error || !plantResult.data) {
    throw new Error("plant_culture_not_found_or_inaccessible");
  }
  const plantCulture = plantResult.data;
  if (plantCulture.organization_id !== organizationId || plantCulture.id !== plantCultureId) {
    throw new Error("plant_culture_tenant_scope_mismatch");
  }

  const [contextResult, measurementResult] = await Promise.all([
    userClient.from("biological_contexts")
      .select("id,organization_id,culture_id,plant_culture_id,domain,environment_id,organism_kind,taxon_code,cultivar_code,culture_stage,substrate_code,production_system,context_tags,valid_from,valid_to")
      .eq("organization_id", organizationId)
      .eq("plant_culture_id", plantCultureId)
      .eq("domain", "greentech")
      .limit(MAX_CONTEXTS + 1),
    userClient.from("measurements")
      .select("id,organization_id,culture_id,plant_culture_id,environment_id,variable_code,raw_value,raw_unit_code,normalized_value,normalized_unit_code,measured_at,method,instrument,quality_state,exclusion_reason,sample_id,experimental_unit_id,event_id,result_id,metadata")
      .eq("organization_id", organizationId)
      .eq("plant_culture_id", plantCultureId)
      .gte("measured_at", window.start)
      .lt("measured_at", window.end)
      .order("measured_at", { ascending: true })
      .limit(MAX_MEASUREMENTS + 1),
  ]);
  const contexts = requireRows(contextResult, "biological_contexts_unavailable");
  const measurements = requireRows(measurementResult, "plant_culture_measurements_unavailable");
  if (contexts.some((row: any) =>
    row.organization_id !== organizationId ||
    row.plant_culture_id !== plantCultureId ||
    row.culture_id !== null ||
    row.domain !== "greentech"
  )) {
    throw new Error("plant_biological_context_scope_mismatch");
  }
  if (measurements.some((row: any) =>
    row.organization_id !== organizationId ||
    row.plant_culture_id !== plantCultureId ||
    row.culture_id !== null
  )) {
    throw new Error("plant_culture_measurement_scope_mismatch");
  }
  if (contexts.length > MAX_CONTEXTS) {
    throw new Error("biological_analysis_context_limit_exceeded");
  }
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
    plantCultureId,
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
    plantCulture: {
      id: plantCulture.id,
      organization_id: plantCulture.organization_id,
      environment_id: plantCulture.environment_id ?? null,
    },
    contexts,
    environments,
    measurements,
    environmentalObservations,
    window,
  });
}
