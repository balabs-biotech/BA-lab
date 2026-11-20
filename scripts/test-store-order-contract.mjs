import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("store/index.html", "utf8");
const css = readFileSync("store/store.css", "utf8");
const js = readFileSync("store/store.js", "utf8");
const migration = readFileSync("supabase/migrations/20261119223731_store_orders_v1.sql", "utf8");
const rateMigration = readFileSync("supabase/migrations/20261119224223_store_checkout_rate_limits_v1.sql", "utf8");
const retryMigration = readFileSync("supabase/migrations/20261120000100_store_order_notion_retry_v1.sql", "utf8");
const edge = readFileSync("supabase/functions/create-store-order/index.ts", "utf8");
const readme = readFileSync("store/README.md", "utf8");
const syncWorker = readFileSync("supabase/functions/store-order-sync/index.ts", "utf8");


assert.ok(html.includes('class="request-layout"') && html.includes('id="requestSummary"'), "Enquiry layout must show selected items beside the customer form");
assert.ok(css.includes(".request-layout") && css.includes("@media(max-width:760px)"), "Enquiry layout must be responsive");
assert.ok(js.includes("create-store-order") && !js.includes("functions/v1/store-notion-order"), "Browser must use the Supabase-first endpoint");
assert.ok(js.includes("request_id:activeRequestId"), "Browser must send a stable idempotency reference");
assert.ok(js.includes("const STORE_ORDER_ENABLED=false"), "Guest submission must remain disabled until end-to-end verification");
assert.ok(js.includes("const TURNSTILE_SITE_KEY=''"), "The public Turnstile site key must remain blank until provisioned");
assert.ok(html.includes('id="turnstileWidget"') && html.includes('frame-src https://challenges.cloudflare.com') && html.includes("script-src 'self' https://challenges.cloudflare.com"), "Turnstile mount and narrowly scoped CSP permissions must exist");
assert.ok(js.includes("window.turnstile.render") && js.includes("turnstileToken,customer:") && js.includes("submitOrder.disabled=true"), "Guest submission must require a browser-verified Turnstile token");
assert.ok(js.includes("if(!STORE_ORDER_ENABLED||!TURNSTILE_SITE_KEY)return;"), "Turnstile must not load while order intake is disabled or the site key is absent");
assert.ok(edge.includes('Deno.env.get("STORE_ORDER_ENABLED") !== "true"') && edge.indexOf('Deno.env.get("STORE_ORDER_ENABLED") !== "true"') < edge.indexOf('const declaredLength = Number(req.headers.get("content-length")'), "The Edge Function must fail closed server-side unless STORE_ORDER_ENABLED is explicitly true");
assert.ok(!js.includes("NOTION_STORE_API_KEY") && !js.includes("SUPABASE_SERVICE_ROLE_KEY") && !js.includes("sb_secret_"), "No server credential may appear in browser code");

assert.ok(migration.includes("create table if not exists public.store_orders"), "Dedicated storefront order table must exist");
assert.ok(migration.includes("create table if not exists public.store_order_items"), "Dedicated storefront item table must exist");
assert.ok(migration.includes("alter table public.store_orders enable row level security"), "Store order table must enable RLS");
assert.ok(migration.includes("revoke all on table public.store_orders from public, anon, authenticated"), "Public roles must not access store orders directly");
assert.ok(migration.includes("grant execute on function public.create_store_order(uuid,jsonb,jsonb,text) to service_role"), "Only the backend service role may call the insert RPC");
assert.ok(rateMigration.includes("create table if not exists public.store_checkout_rate_limits"), "Persistent rate-limit table must exist");
assert.ok(rateMigration.includes("create or replace function public.consume_store_rate_limit"), "Persistent rate-limit RPC must exist");
assert.ok(rateMigration.includes("grant execute on function public.consume_store_rate_limit(text,integer,integer) to service_role"), "Only the backend service role may call the rate-limit RPC");

for (const [label, migrationText, expected] of [
  ["order persistence", migration, 1],
  ["rate limiting", rateMigration, 1],
  ["Notion retry worker", retryMigration, 3]
]) {
  const hardenedFunctions = migrationText.match(/security definer\s+set search_path = ''/gi) || [];
  assert.equal(hardenedFunctions.length, expected, label + " SECURITY DEFINER functions must pin an empty search_path");
}


