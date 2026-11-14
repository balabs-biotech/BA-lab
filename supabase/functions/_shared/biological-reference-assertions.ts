// SPDX-License-Identifier: MIT
/**
 * Resolves source-linked, administrator-validated biological reference assertions.
 * Only context-matching claims are exposed; draft and retired claims are never read.
 */
type Row = Record<string, any>;
const ASSERTION_CODE = /^[a-z][a-z0-9_.-]{1,159}$/;
const ASSERTION_VERSION = /^[0-9]+\\.[0-9]+\\.[0-9]+([+-][0-9A-Za-z.-]+)?$/;
const PREDICATE_CODE = /^[a-z][a-z0-9_.-]{1,158}$/;
function isObject(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (isObject(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stable(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const SUBJECT_FIELDS: Record<string, string[]> = {
  taxon: ["taxon_code"],
  strain: ["strain_code"],
  cultivar: ["cultivar_code"],
  substrate: ["substrate_code"],
  culture_stage: ["culture_stage"],
  production_system: ["production_system"],
  environmental_parameter: ["environmental_parameter_code"],
  biological_process: ["biological_process_code"],
};
function contextSubjects(contexts: Row[]) {
  const refs = new Map<string, Set<string>>();
  for (const context of contexts) {
    if (!isObject(context)) continue;
    for (const [subjectType, fields] of Object.entries(SUBJECT_FIELDS)) {
      for (const field of fields) {
        const value = context[field];
        if (typeof value === "string" && value.trim()) {
          if (!refs.has(subjectType)) refs.set(subjectType, new Set());
          refs.get(subjectType)!.add(value.trim());
        }
      }
    }
  }
  return [...refs.entries()].flatMap(([subject_type, values]) =>
    [...values].map((subject_ref) => ({ subject_type, subject_ref }))
  );
}
export async function buildBiologicalReferenceAssertions(input: {
  organizationId: string;
  contexts: Row[];
  assertions: Row[];
  references: Row[];
}) {
  const { organizationId } = input;
  if (!organizationId || !Array.isArray(input.contexts) ||
      !Array.isArray(input.assertions) || !Array.isArray(input.references)) {
    throw new Error("biological_reference_assertion_input_invalid");
  }
  const subjects = contextSubjects(input.contexts);
  if (!subjects.length) return { state: "not_applicable", assertions: [], datasets: [] };
  const subjectKeys = new Set(subjects.map((item) => item.subject_type + ":" + item.subject_ref));
  const referenceMap = new Map<string, Row>();
  for (const reference of input.references) {
    if (!isObject(reference) || reference.organization_id !== organizationId ||
        reference.status !== "validated" || typeof reference.id !== "string" ||
        typeof reference.reference_id !== "string" || typeof reference.reference_version !== "string" ||
        typeof reference.content_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(reference.content_sha256) ||
        typeof reference.reviewed_at !== "string") continue;
    if (referenceMap.has(reference.id)) throw new Error("biological_reference_assertion_source_ambiguous");
    referenceMap.set(reference.id, reference);
  }
  const accepted: Row[] = [];
  const seen = new Set<string>();
  for (const row of input.assertions) {
    if (!isObject(row) || row.organization_id !== organizationId || row.status !== "validated") continue;
    if (typeof row.assertion_code !== "string" || !ASSERTION_CODE.test(row.assertion_code) ||
        typeof row.assertion_version !== "string" || !ASSERTION_VERSION.test(row.assertion_version) ||
        typeof row.subject_type !== "string" || !SUBJECT_FIELDS[row.subject_type] ||
        typeof row.subject_ref !== "string" || row.subject_ref.length > 240 ||
        !subjectKeys.has(row.subject_type + ":" + row.subject_ref) ||
        typeof row.predicate_code !== "string" || !PREDICATE_CODE.test(row.predicate_code) ||
        row.object_value === null || row.object_value === undefined ||
        (row.unit_code !== null && row.unit_code !== undefined &&
          (typeof row.unit_code !== "string" || row.unit_code.length > 80)) ||
        (row.source_locator !== null && row.source_locator !== undefined &&
          (typeof row.source_locator !== "string" || row.source_locator.length > 2000)) ||
        !isObject(row.applicability) || !isObject(row.uncertainty) ||
        typeof row.evidence_level !== "string" ||
        !["L0", "L1", "L2", "L3", "L4", "L5", "unassessed"].includes(row.evidence_level) ||
        typeof row.reviewed_at !== "string" || typeof row.reference_registry_id !== "string") {
      continue;
    }
    const source = referenceMap.get(row.reference_registry_id);
    if (!source) throw new Error("biological_reference_assertion_source_not_validated");
    if (typeof source.source_url === "string" &&
        !/^https?:\\/\\//i.test(source.source_url)) {
      throw new Error("biological_reference_assertion_source_url_invalid");
    }
    const key = row.assertion_code + "@" + row.assertion_version;
    if (seen.has(key)) throw new Error("biological_reference_assertion_identity_ambiguous");
    seen.add(key);
    const assertionPayload = {
      assertion_code: row.assertion_code,
      assertion_version: row.assertion_version,
      subject_type: row.subject_type,
      subject_ref: row.subject_ref,
      predicate_code: row.predicate_code,
      object_value: row.object_value,
      unit_code: row.unit_code ?? null,
      reference_registry_id: row.reference_registry_id,
      source_locator: row.source_locator ?? null,
      evidence_level: row.evidence_level,
      applicability: row.applicability,
      uncertainty: row.uncertainty,
      source: {
        reference_id: source.reference_id,
        reference_version: source.reference_version,
        content_sha256: source.content_sha256,
        reviewed_at: source.reviewed_at,
        ...(typeof source.source_url === "string" ? { source_url: source.source_url } : {}),
      },
      reviewed_at: row.reviewed_at,
    };
    accepted.push({
      ...assertionPayload,
      content_sha256: await sha256(stable(assertionPayload)),
    });
  }
  accepted.sort((a, b) => a.assertion_code.localeCompare(b.assertion_code) ||
    a.assertion_version.localeCompare(b.assertion_version));
  const semantics = new Map<string, Set<string>>();
  for (const assertion of accepted) {
    const key = assertion.subject_type + ":" + assertion.subject_ref + ":" + assertion.predicate_code;
    if (!semantics.has(key)) semantics.set(key, new Set());
    semantics.get(key)!.add(stable(assertion.object_value));
  }
  const state = [...semantics.values()].some((values) => values.size > 1)
    ? "conflicting" : accepted.length ? "documented" : "not_documented";
  const datasets: Row[] = accepted.map((assertion) => ({
    provider: "BA_LABS_BIOLOGICAL_REFERENCE_ASSERTION",
    dataset_id: assertion.assertion_code,
    dataset_version: assertion.assertion_version,
    content_sha256: assertion.content_sha256,
    retrieved_at: assertion.reviewed_at,
  }));
  return { state, assertions: accepted, datasets };
}
export async function loadAuthenticatedBiologicalReferenceAssertions(input: {
  userClient: any;
  organizationId: string;
  biologicalContexts: Row[];
}) {
  const { userClient, organizationId, biologicalContexts } = input;
  if (!userClient || typeof userClient.from !== "function") {
    throw new Error("caller_scoped_supabase_client_required");
  }
  if (!organizationId || !Array.isArray(biologicalContexts)) {
    throw new Error("biological_reference_assertion_input_invalid");
  }
  const subjects = contextSubjects(biologicalContexts);
  if (!subjects.length) return { state: "not_applicable", assertions: [], datasets: [] };
  const subjectTypes = [...new Set(subjects.map((item) => item.subject_type))];
  const subjectRefs = [...new Set(subjects.map((item) => item.subject_ref))];
  const result = await userClient.from("biological_reference_assertions")
    .select("organization_id,assertion_code,assertion_version,subject_type,subject_ref,predicate_code,object_value,unit_code,reference_registry_id,source_locator,evidence_level,applicability,uncertainty,status,reviewed_at")
    .eq("organization_id", organizationId)
    .eq("status", "validated")
    .in("subject_type", subjectTypes)
    .in("subject_ref", subjectRefs)
    .limit(501);
  if (result.error || !Array.isArray(result.data) || result.data.length > 500) {
    throw new Error("biological_reference_assertion_registry_unavailable");
  }
  const rows = result.data.filter((row: Row) => row.organization_id === organizationId &&
    row.status === "validated" && subjectKeysHas(subjects, row.subject_type, row.subject_ref));
  const referenceIds = [...new Set(rows.map((row: Row) => row.reference_registry_id)
    .filter((id: unknown): id is string => typeof id === "string"))];
  let references: Row[] = [];
  if (referenceIds.length) {
    const sourceResult = await userClient.from("biological_reference_registry")
      .select("id,organization_id,reference_id,reference_version,source_url,content_sha256,status,reviewed_at")
      .eq("organization_id", organizationId).eq("status", "validated")
      .in("id", referenceIds).limit(501);
    if (sourceResult.error || !Array.isArray(sourceResult.data) || sourceResult.data.length > 500) {
      throw new Error("biological_reference_assertion_source_unavailable");
    }
    references = sourceResult.data;
  }
  return await buildBiologicalReferenceAssertions({
    organizationId, contexts: biologicalContexts, assertions: rows, references,
  });
}
function subjectKeysHas(subjects: Array<{subject_type:string;subject_ref:string}>, type: unknown, ref: unknown) {
  return typeof type === "string" && typeof ref === "string" &&
    subjects.some((subject) => subject.subject_type === type && subject.subject_ref === ref);
}
