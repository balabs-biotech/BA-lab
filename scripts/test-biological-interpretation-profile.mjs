import assert from "node:assert/strict";
import { buildBiologicalInterpretationProfile } from "../supabase/functions/_shared/biological-interpretation-profile.ts";

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
assert.equal(resolved.state, "loaded");
assert.equal(resolved.profile.profile_version, "1.0.0");
assert.deepEqual(resolved.rules, [rule]);
assert.equal(resolved.datasets.length, 2);
assert.equal(resolved.datasets[0].provider, "BA_LABS_INTERPRETATION_PROFILE");
assert.equal(resolved.datasets[1].provider, "BA_LABS_RULE_REGISTRY");
assert.equal(resolved.datasets[1].content_sha256, "d".repeat(64));
assert.equal(resolved.datasets[1].uri, "https://example.org/pleurotus-protocol");

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

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{ ...profile, rules: [{ ...rule, unsupported_field: true }] }],
  }),
  /interpretation_profile_rule_shape_invalid/,
);

await assert.rejects(
  buildBiologicalInterpretationProfile({
    ...input,
    profiles: [{ ...profile, rules: [{ ...rule, threshold: Number.NaN }] }],
  }),
  /interpretation_profile_rule_content_invalid/,
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
