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

export async function assembleResolvedBiologicalContextSnapshot(input: {
  organizationId: string;
  culture: BiologicalCultureRow;
  contexts: Array<{
    id: string;
    organization_id: string;
    culture_id: string | null;
    environment_id: string;
    valid_from: string;
    valid_to: string | null;
  }>;
  environments: BiologicalEnvironmentRow[];
  measurements: BiologicalMeasurementRow[];
  environmentalObservations: BiologicalEnvironmentalObservationRow[];
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

  const snapshot = await buildBiologicalContextSnapshot({
    organizationId: input.organizationId,
    culture: input.culture,
    environment: resolvedEnvironment,
    measurements: input.measurements,
    environmentalObservations: weatherRows,
    measurementContextById,
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
