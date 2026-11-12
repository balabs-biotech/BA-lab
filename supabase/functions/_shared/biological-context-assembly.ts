// SPDX-License-Identifier: MIT
/**
 * Pure assembly boundary for BIE source rows already authorized by caller RLS.
 * Resolves historical contexts before selecting any external weather rows.
 */
import {
  buildBiologicalContextSnapshot,
  type BiologicalCultureRow,
  type BiologicalEnvironmentRow,
  type BiologicalMeasurementRow,
  type BiologicalEnvironmentalObservationRow,
  type BiologicalContextWindow,
} from "./biological-context-snapshot.ts";
import { resolveBiologicalContext } from "./biological-context-resolver.ts";

function dateInTimezone(instant: string, timezone: string): string {
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp)) throw new Error("analysis_window_must_be_timezone_aware");
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(timestamp);
  } catch {
    throw new Error("analysis_timezone_invalid");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export async function assembleResolvedBiologicalContextSnapshot(input: {
  organizationId: string;
  culture: BiologicalCultureRow;
  contexts: Array<{
    id: string;
    organization_id: string;
    culture_id: string | null;
    environment_id: string;
    organism_kind?: string | null;
    taxon_code?: string | null;
    strain_code?: string | null;
    cultivar_code?: string | null;
    culture_stage?: string | null;
    substrate_code?: string | null;
    production_system?: string | null;
    context_tags?: string[] | null;
    valid_from: string;
    valid_to: string | null;
  }>;
  environments: BiologicalEnvironmentRow[];
  measurements: BiologicalMeasurementRow[];
  environmentalObservations: BiologicalEnvironmentalObservationRow[];
  strainReferences?: Array<{
    id: string; organization_id: string; strain_code: string; organism_id: string;
    designation?: string | null; origin?: string | null; source_description?: string | null;
  }>;
  organisms?: Array<{
    id: string; scientific_name: string; common_name?: string | null;
    taxonomy_source?: string | null; taxonomy_id?: string | null;
  }>;
  window: BiologicalContextWindow;
}) {
  const resolution = resolveBiologicalContext({
    organizationId: input.organizationId,
    cultureId: input.culture.id,
    currentEnvironmentId: input.culture.environment_id,
    contexts: input.contexts,
    environments: input.environments,
    measurements: input.measurements.map((row) => ({
      id: row.id,
      measured_at: row.measured_at,
      environment_id: row.environment_id ?? null,
    })),
    window: input.window,
  });

  const environmentId = resolution.window.status === "resolved"
    ? String(resolution.window.environment_id)
    : null;
  const resolvedEnvironment = environmentId
    ? input.environments.find((row) =>
      row.id === environmentId && row.organization_id === input.organizationId
    ) ?? null
    : null;
  if (environmentId && !resolvedEnvironment) {
    throw new Error("resolved_window_environment_not_loaded");
  }

  // Weather is only admissible when the entire requested window maps to one
  // historical environment and that environment has a location.
  const weatherRows = resolvedEnvironment?.location_id
    ? input.environmentalObservations.filter((row) =>
      row.location_id === resolvedEnvironment.location_id
    )
    : [];
  const measurementContextById = Object.fromEntries(
    resolution.measurements.map((item) => [item.measurement_id, {
      status: item.status,
      reason: item.reason,
      environment_id: item.environment_id,
      location_id: item.location_id,
    }])
  );
  const environmentLinkState = resolution.window.status === "resolved"
    ? (resolvedEnvironment?.location_id ? "resolved" : "environment_without_location")
    : resolution.window.status;

  const startDate = dateInTimezone(input.window.start, input.window.timezone);
  const lastIncludedDate = dateInTimezone(
    new Date(Date.parse(input.window.end) - 1).toISOString(),
    input.window.timezone,
  );
  const biologicalContexts = input.contexts
    .filter((context) =>
      context.valid_from <= lastIncludedDate &&
      (context.valid_to === null || context.valid_to > startDate)
    )
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from) || a.id.localeCompare(b.id))
    .map((context) => {
      const strain = context.strain_code
        ? (input.strainReferences ?? []).find((item) =>
          item.organization_id === input.organizationId && item.strain_code === context.strain_code
        ) ?? null
        : null;
      const organism = strain
        ? (input.organisms ?? []).find((item) => item.id === strain.organism_id) ?? null
        : null;
      return {
        context_id: context.id,
        valid_from: context.valid_from,
        valid_to: context.valid_to,
        organism_kind: context.organism_kind ?? null,
        taxon_code: context.taxon_code ?? null,
        strain_code: context.strain_code ?? null,
        cultivar_code: context.cultivar_code ?? null,
        culture_stage: context.culture_stage ?? null,
        substrate_code: context.substrate_code ?? null,
        production_system: context.production_system ?? null,
        context_tags: Array.isArray(context.context_tags)
          ? context.context_tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        genetic_reference: {
          status: !context.strain_code ? "not_specified" : strain ? "resolved" : "unresolved",
          strain_id: strain?.id ?? null,
          organism_id: strain?.organism_id ?? null,
          designation: strain?.designation ?? null,
          origin: strain?.origin ?? null,
          source_description: strain?.source_description ?? null,
          scientific_name: organism?.scientific_name ?? null,
          common_name: organism?.common_name ?? null,
          taxonomy_source: organism?.taxonomy_source ?? null,
          taxonomy_id: organism?.taxonomy_id ?? null,
        },
      };
    });

  const snapshot = await buildBiologicalContextSnapshot({
    organizationId: input.organizationId,
    culture: input.culture,
    environment: resolvedEnvironment,
    measurements: input.measurements,
    environmentalObservations: weatherRows,
    measurementContextById,
    biologicalContexts,
    environmentLinkState,
    window: input.window,
  });
  return {
    ...snapshot,
    context_resolution: resolution,
    // IDs excluded here are deliberately not queried into the engine snapshot.
    excluded_environmental_observation_ids: input.environmentalObservations
      .filter((row) => !weatherRows.some((accepted) => accepted.id === row.id))
      .map((row) => row.id),
  };
}
