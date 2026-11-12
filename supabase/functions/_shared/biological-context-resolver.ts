// SPDX-License-Identifier: MIT
/**
 * Resolve historical culture environments without falling back to the
 * culture's mutable current environment.
 *
 * biological_contexts.valid_to is treated as an exclusive date boundary.
 * A measurement.environment_id is an explicit per-measurement historical
 * link; it may resolve a measurement when no dated context exists, but it
 * must agree with a dated context when one applies.
 */
type ContextRow = {
  id: string;
  organization_id: string;
  culture_id: string | null;
  environment_id: string;
  valid_from: string;
  valid_to: string | null;
};

type EnvironmentRow = {
  id: string;
  organization_id: string;
  location_id: string | null;
};

type MeasurementRow = {
  id: string;
  measured_at: string;
  environment_id?: string | null;
};

function localDate(instant: string, timezone: string): string {
  const timestamp = Date.parse(instant);
  if (!Number.isFinite(timestamp) || !/(Z|[+-][0-9]{2}:[0-9]{2})$/i.test(instant)) {
    throw new Error("measurement_timestamp_must_be_timezone_aware");
  }
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

function validContextForDate(context: ContextRow, date: string): boolean {
  return context.valid_from <= date && (context.valid_to === null || date < context.valid_to);
}

function environmentExists(
  environmentId: string,
  organizationId: string,
  environments: EnvironmentRow[],
): EnvironmentRow | null {
  return environments.find((item) =>
    item.id === environmentId && item.organization_id === organizationId
  ) ?? null;
}

export function resolveBiologicalContext(input: {
  organizationId: string;
  cultureId: string;
  /** Deliberately not used as a historical fallback. */
  currentEnvironmentId?: string | null;
  contexts: ContextRow[];
  environments: EnvironmentRow[];
  measurements: MeasurementRow[];
  window: { start: string; end: string; timezone: string };
}) {
  const { organizationId, cultureId, contexts, environments, measurements, window } = input;
  const startDate = localDate(window.start, window.timezone);
  const endDate = localDate(window.end, window.timezone);
  if (Date.parse(window.end) <= Date.parse(window.start)) {
    throw new Error("analysis_window_end_must_follow_start");
  }

  const scopedContexts = contexts.filter((context) =>
    context.organization_id === organizationId && context.culture_id === cultureId
  );
  const resolvedMeasurements = measurements.map((measurement) => {
    const date = localDate(measurement.measured_at, window.timezone);
    const applicable = scopedContexts.filter((context) => validContextForDate(context, date));
    if (applicable.length > 1) {
      return { measurement_id: measurement.id, environment_id: null, location_id: null,
        status: "ambiguous", reason: "overlapping_biological_contexts" };
    }
    const contextEnvironmentId = applicable[0]?.environment_id ?? null;
    const measurementEnvironmentId = measurement.environment_id ?? null;
    if (contextEnvironmentId && measurementEnvironmentId &&
        contextEnvironmentId !== measurementEnvironmentId) {
      return { measurement_id: measurement.id, environment_id: null, location_id: null,
        status: "conflict", reason: "measurement_environment_context_mismatch" };
    }
    const environmentId = contextEnvironmentId ?? measurementEnvironmentId;
    if (!environmentId) {
      return { measurement_id: measurement.id, environment_id: null, location_id: null,
        status: "missing", reason: "historical_environment_not_resolved" };
    }
    const environment = environmentExists(environmentId, organizationId, environments);
    if (!environment) {
      return { measurement_id: measurement.id, environment_id: null, location_id: null,
        status: "conflict", reason: "environment_not_found_in_organization" };
    }
    return { measurement_id: measurement.id, environment_id: environment.id,
      location_id: environment.location_id, status: "resolved", reason: null };
  });

  const windowContexts = scopedContexts.filter((context) =>
    context.valid_from <= startDate &&
    (context.valid_to === null || context.valid_to > endDate)
  );
  let windowResolution: Record<string, unknown>;
  if (windowContexts.length > 1) {
    windowResolution = { status: "ambiguous", environment_id: null, location_id: null,
      reason: "overlapping_biological_contexts" };
  } else if (windowContexts.length === 0) {
    windowResolution = { status: "missing", environment_id: null, location_id: null,
      reason: "biological_context_does_not_cover_analysis_window" };
  } else {
    const environment = environmentExists(windowContexts[0].environment_id, organizationId, environments);
    if (!environment) {
      windowResolution = { status: "conflict", environment_id: null, location_id: null,
        reason: "environment_not_found_in_organization" };
    } else {
      windowResolution = { status: "resolved", environment_id: environment.id,
        location_id: environment.location_id, reason: null };
    }
  }

  return { measurements: resolvedMeasurements, window: windowResolution };
}
