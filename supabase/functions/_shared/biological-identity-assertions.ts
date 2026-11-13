// SPDX-License-Identifier: MIT
/**
 * Resolves validated biological identity assertions for the identities present
 * in an immutable BIE context snapshot. All reads use the caller's RLS client.
 */
type Row = Record<string, any>;
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const row = value as Row;
    return "{" + Object.keys(row).sort().map((key) => JSON.stringify(key) + ":" + stable(row[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}
export async function loadAuthenticatedBiologicalIdentityAssertions(input: {
  userClient: any;
  organizationId: string;
  biologicalContexts: Row[];
}) {
  const { userClient, organizationId } = input;
  if (!userClient || typeof userClient.from !== "function") throw new Error("caller_scoped_supabase_client_required");
  if (!organizationId || !Array.isArray(input.biologicalContexts)) throw new Error("biological_identity_context_invalid");
  const organismIds = uniqueStrings(input.biologicalContexts.map((context) => context?.genetic_reference?.organism_id));
  const strainIds = uniqueStrings(input.biologicalContexts.map((context) => context?.genetic_reference?.strain_id));
  if (!organismIds.length && !strainIds.length) {
    return { state: "not_documented", assertions: [], datasets: [] };
  }
  const queries: Promise<any>[] = [];
  if (organismIds.length) queries.push(userClient.from("biological_identity_assertions")
    .select("id,organization_id,assertion_code,assertion_version,subject_type,organism_id,strain_id,assertion_type,assertion_value,source_reference_id,source_reference_version,evidence_level,content_sha256,status,reviewed_at,valid_from,valid_to")
    .eq("organization_id", organizationId).eq("status", "validated")
    .eq("subject_type", "organism").in("organism_id", organismIds).limit(500));
  if (strainIds.length) queries.push(userClient.from("biological_identity_assertions")
    .select("id,organization_id,assertion_code,assertion_version,subject_type,organism_id,strain_id,assertion_type,assertion_value,source_reference_id,source_reference_version,evidence_level,content_sha256,status,reviewed_at,valid_from,valid_to")
    .eq("organization_id", organizationId).eq("status", "validated")
    .eq("subject_type", "strain").in("strain_id", strainIds).limit(500));
  const results = await Promise.all(queries);
  if (results.some((result) => result.error || !Array.isArray(result.data))) {
    throw new Error("biological_identity_assertion_registry_unavailable");
  }
  const rows: Row[] = results.flatMap((result) => result.data).filter((row) =>
    row.organization_id === organizationId && row.status === "validated" &&
    ((row.subject_type === "organism" && organismIds.includes(row.organism_id) && row.strain_id === null) ||
     (row.subject_type === "strain" && strainIds.includes(row.strain_id)))
  );
  if (rows.length >= 1000) throw new Error("biological_identity_assertion_limit_exceeded");
  const refs = uniqueStrings(rows.map((row) => row.source_reference_id));
  let referenceRows: Row[] = [];
  if (refs.length) {
    const referenceResult = await userClient.from("biological_reference_registry")
      .select("organization_id,reference_id,reference_version,content_sha256,status,reviewed_at")
      .eq("organization_id", organizationId).eq("status", "validated")
      .in("reference_id", refs).limit(500);
    if (referenceResult.error || !Array.isArray(referenceResult.data)) {
      throw new Error("biological_reference_registry_unavailable");
    }
    referenceRows = referenceResult.data.filter((row: Row) =>
      row.organization_id === organizationId && row.status === "validated"
    );
  }
  const referenceMap = new Map<string, Row>();
  for (const row of referenceRows) {
    const key = row.reference_id + "@" + row.reference_version;
    if (referenceMap.has(key)) throw new Error("biological_identity_reference_ambiguous");
    referenceMap.set(key, row);
  }
  const accepted = rows.filter((row) => {
    const reference = referenceMap.get(row.source_reference_id + "@" + row.source_reference_version);
    return !!reference && reference.content_sha256 && /^[0-9a-f]{64}$/.test(reference.content_sha256) &&
      reference.reviewed_at && row.reviewed_at && /^[0-9a-f]{64}$/.test(row.content_sha256);
  }).map((row) => ({
    assertion_code: row.assertion_code,
    assertion_version: row.assertion_version,
    subject_type: row.subject_type,
    organism_id: row.organism_id,
    strain_id: row.strain_id,
    assertion_type: row.assertion_type,
    assertion_value: row.assertion_value,
    evidence_level: row.evidence_level,
    content_sha256: row.content_sha256,
    source_reference_id: row.source_reference_id,
    source_reference_version: row.source_reference_version,
    source_reference_sha256: referenceMap.get(row.source_reference_id + "@" + row.source_reference_version)!.content_sha256,
    reviewed_at: row.reviewed_at,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
  })).sort((a, b) => a.assertion_code.localeCompare(b.assertion_code) || a.assertion_version.localeCompare(b.assertion_version));
  const duplicateKeys = new Set<string>();
  for (const assertion of accepted) {
    const key = assertion.assertion_code + "@" + assertion.assertion_version;
    if (duplicateKeys.has(key)) throw new Error("biological_identity_assertion_identity_ambiguous");
    duplicateKeys.add(key);
  }
  const state = accepted.length ? "documented" : "not_documented";
  const datasets = accepted.map((assertion) => ({
    provider: "BA_LABS_BIOLOGICAL_IDENTITY",
    dataset_id: assertion.assertion_code,
    dataset_version: assertion.assertion_version,
    content_sha256: await sha256(stable(assertion)),
    retrieved_at: assertion.reviewed_at,
  }));
  return { state, assertions: accepted, datasets };
}
