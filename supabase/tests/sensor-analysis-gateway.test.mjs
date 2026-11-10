// Static security and provenance contract for the independent Sensor Engine gateway.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/sensor-analysis/index.ts", import.meta.url), "utf8");
const jwt = source.indexOf("userClient.auth.getUser(accessToken)");
const environmentRead = source.indexOf('.from("environments")');
const membershipRead = source.indexOf('.from("organization_members")');
const profileRead = source.indexOf('.from("environment_context_profiles")');
const measurementRead = source.indexOf('.from("measurements")');
const engineCall = source.indexOf('new URL("/v1/analyses/sensors", engineUrl)');

assert.match(source, /const match = \/\^Bearer/, "caller must present a bearer JWT");
assert.ok(jwt >= 0 && environmentRead > jwt, "JWT verification must precede RLS environment lookup");
assert.ok(membershipRead > environmentRead, "organization membership must be checked after RLS environment lookup");
assert.ok(profileRead > membershipRead, "service-role profile reads must follow membership authorization");
assert.ok(measurementRead > profileRead, "sensor measurement reads must follow profile resolution");
assert.ok(engineCall > measurementRead, "private engine call must follow authorized measurement retrieval");
assert.match(source, /\.eq\("organization_id", authorizedEnvironment\.organization_id\)/, "profile lookup must be tenant-scoped");
assert.match(source, /\.eq\("environment_id", environmentId\)/, "profile lookup must be environment-scoped");
assert.match(source, /\.eq\("metadata->>source", "iot"\)/, "only IoT-provenance rows may enter this route");
assert.match(source, /\.in\("iot_device_id", sensorIds\)/, "measurements must be limited to profile-bound devices");
assert.match(source, /profile\.origin !== "sensor"/, "non-sensor profiles must be rejected");
assert.match(source, /profile\.valid_from > fromDate/, "profile must cover the beginning of the requested date window");
assert.match(source, /profile\.valid_to < toDate/, "profile must cover the end of the requested date window");
assert.match(source, /profile\.timezone/, "analysis must use the versioned profile timezone");
assert.match(source, /X-BA-Engine-Key": engineKey/, "engine secret must be forwarded server-to-server");
assert.match(source, /AbortSignal\.timeout\(60_000\)/, "private engine call must have a bounded timeout");
assert.match(source, /BA_ENVIRONMENTAL_ALLOWED_ORIGINS/, "browser origins must be explicitly allowlisted");
assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/, "wildcard CORS must not be used");
assert.match(source, /MAX_ROWS \+ 1/, "measurement retrieval must detect truncation beyond the hard cap");

assert.match(source, /temporal_window_seconds: temporalWindowSeconds/, "explicit temporal window must be forwarded");
assert.match(source, /temporal_minimum_history: temporalMinimumHistory/, "explicit minimum history must be forwarded");
assert.match(source, /temporal_threshold: temporalThreshold/, "explicit robust threshold must be forwarded");
assert.match(source, /temporal_screening_parameters_must_be_supplied_together_and_positive/, "partial temporal configuration must be rejected");

assert.match(source, /MAX_TEMPORAL_WINDOW_SECONDS/, "temporal history request must be bounded");
assert.match(source, /Math\.ceil\(temporalWindowSeconds \/ 86_400\)/, "gateway must retrieve enough prior history");
assert.match(source, /localCalendarDate\(row\.measured_at, profile\.timezone\)/, "profile validity must use local calendar dates");
assert.match(source, /profileScopedRows/, "only measurements valid under the resolved profile may be forwarded");

assert.match(source, /subject_id_must_be_a_valid_uuid/, "biological subject binding must be UUID-validated");
assert.match(source, /\.from\("biological_contexts"\)/, "gateway must resolve a persisted biological context");
assert.match(source, /\.from\("domain_interpretation_profiles"\)/, "gateway must resolve a versioned domain profile");
assert.match(source, /biologicalInterpretationPayload/, "resolved biological context and domain profile must be forwarded");
assert.match(source, /biological_contexts_environment_fk/, "biological context must use the explicit environment relationship");

assert.match(source, /from\("biological_signals"\)/, "interpreted sensor signals must be persisted");
assert.match(source, /\.upsert\(signalRows/, "sensor signal persistence must use an idempotent upsert");
assert.match(source, /analysis_method: signal\.evidence\?\.assessment_type === "causal_robust_temporal_screen"/, "temporal findings must retain their analysis method");
assert.match(source, /analysis_evidence: signal\.evidence \?\? \{\}/, "sensor signal evidence must be persisted");
assert.match(source, /biological_signal_persistence_failed/, "failed persistence must not be reported as a successful analysis");
assert.match(source, /signal_persistence_status: signalPersistenceStatus/, "gateway response must expose persistence status");

console.log("PASS: sensor analysis gateway security contract");
