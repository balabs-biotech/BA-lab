import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/store-catalogue/index.ts", import.meta.url), "utf8");

assert.match(source, /req\.method !== "GET"/, "catalogue endpoint must be read-only");
assert.match(source, /ALLOWED_ORIGINS[\s\S]*https:\/\/balabs-biotech\.github\.io/, "GitHub Pages origin must be explicitly allow-listed");
assert.match(source, /publication_status", "eq\\.published"/, "only published catalogue products may be returned");
assert.match(source, /store_variants/, "published product variants must be returned");
assert.match(source, /price_dzd/, "the public catalogue may expose the confirmed public price");
assert.doesNotMatch(source, /customer_phone|customer_email|delivery_address|tracking_token_hash|store_orders/, "catalogue endpoint must never query or expose guest order data");
assert.doesNotMatch(source, /stock_quantity/, "internal stock quantities must not be exposed by the public catalogue");
assert.match(source, /SUPABASE_SECRET_KEYS/, "new Supabase secret-key configuration must be supported");
assert.match(source, /legacyJwt[\s\S]*Authorization/, "legacy service-role JWTs must use the bearer header");
assert.match(source, /sb_secret_[\s\S]*apikey/, "new Supabase secret keys must be sent on apikey without a bearer JWT");
assert.doesNotMatch(source, /createClient|Authorization.*sb_secret_/, "new secret keys must not be passed through a JWT-based client");
assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/, "existing legacy Supabase server key must remain a supported fallback");
assert.match(source, /Cache-Control/, "public catalogue responses must define an explicit cache policy");
console.log("PASS: BA Labs Store public catalogue read-only and data-minimization contract");
