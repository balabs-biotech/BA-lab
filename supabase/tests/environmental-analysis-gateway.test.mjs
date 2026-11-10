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

assert.match(source, /\.lte\("valid_from", startDate\)/, "resolved profiles must start no later than the analysis window");
assert.match(source, /valid_to\.gte\.\$\{endDate\}/, "resolved profiles must remain valid through the end of the analysis window");
assert.match(source, /\.eq\(subjectColumn, subjectId\)\s*\.lte\("valid_from", startDate\)\s*\.or\(`valid_to\.is\.null,valid_to\.gte\.\$\{endDate\}`\)/, "biological context candidates must cover the complete analysis window");
assert.match(source, /overlappingContexts/, "partial context windows must be distinguished from unknown subjects");

assert.match(source, /environment_profile_unavailable/, "missing environment profiles must be explicit");
assert.match(source, /domain_profile_unavailable/, "missing domain profiles must be explicit");
assert.match(source, /environmentProfile\.origin !== "weather_provider"[\s\S]*environmentProfile\.context_type !== "outdoor"/, "NASA POWER gridded weather must not be interpreted as greenhouse or sensor measurements");
assert.match(source, /environment_source_mismatch/, "source/context mismatches must have an explicit non-fatal status");
assert.match(source, /enginePayload\.biological_interpretation\s*=\s*interpretationResolution\.payload/, "only server-resolved profile data may be forwarded to the private engine");
assert.match(source, /environment_context:\s*\{[\s\S]*?context_id:\s*environmentProfile\.environment_id/, "the engine context identity must reference environments.id, not the profile-version row ID");
assert.match(source, /interpretation_status:\s*interpretationResolution\.status\s*===\s*"ready"/, "the gateway must preserve explicit interpretation status");

const signalPersistence = source.indexOf('.from("biological_signals")');
assert.ok(signalPersistence > engineCall, "engine-generated signals must only be persisted after the private engine responds");
assert.match(source, /adminClient\s*\.from\("biological_signals"\)[\s\S]*?\.upsert\(/, "signal persistence must use the trusted service-role client and idempotent upsert");
assert.match(source, /domain_profile_code:[\s\S]*?environment_profile_code:/, "persisted signals must retain both immutable profile version identifiers");
assert.match(source, /source_observation_ids:[\s\S]*?context_tags:/, "persisted signals must retain observation provenance and biological context tags");
assert.match(source, /biological_signal_persistence_failed/, "persistence failure must not be reported as a successful durable alert");

assert.match(source, /analysis_method: "environmental_daily"/, "NASA POWER signals must retain their daily climate analysis method");
assert.match(source, /analysis_evidence: signal\.evidence \?\? \{\}/, "environmental signal evidence must be persisted");

console.log("PASS: environmental analysis gateway security contract");
