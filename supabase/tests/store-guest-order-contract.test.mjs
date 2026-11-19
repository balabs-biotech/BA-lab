import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/create-store-order/index.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../config.toml", import.meta.url), "utf8");

for (const functionName of ["store-catalogue", "create-store-order", "track-store-order"]) {
  assert.match(config, new RegExp("\\\\[functions\\\\." + functionName + "\\\\]\\\\s*verify_jwt = false"), functionName + " must explicitly disable gateway JWT verification and use its own access contract");
}
assert.match(source, /ALLOWED_ORIGINS[\s\S]*https:\/\/balabs-biotech\.github\.io/, "guest order CORS must be restricted to the storefront origin");
assert.match(source, /MAX_BODY_BYTES\s*=\s*16\s*\*\s*1024/, "request body must be bounded");
assert.match(source, /MAX_ITEMS\s*=\s*30/, "cart item count must be bounded");
assert.match(source, /req\.method !== "POST"/, "guest order endpoint must accept only POST");
assert.match(source, /STORE_RATE_LIMIT_HMAC_SECRET/, "rate limiting must use a server-only HMAC secret");
assert.match(source, /consume_store_checkout_rate_limit/, "requests must pass through the atomic database rate limiter");
assert.match(source, /create-store-order:\s*\+\s*ip/, "checkout rate limits must use an endpoint-specific fingerprint");
assert.match(source, /create_store_guest_order/, "order creation must use the atomic database RPC");
assert.match(source, /STORE_TERMS_VERSION[\s\S]*STORE_PRIVACY_NOTICE_VERSION/, "the active legal document versions must be enforced server-side");
assert.match(source, /website/, "honeypot field must be checked");
assert.match(source, /tracking_token[\s\S]*idempotency_key/, "guest tracking and idempotency tokens must be validated");
assert.match(source, /p_tracking_token_hash[\s\S]*p_idempotency_key_hash/, "only token hashes may be sent to the database");
assert.match(source, /Deliberately ignore all browser-supplied price/, "the server must ignore client price and discount fields");
assert.doesNotMatch(source, /\.from\(["']store_orders["']\)/, "order writes must use the atomic RPC, not separate non-transactional REST writes");
assert.doesNotMatch(source, /console\.(log|error)\([^
]*(customer|phone|email|address|rawBody)/i, "customer PII and request bodies must never be logged");
assert.doesNotMatch(source, /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']/, "wildcard CORS must not be enabled");
console.log("PASS: BA Labs Store guest-order intake validation, rate limit, idempotency and PII boundary");
