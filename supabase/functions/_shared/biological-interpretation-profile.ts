// SPDX-License-Identifier: MIT
/**
 * Resolves an approved, tenant-scoped interpretation profile and its
 * independently validated scientific references using the caller's RLS client.
 */
const PROFILE_CODE = "biological.context.features";
const ALLOWED_DOMAINS = new Set(["mycology", "greentech", "lab"]);
const RULE_FIELDS = new Set([
  "rule_id", "rule_version", "feature_code", "operator", "threshold",
  "unit_code", "statement", "context_match", "reference_id", "reference_version",
]);

type Row = Record<string, any>;

function isObject(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (isObject(value)) {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + stable(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireValidRuleReferences(rules: unknown): Array<{ id: string; version: string }> {
  if (!Array.isArray(rules) || rules.length > 100) {
    throw new Error("interpretation_profile_rules_invalid");
  }
  const seen = new Set<string>();
  const references: Array<{ id: string; version: string }> = [];
  for (const rule of rules) {
    if (!isObject(rule) || Object.keys(rule).length !== RULE_FIELDS.size ||
        Object.keys(rule).some((key) => !RULE_FIELDS.has(key))) {
      throw new Error("interpretation_profile_rule_shape_invalid");
    }
    if (typeof rule.rule_id !== "string" || !/^[a-z][a-z0-9_.-]{1,79}$/.test(rule.rule_id) ||
        typeof rule.rule_version !== "string" || !/^\d+\.\d+\.\d+$/.test(rule.rule_version) ||
        typeof rule.reference_id !== "string" || !rule.reference_id.trim() ||
        typeof rule.reference_version !== "string" || !rule.reference_version.trim()) {
      throw new Error("interpretation_profile_rule_identity_invalid");
    }
    if (seen.has(rule.rule_id)) throw new Error("interpretation_profile_duplicate_rule_id");
    seen.add(rule.rule_id);
    references.push({ id: rule.reference_id, version: rule.reference_version });
  }
  return references;
}

export async function buildBiologicalInterpretationProfile(input: {
  organizationId: string;
  domain: string;
  windowStartDate: string;
  windowLastIncludedDate: string;
  profiles: Row[];
  references: Row[];
}) {
  const { organizationId, domain, windowStartDate, windowLastIncludedDate } = input;
  if (!organizationId || !ALLOWED_DOMAINS.has(domain)) {
    throw new Error("interpretation_profile_domain_invalid");
  }
  if (!Array.isArray(input.profiles) || !Array.isArray(input.references)) {
    throw new Error("interpretation_profile_registry_unavailable");
  }
  const applicable = input.profiles.filter((profile) =>
    isObject(profile) &&
    profile.organization_id === organizationId &&
    profile.domain === domain &&
    profile.profile_code === PROFILE_CODE &&
    profile.status === "active" &&
    typeof profile.valid_from === "string" &&
    profile.valid_from <= windowStartDate &&
    (profile.valid_to === null || (
      typeof profile.valid_to === "string" && profile.valid_to >= windowLastIncludedDate
    ))
  );
  if (applicable.length === 0) {
    return { state: "not_configured", profile: null, rules: [], datasets: [] };
  }
  if (applicable.length !== 1) throw new Error("active_interpretation_profile_ambiguous");

  const profile = applicable[0];
  const references = requireValidRuleReferences(profile.rules);
  const resolvedReferences = new Map<string, Row>();
  for (const reference of input.references) {
    if (!isObject(reference) ||
        reference.organization_id !== organizationId ||
        reference.status !== "validated" ||
        typeof reference.content_sha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(reference.content_sha256) ||
        typeof reference.reviewed_at !== "string") continue;
    resolvedReferences.set(reference.reference_id + "@" + reference.reference_version, reference);
  }

  const datasets: Row[] = [{
    provider: "BA_LABS_INTERPRETATION_PROFILE",
    dataset_id: profile.profile_code,
    dataset_version: profile.profile_version,
    content_sha256: await sha256(stable({
      organization_id: profile.organization_id,
      domain: profile.domain,
      profile_code: profile.profile_code,
      profile_version: profile.profile_version,
      rules: profile.rules,
      valid_from: profile.valid_from,
      valid_to: profile.valid_to,
    })),
    retrieved_at: profile.created_at,
  }];

  for (const reference of references) {
    const key = reference.id + "@" + reference.version;
    const row = resolvedReferences.get(key);
    if (!row) throw new Error("interpretation_reference_not_validated");
    const manifest: Row = {
      provider: "BA_LABS_RULE_REGISTRY",
      dataset_id: row.reference_id,
      dataset_version: row.reference_version,
      content_sha256: row.content_sha256,
      retrieved_at: row.reviewed_at,
    };
    if (typeof row.source_url === "string" && row.source_url.trim()) {
      try {
        const uri = new URL(row.source_url);
        if (uri.protocol === "https:" || uri.protocol === "http:") manifest.uri = uri.toString();
      } catch {
        throw new Error("interpretation_reference_source_url_invalid");
      }
    }
    datasets.push(manifest);
  }

  return {
    state: "loaded",
    profile: {
      id: profile.id,
      domain: profile.domain,
      profile_code: profile.profile_code,
      profile_version: profile.profile_version,
      valid_from: profile.valid_from,
      valid_to: profile.valid_to,
    },
    rules: profile.rules,
    datasets,
  };
}

export async function loadAuthenticatedBiologicalInterpretationProfile(input: {
  userClient: any;
  organizationId: string;
  domain: string | null;
  domainAmbiguous: boolean;
  windowStartDate: string;
  windowLastIncludedDate: string;
}) {
  const { userClient, organizationId, domain, domainAmbiguous, windowStartDate, windowLastIncludedDate } = input;
  if (!userClient || typeof userClient.from !== "function") {
    throw new Error("caller_scoped_supabase_client_required");
  }
  if (domainAmbiguous) throw new Error("biological_interpretation_domain_ambiguous");
  if (!domain) return { state: "not_configured", profile: null, rules: [], datasets: [] };
  if (!ALLOWED_DOMAINS.has(domain)) throw new Error("interpretation_profile_domain_invalid");

  const profileResult = await userClient.from("domain_interpretation_profiles")
    .select("id,organization_id,domain,profile_code,profile_version,rules,status,valid_from,valid_to,created_at")
    .eq("organization_id", organizationId)
    .eq("domain", domain)
    .eq("profile_code", PROFILE_CODE)
    .eq("status", "active")
    .lte("valid_from", windowStartDate)
    .or("valid_to.is.null,valid_to.gte." + windowLastIncludedDate)
    .limit(2);
  if (profileResult.error || !Array.isArray(profileResult.data)) {
    throw new Error("interpretation_profile_registry_unavailable");
  }
  if (profileResult.data.length > 1) throw new Error("active_interpretation_profile_ambiguous");
  const profiles = profileResult.data;

  let referenceRows: Row[] = [];
  if (profiles.length === 1) {
    const referenceKeys = requireValidRuleReferences(profiles[0].rules);
    const referenceIds = [...new Set(referenceKeys.map((reference) => reference.id))];
    if (referenceIds.length) {
      const referenceResult = await userClient.from("biological_reference_registry")
        .select("organization_id,reference_id,reference_version,source_url,content_sha256,status,reviewed_at")
        .eq("organization_id", organizationId)
        .eq("status", "validated")
        .in("reference_id", referenceIds)
        .limit(200);
      if (referenceResult.error || !Array.isArray(referenceResult.data)) {
        throw new Error("biological_reference_registry_unavailable");
      }
      referenceRows = referenceResult.data;
    }
  }

  return await buildBiologicalInterpretationProfile({
    organizationId,
    domain,
    windowStartDate,
    windowLastIncludedDate,
    profiles,
    references: referenceRows,
  });
}
