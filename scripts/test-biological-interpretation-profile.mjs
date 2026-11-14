import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildBiologicalInterpretationProfile,
  loadAuthenticatedBiologicalInterpretationProfile,
} from "../supabase/functions/_shared/biological-interpretation-profile.ts";

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + stable(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}
function profileDigest(profileId, profileVersion, rules) {
  return createHash("sha256").update(stable({
    profile_id: profileId,
    profile_version: profileVersion,
    rules,
  })).digest("hex");
}

const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rule = {
  rule_id: "mycology.temperature.upper_bound",
  rule_version: "1.0.0",
  feature_code: "series.measurement.air_temperature.maximum",
  operator: "gt",
  threshold: 22,
  unit_code: "degC",
  statement: "Observed maximum exceeds the documented threshold.",
  context_match: {
    taxon_code: "Pleurotus ostreatus",
    culture_stage: "fruiting",
  },
  reference_id: "ba-labs.protocols.pleurotus-fruiting",
  reference_version: "2026.1",
};
const profile = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organization_id: organizationId,
  domain: "mycology",
  profile_code: "biological.context.features",
  profile_version: "1.0.0",
  rules: [rule],
  content_sha256: profileDigest(
    "mycology.biological.context.features",
    "1.0.0",
    [rule],
  ),
  status: "active",
  valid_from: "2026-01-01",
  valid_to: null,
  created_at: "2026-11-10T07:55:00Z",
};
const reference = {
  organization_id: organizationId,
  reference_id: "ba-labs.protocols.pleurotus-fruiting",
  reference_version: "2026.1",
  source_url: "https://example.org/pleurotus-protocol",
  content_sha256: "d".repeat(64),
  status: "validated",
  reviewed_at: "2026-11-10T07:55:00Z",
};
const input = {
  organizationId,
  domain: "mycology",
  windowStartDate: "2026-11-10",
  windowLastIncludedDate: "2026-11-12",
  profiles: [profile],
  references: [reference],
};

const resolved = await buildBiologicalInterpretationProfile(input);
const ambiguousDomain = await loadAuthenticatedBiologicalInterpretationProfile({
  userClient: { from() { throw new Error("unexpected_registry_query"); } },
  organizationId,
  domain: null,
  domainAmbiguous: true,
  contextStable: false,
  windowStartDate: input.windowStartDate,
  windowLastIncludedDate: input.windowLastIncludedDate,
});
assert.equal(ambiguousDomain.state, "domain_ambiguous");

const unstableContext = await loadAuthenticatedBiologicalInterpretationProfile({
  userClient: { from() { throw new Error("unexpected_registry_query"); } },
  organizationId,
  domain: "mycology",
  domainAmbiguous: false,
  contextStable: false,
  windowStartDate: input.windowStartDate,
  windowLastIncludedDate: input.windowLastIncludedDate,
});
assert.equal(unstableContext.state, "context_not_stable");

const absentDomain = await loadAuthenticatedBiologicalInterpretationProfile({
  userClient: { from() { throw new Error("unexpected_registry_query"); } },
  organizationId,
  domain: null,
  domainAmbiguous: false,
  contextStable: true,
  windowStartDate: input.windowStartDate,
  windowLastIncludedDate: input.windowLastIncludedDate,
});
assert.equal(absentDomain.state, "not_configured");

await assert.rejects(
  loadAuthenticatedBiologicalInterpretationProfile({
    userClient: null,
    organizationId,
    domain: "mycology",
    domainAmbiguous: false,
    contextStable: true,
    windowStartDate: input.windowStartDate,
    windowLastIncludedDate: input.windowLastIncludedDate,
  }),
  /caller_scoped_supabase_client_required/,
);

assert.equal(resolved.state, "loaded");
assert.equal(resolved.profile.profile_version, "1.0.0");
assert.deepEqual(resolved.rules, [rule]);
assert.equal(resolved.datasets.length, 2);
assert.equal(resolved.datasets[0].provider, "BA_LABS_INTERPRETATION_PROFILE");
assert.equal(resolved.datasets[0].dataset_id, "biological.context.features");
assert.equal(resolved.datasets[0].profile_id, "mycology.biological.context.features");
assert.equal(resolved.datasets[0].profile_version, "1.0.0");
assert.equal(resolved.datasets[0].content_sha256, profile.content_sha256);
assert.equal(resolved.datasets[1].provider, "BA_LABS_RULE_REGISTRY");
assert.equal(resolved.datasets[1].content_sha256, "d".repeat(64));
assert.equal(resolved.datasets[1].uri, "https://example.org/pleurotus-protocol");