assert.equal((edge.match(/"BAL-/g) || []).length, 15, "Edge Function must validate the 15 currently requestable references");
const productBlock = js.slice(js.indexOf("let products=["), js.indexOf("\n];", js.indexOf("let products=[")));
const storefrontRequestable = productBlock.split("\n").flatMap(line => {
  const code = line.match(/(?:code:'|"code":")(BAL-[A-Z0-9-]+)/);
  const status = line.match(/(?:status:'|"status":")([a-z_]+)/);
  return code && status && status[1] !== "unavailable" ? [code[1]] : [];
}).sort();
const serverRequestable = [...edge.matchAll(/"(BAL-[A-Z0-9-]+)"\s*:/g)].map(match => match[1]).sort();
assert.deepEqual(serverRequestable, storefrontRequestable, "Browser-selectable products and the server-side order allowlist must match exactly");
assert.ok(edge.includes("rpc/create_store_order"), "Edge Function must persist the enquiry in Supabase first");
assert.ok(edge.includes("Deno.env.get(\"NOTION_STORE_API_KEY\")"), "Notion credential must remain server-side");
assert.ok(edge.includes("notion_sync_status") && edge.includes('"pending"'), "Notion failures must leave a recoverable pending state");
const publicResponse = edge.slice(edge.lastIndexOf("return json("));
assert.ok(publicResponse.includes("orderRef") && publicResponse.includes("notionSync") && !/customer_(?:name|phone|email|message)/.test(publicResponse), "Public response must never return customer contact details");
assert.ok(edge.includes('"Cache-Control": "no-store"'), "Customer enquiry responses must not be cached");

assert.ok(edge.includes("isRateLimited(req, secretKey)") && edge.includes("MAX_BODY_BYTES"), "Public endpoint must apply persistent request throttling and body-size limits");
assert.ok(edge.includes('Deno.env.get("TURNSTILE_ENABLED") === "true"'), "Turnstile must be controlled by an explicit server-side feature flag");
assert.ok(edge.includes('Deno.env.get("TURNSTILE_SECRET_KEY")') && edge.includes('https://challenges.cloudflare.com/turnstile/v0/siteverify'), "Turnstile must be verified server-side with the private secret");
assert.ok(edge.includes('result?.hostname === "balabs-biotech.github.io"') && edge.includes('result?.action === "store_order"'), "Turnstile verification must bind the token to the exact storefront hostname and action");
assert.ok(edge.includes('challenge !== "valid"') && edge.indexOf('challenge !== "valid"') < edge.indexOf('rpc/create_store_order'), "Invalid or missing Turnstile tokens must be rejected before any customer record is written");
assert.ok(edge.includes('challenge === "unavailable"') && edge.includes('return json(503'), "Turnstile outages must fail closed");

assert.ok(edge.includes('new Set(["https://balabs-biotech.github.io"])') && !edge.includes("Access-Control-Allow-Origin: *"), "Order endpoint must use an exact storefront origin allowlist");
assert.ok(edge.indexOf("if (clean(body.website, 200))") < edge.indexOf("const secretKey = getSecretKey()") && edge.includes("return json(200, { success: true }, origin)"), "Honeypot submissions must be silently discarded before database access");
assert.ok(edge.indexOf("isRateLimited(req, secretKey)") < edge.indexOf('rpc/create_store_order'), "Rate limiting must run before any customer record is written");
assert.ok(edge.includes("rate_limit_service_unavailable") && edge.includes("return json(503, { success: false, error: \"store_temporarily_unavailable\" }, origin)"), "Rate-limit failures must fail closed rather than bypass abuse controls");
assert.ok(edge.includes('Deno.env.get("NOTION_STORE_API_KEY") ?? ""') && !edge.includes('Deno.env.get("NOTION_API_KEY")'), "Storefront Notion sync must use its dedicated credential and never fall back to the shared CultureOps key");
assert.ok(!/console\.(?:log|error)\([^\n]*(?:customer_name|customer_email|customer_phone|customer_message)/.test(edge), "Customer contact fields must never be written to application logs");
assert.ok(edge.includes('crypto.subtle.sign("HMAC"') && edge.includes("rpc/consume_store_rate_limit"), "Rate limiting must use a non-reversible IP fingerprint stored in Supabase");
assert.ok(edge.includes("request_id") && edge.includes("duplicate"), "Endpoint must support idempotent retries");
assert.ok(edge.includes('Deno.env.get("TURNSTILE_ENABLED") !== "true"'), "Order intake must fail closed unless server-side anti-bot verification is enabled");
assert.ok(edge.includes("Object.hasOwn(PRODUCTS, code)"), "Product allowlist must reject inherited object-property names rather than accepting prototype keys");

assert.ok(readme.includes("Supabase is the transactional source of truth"), "Architecture documentation must match the implementation");
assert.ok(readme.includes("Turnstile browser integration scaffold") && readme.includes("server-side verifier is deployed"), "Launch gate must distinguish the deployed server verifier from the browser integration configuration that remains pending");

assert.ok(syncWorker.includes('if (!orderId || !lockToken)') && syncWorker.includes('if (!items.length) throw new Error("claimed_order_has_no_items")'), "Claimed orders without items must enter the failure/retry path instead of remaining locked in processing");
assert.ok(syncWorker.indexOf('if (!items.length) throw new Error("claimed_order_has_no_items")') < syncWorker.indexOf('const pageId = await syncToNotion(order, items, notionToken)'), "Invalid claimed orders must be rejected before any Notion request");
assert.ok(syncWorker.includes('rpc/fail_store_order_sync'), "Every processing failure must release/update retry state through the guarded failure RPC");

console.log("Store order contract checks passed: Supabase-first persistence, Notion mirror, isolated RLS tables, idempotency, 15-reference request allowlist, unavailable-reference exclusion and disabled public intake.");
