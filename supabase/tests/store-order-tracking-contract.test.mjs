import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/track-store-order/index.ts", import.meta.url), "utf8");

assert.match(source, /ALLOWED_ORIGINS[\s\S]*https:\/\/balabs-biotech\.github\.io/, "tracking CORS must be restricted to the storefront origin");
assert.match(source, /MAX_BODY_BYTES\s*=\s*2048/, "tracking request body must be bounded");
assert.match(source, /req\.method !== "POST"/, "tracking must use POST so tokens are not placed in URLs");
assert.match(source, /tracking_token[\s\S]*order_code/, "tracking requires both order code and bearer token");
assert.match(source, /consume_store_checkout_rate_limit/, "tracking lookups must be rate limited");
assert.match(source, /track-store-order:\s*\+\s*ip/, "tracking rate limits must use an endpoint-specific fingerprint");
assert.match(source, /lookup_store_guest_order/, "tracking must use the restricted lookup RPC");
assert.match(source, /p_tracking_token_hash[\s\S]*await hash\(trackingToken\)/, "raw tracking token must be hashed before database lookup");
assert.doesNotMatch(source, /\.from\(["']store_orders["']\)/, "tracking must not query order rows directly");
assert.doesNotMatch(source, /customer_phone|customer_email|delivery_address/, "tracking response must not expose customer or address data");
assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']/, "tracking must not use wildcard CORS");
console.log("PASS: BA Labs Store guest tracking token, rate-limit and PII boundary");
