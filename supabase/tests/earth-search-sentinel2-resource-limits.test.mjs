// Static resource-limit contract for the Sentinel-2 raster preview.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/earth-search-sentinel2-ndvi-preview/index.ts", import.meta.url), "utf8");

assert.match(source, /MAX_REQUEST_BYTES = 32 \* 1024/, "client request JSON must have a small hard cap");
assert.match(source, /MAX_STAC_RESPONSE_BYTES = 2 \* 1024 \* 1024/, "STAC catalogue response must have a bounded cap");
assert.match(source, /async function readBoundedJson\(input: Request \| Response, maxBytes: number\)/, "request and upstream JSON must share the bounded streaming reader");
assert.match(source, /content-length/,"declared body size must be checked before reading");
assert.match(source, /total \+= value\.byteLength/, "stream bytes must be counted as they arrive");
assert.match(source, /reader\.cancel\("json_body_too_large"\)/, "oversized streams must be cancelled");
assert.match(source, /reader\.releaseLock\(\)/, "stream lock must be released");
assert.match(source, /readBoundedJson\(req, MAX_REQUEST_BYTES\)/, "incoming request must use the bounded reader");
assert.match(source, /status_not_used/, "placeholder");
assert.match(source, /request_body_too_large/, "oversized client requests must receive a 413 response");
assert.match(source, /readBoundedJson\(searchResponse, MAX_STAC_RESPONSE_BYTES\)/, "STAC response must use the bounded reader");
assert.match(source, /earth_search_catalogue_response_too_large/, "oversized STAC responses must fail with a controlled 502");
assert.doesNotMatch(source, /req\.json\(\)/, "unbounded request JSON parsing must not return");
assert.doesNotMatch(source, /searchResponse\.json\(\)/, "unbounded STAC JSON parsing must not return");
console.log("PASS: Sentinel-2 bounded request and STAC resource contract");
