// Static security and data-integrity contract for the scheduled NASA POWER importer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/nasa-power-scheduled-import/index.ts", import.meta.url), "utf8");
const verifier = source.indexOf('rpc("verify_nasa_power_cron_secret"');
const locationQuery = source.indexOf('from("locations")');
const upsert = source.indexOf('.upsert(rows');

assert.match(source, /req\.method !== "POST"/, "only POST requests are accepted");
assert.match(source, /x-ba-cron-secret/, "dedicated cron secret header is required");
assert.match(source, /candidate\.length < 32/, "short secrets are rejected before database work");
assert.ok(verifier >= 0, "cron secret must be verified by the database");
assert.ok(locationQuery > verifier, "locations must not be queried before the secret is verified");
assert.match(source, /if \(verifyError \|\| verified !== true\) return response\(401/, "failed secret verification must stop processing");
assert.match(source, /SUPABASE_SECRET_KEY.*SUPABASE_SERVICE_ROLE_KEY/s, "server-side privileged key must come from environment variables");
assert.match(source, /\.limit\(100\)/, "scheduled import must have a hard location cap");
assert.match(source, /AbortSignal\.timeout\(25000\)/, "upstream requests must have a timeout");
assert.match(source, /https:\/\/power\.larc\.nasa\.gov\/api\/temporal\/daily\/point/, "upstream host must be NASA POWER");
assert.doesNotMatch(source, /Access-Control-Allow-Origin/, "cron endpoint must not enable browser CORS");

// Data-quality and idempotency invariants.
assert.match(source, /Number\.isFinite\(raw\)/, "non-finite provider values must be rejected");
assert.match(source, /raw <= -900/, "NASA POWER missing-value sentinels must be rejected");
assert.match(source, /!\/\^\\d\{8\}\$\/\.test\(keyDate\)/, "provider dates must use YYYYMMDD format");
assert.ok(upsert > 0, "valid observations must be persisted through upsert");
assert.match(source, /onConflict: "organization_id,location_id,provider_code,dataset_code,variable_code,observed_at"/, "upsert must use the observation deduplication key");
assert.match(source, /ignoreDuplicates: false/, "new provider values must refresh matching observations");
assert.match(source, /organization_id: loc\.organization_id/, "observations must retain the location organization scope");
assert.match(source, /Daily gridded estimates; not local sensor measurements\./, "response must disclose gridded-data limitation");
console.log("PASS: NASA POWER importer security and data-integrity contract");