const queryLog = [];
const makeQuery = (table) => {
  const query = {
    select(value) { queryLog.push([table, "select", value]); return this; },
    eq(field, value) { queryLog.push([table, "eq", field, value]); return this; },
    lte(field, value) { queryLog.push([table, "lte", field, value]); return this; },
    or(value) { queryLog.push([table, "or", value]); return this; },
    in(field, value) { queryLog.push([table, "in", field, value]); return this; },
    limit(value) {
      queryLog.push([table, "limit", value]);
      return Promise.resolve({
        error: null,
        data: table === "domain_interpretation_profiles" ? [profile] : [reference],
      });
    },
  };
  return query;
};
const authenticated = await loadAuthenticatedBiologicalInterpretationProfile({
  userClient: { from(table) { queryLog.push(["from", table]); return makeQuery(table); } },
  organizationId,
  domain: "mycology",
  domainAmbiguous: false,
  contextStable: true,
  windowStartDate: input.windowStartDate,
  windowLastIncludedDate: input.windowLastIncludedDate,
});
assert.equal(authenticated.state, "loaded");
assert.deepEqual(queryLog.filter((entry) => entry[0] === "from").map((entry) => entry[1]), [
  "domain_interpretation_profiles",
  "biological_reference_registry",
]);
assert.ok(queryLog.some((entry) =>
  entry[0] === "domain_interpretation_profiles" &&
  entry[1] === "eq" && entry[2] === "organization_id" && entry[3] === organizationId
));
assert.ok(queryLog.some((entry) =>
  entry[0] === "biological_reference_registry" &&
  entry[1] === "eq" && entry[2] === "status" && entry[3] === "validated"
));

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{ ...profile, content_sha256: "f".repeat(64) }],
  }),
  /interpretation_profile_content_hash_mismatch/,
);

const legacyProfile = await buildBiologicalInterpretationProfile({
  ...input,
  profiles: [{ ...profile, content_sha256: null }],
});
assert.equal(
  legacyProfile.datasets[0].content_sha256,
  profileDigest("mycology.biological.context.features", "1.0.0", [rule]),
);

const missingReference = await assert.rejects(
  buildBiologicalInterpretationProfile({ ...input, references: [] }),
  /interpretation_reference_not_validated/,
);
assert.equal(missingReference, undefined);

const outOfWindow = await buildBiologicalInterpretationProfile({
  ...input,
  profiles: [{ ...profile, valid_to: "2026-11-11" }],
});
assert.equal(outOfWindow.state, "not_configured");

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [profile, { ...profile, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
  }),
  /active_interpretation_profile_ambiguous/,
);

const unsupportedRules = [{ ...rule, unsupported_field: true }];
await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{
      ...profile,
      rules: unsupportedRules,
      content_sha256: profileDigest("mycology.biological.context.features", "1.0.0", unsupportedRules),
    }],
  }),
  /interpretation_profile_rule_shape_invalid/,
);

const nonFiniteRules = [{ ...rule, threshold: Number.NaN }];
await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{
      ...profile,
      rules: nonFiniteRules,
      content_sha256: profileDigest("mycology.biological.context.features", "1.0.0", nonFiniteRules),
    }],
  }),
  /interpretation_profile_rule_content_invalid/,
);

const identityScopedRules = [{
  ...rule,
  identity_match: {
    assertion_type: "strain.designation",
    assertion_value: "HK35",
  },
}];
const identityScopedProfile = await buildBiologicalInterpretationProfile({
  ...input,
  profiles: [{
    ...profile,
    rules: identityScopedRules,
    content_sha256: profileDigest("mycology.biological.context.features", "1.0.0", identityScopedRules),
  }],
});
assert.equal(identityScopedProfile.state, "loaded");
assert.equal(identityScopedProfile.rules[0].identity_match.assertion_value, "HK35");

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{
      ...profile,
      rules: [{ ...rule, identity_match: { assertion_type: "strain.designation" } }],
      content_sha256: profileDigest(
        "mycology.biological.context.features",
        "1.0.0",
        [{ ...rule, identity_match: { assertion_type: "strain.designation" } }],
      ),
    }],
  }),
  /interpretation_profile_identity_match_invalid/,
);

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    references: [reference, { ...reference, source_url: "https://example.org/duplicate" }],
  }),
  /interpretation_reference_identity_ambiguous/,
);

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{ ...profile, profile_version: "draft-version" }],
  }),
  /interpretation_profile_metadata_invalid/,
);

console.log("Biological interpretation profile resolver contract passed");
