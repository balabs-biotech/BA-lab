// Static security contract for the scheduled NASA POWER importer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/nasa-power-scheduled-import/index.ts", import.meta.url), "utf8");
const verifier = source.indexOf('rpc("verify_nasa_power_cron_secret"');
const locationQuery = source.indexOf('from("locations")');

assert.match(source, /req\.method !== "POST"/, "only POST requests are accepted");
assert.match(source, /x-ba-cron-secret/, "dedicated cron secret header is required");
assert.match(source, /candidate\.length < 32/, "short secrets are rejected before database work");
assert.ok(verifier >= 0, "cron secret must be verified by the database");
assert.ok(locationQuery > verifier, "locations must not be queried before the secret is verified");
assert.match(source, /if \(verifyError \|\| verified !== true\) return response\(401/, "failed secret verification must stop processing");
assert.match(source, /\.limit\(100\)/, "scheduled import must have a hard location cap");
assert.match(source, /AbortSignal\.timeout\(25000\)/, "upstream requests must have a timeout");
assert.match(source, /https:\/\/power\.larc\.nasa\.gov\/api\/temporal\/daily\/point/, "upstream host must be NASA POWER");
assert.doesNotMatch(source, /Access-Control-Allow-Origin/, "cron endpoint must not enable browser CORS");
console.log("PASS: NASA POWER scheduled-import security contract");
