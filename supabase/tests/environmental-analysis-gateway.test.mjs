// Static security contract for the CultureOps environmental analysis gateway.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/environmental-analysis/index.ts", import.meta.url), "utf8");
const locationRead = source.indexOf('.from("locations")');
const membershipRead = source.indexOf('.from("organization_members")');
const observationRead = source.indexOf('.from("environmental_observations")');
const engineCall = source.indexOf('new URL("/v1/analyses/nasa-power", engineUrl)');

assert.match(source, /Bearer\\s\+\(\.\+\)/, "caller must present a bearer JWT");
assert.match(source, /userClient\.auth\.getUser\(accessToken\)/, "JWT must be verified explicitly rather than relying on disabled session persistence");
assert.ok(locationRead >= 0 && membershipRead > locationRead, "RLS-scoped location lookup must precede membership check");
assert.match(source, /\.eq\("organization_id", location\.organization_id\)[\s\S]*?\.eq\("user_id", authData\.user\.id\)/, "membership must match the authorized location and authenticated user");
assert.ok(observationRead > membershipRead, "service-role observation read must happen after membership authorization");
assert.match(source, /\.eq\("organization_id", location\.organization_id\)[\s\S]*?\.eq\("location_id", location\.id\)/, "privileged observation query must be tenant- and location-scoped");
assert.ok(engineCall > observationRead, "private engine may only be called after authorized observation retrieval");
assert.match(source, /X-BA-Engine-Key": engineKey/, "private engine key must be sent server-to-server");
assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/, "wildcard CORS must not be added to the authenticated gateway");
assert.match(source, /BA_ENVIRONMENTAL_ALLOWED_ORIGINS/, "browser origins must be explicitly allowlisted");
assert.match(source, /allowedOrigins\.has\(origin\)/, "unlisted browser origins must be rejected");
assert.match(source, /readJsonBounded\(req, 16_000\)/, "request body must have a hard byte limit");
assert.match(source, /AbortSignal\.timeout\(60_000\)/, "engine call must have a bounded timeout");
assert.match(source, /altitude_m/, "verified location altitude must be required");

const biologicalContextRead = source.indexOf('.from("biological_contexts")');
const environmentProfileRead = source.indexOf('.from("environment_context_profiles")');
const domainProfileRead = source.indexOf('.from("domain_interpretation_profiles")');

const interpretationResolutionCall = source.indexOf("interpretationResolution = await resolveBiologicalInterpretation");
assert.ok(interpretationResolutionCall > membershipRead, "biological context resolution must happen after caller membership authorization");
assert.ok(environmentProfileRead > biologicalContextRead, "environment profile must be resolved from the selected biological context");
assert.ok(domainProfileRead > environmentProfileRead, "domain rules must be loaded from the persisted versioned registry");
assert.ok(observationRead > domainProfileRead, "optional interpretation resolution must not bypass the existing observation authorization sequence");
assert.match(source, /domain_and_subject_id_must_be_provided_together/, "domain and subject must be an atomic optional request pair");
assert.match(source, /ambiguous_context/, "overlapping biological contexts must fail closed for interpretation");
assert.match(source, /context_does_not_cover_scope/, "a context must cover the complete analysis window");
assert.match(source, /environment_profile_unavailable/, "missing environment profiles must be explicit");
assert.match(source, /domain_profile_unavailable/, "missing domain profiles must be explicit");
assert.match(source, /enginePayload\.biological_interpretation\s*=\s*interpretationResolution\.payload/, "only server-resolved profile data may be forwarded to the private engine");
assert.match(source, /interpretation_status:\s*interpretationResolution\.status\s*===\s*"ready"/, "the gateway must preserve explicit interpretation status");

console.log("PASS: environmental analysis gateway security contract");
