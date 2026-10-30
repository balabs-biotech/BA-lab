// Static security contract for device-authenticated IoT ingestion.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/iot-ingest/index.ts", import.meta.url), "utf8");
const reader = source.indexOf("async function readBoundedBody(");
const bodyCall = source.indexOf("readBoundedBody(req, 32_000)");
const tokenCheck = source.indexOf('auth.match(/^Bearer');
const serviceClient = source.indexOf("createClient(url, serviceKey");

assert.ok(reader >= 0, "request body must be consumed through a bounded stream reader");
assert.ok(bodyCall > tokenCheck, "device token syntax must be checked before reading the request body");
assert.ok(serviceClient > bodyCall, "service-role client must be created only after bounded parsing and validation");
assert.match(source, /totalBytes \+= value\.byteLength/, "stream byte count must include every chunk");
assert.match(source, /if \(totalBytes > maxBytes\)/, "stream limit must be enforced before buffering the oversized chunk");
assert.match(source, /await reader\.cancel\(\)/, "oversized streams must be cancelled immediately");
assert.match(source, /reader\.releaseLock\(\)/, "stream reader lock must always be released");
assert.match(source, /\.eq\("token_sha256", tokenHash\)/, "device token must be looked up by its SHA-256 digest");
assert.match(source, /\.eq\("enabled", true\)/, "disabled devices must not authenticate");
assert.match(source, /rpc\("ingest_iot_payload"/, "writes must use the atomic ingestion RPC");
assert.doesNotMatch(source, /await req\.text\(\)/, "unbounded request.text() buffering must not return");
console.log("PASS: IoT ingestion bounded-body and device-auth security contract");
