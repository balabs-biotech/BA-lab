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
assert.doesNotMatch(source, /Access-Control-Allow-Origin": "\*"/, "wildcard CORS must not be added to the authenticated gateway without a deliberate policy");
assert.match(source, /readJsonBounded\(req, 16_000\)/, "request body must have a hard byte limit");
assert.match(source, /AbortSignal\.timeout\(60_000\)/, "engine call must have a bounded timeout");
assert.match(source, /altitude_m/, "verified location altitude must be required");
console.log("PASS: environmental analysis gateway security contract");
