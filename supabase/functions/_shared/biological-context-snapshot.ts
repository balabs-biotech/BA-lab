// SPDX-License-Identifier: MIT
/**
 * Pure, defensive adapter from caller-authorized Supabase rows to a BIE v1
 * immutable engine snapshot. This module performs no database access.
 */
export interface BiologicalCultureRow {
  id: string;
  organization_id: string;
  environment_id: string | null;
}

export interface BiologicalEnvironmentRow {
  id: string;
  organization_id: string;
  location_id: string | null;
}

export interface BiologicalMeasurementRow {
  id: string;
  organization_id: string;
  culture_id: string | null;
  variable_code: string;
  raw_value: number | null;
  raw_unit_code: string | null;
  normalized_value: number | null;
  normalized_unit_code: string | null;
  measured_at: string;
  method?: string | null;
  instrument?: string | null;
  quality_state?: string | null;
  exclusion_reason?: string | null;
  sample_id?: string | null;
  experimental_unit_id?: string | null;
  event_id?: string | null;
  result_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BiologicalEnvironmentalObservationRow {
  id: string;
  organization_id: string;
  location_id: string;
  data_family: string;
  provider_code: string;
  dataset_code: string;
  variable_code: string;
  value: number;
  unit_code: string;
  observed_at: string;
  retrieved_at?: string | null;
  spatial_resolution_m?: number | null;
  quality_flag?: string | null;
  metadata?: Record<string, unknown> | null;
  source_url?: string | null;
}

export interface BiologicalContextWindow {
  start: string;
  end: string;
  timezone: string;
}

function parseInstant(value: string, field: string): number {
  if (typeof value !== "string" || !value) throw new Error(field + "_required");
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || !/(Z|[+-][0-9]{2}:[0-9]{2})$/i.test(value)) {
    throw new Error(field + "_must_be_timezone_aware");
  }
  return instant;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map((key) =>
      JSON.stringify(key) + ":" + stable(object[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildBiologicalContextSnapshot(input: {
  organizationId: string;
  culture: BiologicalCultureRow;
  environment: BiologicalEnvironmentRow | null;
  measurements: BiologicalMeasurementRow[];
  environmentalObservations: BiologicalEnvironmentalObservationRow[];
  window: BiologicalContextWindow;
}) {
  const { organizationId, culture, environment, window } = input;
  if (!organizationId || culture.organization_id !== organizationId) {
    throw new Error("culture_organization_scope_mismatch");
  }
  if (!culture.id) throw new Error("culture_id_required");

  const windowStart = parseInstant(window.start, "window_start");
  const windowEnd = parseInstant(window.end, "window_end");
  if (windowEnd <= windowStart) throw new Error("analysis_window_end_must_follow_start");
  if (!window.timezone) throw new Error("analysis_timezone_required");

  let locationId: string | null = null;
  if (culture.environment_id) {
    if (!environment || environment.id !== culture.environment_id ||
        environment.organization_id !== organizationId) {
      throw new Error("culture_environment_not_resolved");
    }
    if (environment.location_id) locationId = environment.location_id;
  } else if (environment) {
    throw new Error("unexpected_environment_for_unlinked_culture");
  }

  const records: Record<string, unknown>[] = [];
  for (const row of input.measurements) {
    if (row.organization_id !== organizationId || row.culture_id !== culture.id) {
      throw new Error("measurement_culture_scope_mismatch");
    }
    const instant = parseInstant(row.measured_at, "measurement_timestamp");
    if (instant < windowStart || instant > windowEnd) continue;
    const context = {
      culture_id: row.culture_id,
      sample_id: row.sample_id ?? null,
      experimental_unit_id: row.experimental_unit_id ?? null,
      event_id: row.event_id ?? null,
      result_id: row.result_id ?? null,
    };
    const data = {
      variable_code: row.variable_code,
      raw_value: row.raw_value,
      raw_unit_code: row.raw_unit_code,
      normalized_value: row.normalized_value,
      normalized_unit_code: row.normalized_unit_code,
      measured_at: row.measured_at,
      method: row.method ?? null,
      instrument: row.instrument ?? null,
      quality_state: row.quality_state ?? null,
      exclusion_reason: row.exclusion_reason ?? null,
      metadata: row.metadata ?? {},
    };
    records.push({
      record_id: row.id,
      record_type: "measurement",
      payload_sha256: await sha256(stable({ source: row, context })),
      data,
      context,
    });
  }

  if (input.environmentalObservations.length && !locationId) {
    throw new Error("culture_environment_location_not_resolved");
  }
  for (const row of input.environmentalObservations) {
    if (row.organization_id !== organizationId || row.location_id !== locationId) {
      throw new Error("environmental_observation_location_scope_mismatch");
    }
    if (row.data_family !== "weather") continue;
    const instant = parseInstant(row.observed_at, "environmental_observation_timestamp");
    if (instant < windowStart || instant > windowEnd) continue;
    const context = { location_id: row.location_id };
    const data = {
      variable_code: row.variable_code,
      value: row.value,
      unit_code: row.unit_code,
      observed_at: row.observed_at,
      data_family: row.data_family,
      provider_code: row.provider_code,
      dataset_code: row.dataset_code,
      retrieved_at: row.retrieved_at ?? null,
      spatial_resolution_m: row.spatial_resolution_m ?? null,
      quality_flag: row.quality_flag ?? null,
      source_url: row.source_url ?? null,
      metadata: row.metadata ?? {},
    };
    records.push({
      record_id: row.id,
      record_type: "environmental_observation",
      payload_sha256: await sha256(stable({ source: row, context })),
      data,
      context,
    });
  }

  records.sort((a, b) => {
    const aData = a.data as Record<string, unknown>;
    const bData = b.data as Record<string, unknown>;
    const aTime = parseInstant(String(aData.measured_at ?? aData.observed_at ?? ""), "record_timestamp");
    const bTime = parseInstant(String(bData.measured_at ?? bData.observed_at ?? ""), "record_timestamp");
    return aTime - bTime || String(a.record_id).localeCompare(String(b.record_id));
  });
  const recordIds = records.map((record) => String(record.record_id));
  if (new Set(recordIds).size !== recordIds.length) {
    throw new Error("duplicate_biological_snapshot_record_id");
  }

  const scope: Record<string, string> = {
    organization_id: organizationId,
    culture_id: culture.id,
  };
  if (culture.environment_id) scope.environment_id = culture.environment_id;
  if (locationId) scope.location_id = locationId;

  const parameters = {
    window_start: window.start,
    window_end: window.end,
    timezone: window.timezone,
    biological_context_supplied: false,
    environment_link_state: culture.environment_id
      ? (locationId ? "resolved" : "environment_without_location")
      : "unlinked",
  };
  const snapshotHash = await sha256(stable(records));
  return {
    scope,
    parameters,
    input: {
      record_ids: recordIds,
      snapshot_sha256: snapshotHash,
      records,
    },
  };
}
