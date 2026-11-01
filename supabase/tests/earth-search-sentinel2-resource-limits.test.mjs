// Static resource-limit contract for the Sentinel-2 raster preview.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/earth-search-sentinel2-ndvi-preview/index.ts", import.meta.url), "utf8");

assert.match(source, /MAX_REQUEST_BYTES = 32 \* 1024/, "client request JSON must have a small hard cap");
assert.match(source, /MAX_STAC_RESPONSE_BYTES = 2 \* 1024 \* 1024/, "STAC catalogue response must have a bounded cap");
assert.match(source, /MAX_RASTER_WINDOW_PIXELS = 2_000_000/, "every reflectance band must have a bounded raster window");
assert.match(source, /MAX_SCL_WINDOW_PIXELS = 1_000_000/, "the SCL classification window must have a bounded raster window");
assert.match(source, /async function readBoundedJson\(input: Request \| Response, maxBytes: number\)/, "request and upstream JSON must share the bounded streaming reader");
assert.match(source, /content-length/,"declared body size must be checked before reading");
assert.match(source, /total \+= value\.byteLength/, "stream bytes must be counted as they arrive");
assert.match(source, /reader\.cancel\("json_body_too_large"\)/, "oversized streams must be cancelled");
assert.match(source, /reader\.releaseLock\(\)/, "stream lock must be released");
assert.match(source, /readBoundedJson\(req, MAX_REQUEST_BYTES\)/, "incoming request must use the bounded reader");
assert.match(source, /json\(413, \{ error: "request_body_too_large"/, "oversized client requests must receive a 413 response");
assert.match(source, /readBoundedJson\(searchResponse, MAX_STAC_RESPONSE_BYTES\)/, "STAC response must use the bounded reader");
assert.match(source, /earth_search_catalogue_response_too_large/, "oversized STAC responses must fail with a controlled 502");
assert.match(source, /const windowDimensions =/, "raster window dimensions must be computed centrally");
assert.match(source, /const validWindow =/, "raster windows must be validated before reading");
assert.match(source, /validWindow\(redWin, MAX_RASTER_WINDOW_PIXELS\)/, "red band window must be bounded");
assert.match(source, /validWindow\(nirWin, MAX_RASTER_WINDOW_PIXELS\)/, "NIR band window must be bounded");
assert.match(source, /validWindow\(greenWin, MAX_RASTER_WINDOW_PIXELS\)/, "green band window must be bounded when requested");
assert.match(source, /validWindow\(blueWin, MAX_RASTER_WINDOW_PIXELS\)/, "blue band window must be bounded when requested");
assert.match(source, /validWindow\(sclWin, MAX_SCL_WINDOW_PIXELS, 1\)/, "SCL window must be bounded before raster allocation");
assert.match(source, /width >= minDimension && height >= minDimension/, "reflectance windows must reject degenerate one-pixel dimensions");
assert.doesNotMatch(source, /req\.json\(\)/, "unbounded request JSON parsing must not return");
assert.doesNotMatch(source, /searchResponse\.json\(\)/, "unbounded STAC JSON parsing must not return");
console.log("PASS: Sentinel-2 request, STAC and all-band raster resource contract");
