import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("store/index.html", "utf8");
const css = readFileSync("store/store.css", "utf8");
const js = readFileSync("store/store.js", "utf8");
const migration = readFileSync("supabase/migrations/20261119223731_store_orders_v1.sql", "utf8");
const rateMigration = readFileSync("supabase/migrations/20261119224223_store_checkout_rate_limits_v1.sql", "utf8");
const edge = readFileSync("supabase/functions/create-store-order/index.ts", "utf8");
const readme = readFileSync("store/README.md", "utf8");

assert.ok(html.includes('class="request-layout"') && html.includes('id="requestSummary"'), "Enquiry layout must show selected items beside the customer form");
assert.ok(css.includes(".request-layout") && css.includes("@media(max-width:760px)"), "Enquiry layout must be responsive");
assert.ok(js.includes("create-store-order") && !js.includes("functions/v1/store-notion-order"), "Browser must use the Supabase-first endpoint");
assert.ok(js.includes("request_id:activeRequestId"), "Browser must send a stable idempotency reference");
assert.ok(js.includes("const STORE_ORDER_ENABLED=false"), "Guest submission must remain disabled until end-to-end verification");
assert.ok(!js.includes("NOTION_STORE_API_KEY") && !js.includes("SUPABASE_SERVICE_ROLE_KEY") && !js.includes("sb_secret_"), "No server credential may appear in browser code");

assert.ok(migration.includes("create table if not exists public.store_orders"), "Dedicated storefront order table must exist");
assert.ok(migration.includes("create table if not exists public.store_order_items"), "Dedicated storefront item table must exist");
assert.ok(migration.includes("alter table public.store_orders enable row level security"), "Store order table must enable RLS");
assert.ok(migration.includes("revoke all on table public.store_orders from public, anon, authenticated"), "Public roles must not access store orders directly");
assert.ok(migration.includes("grant execute on function public.create_store_order(uuid,jsonb,jsonb,text) to service_role"), "Only the backend service role may call the insert RPC");
assert.ok(rateMigration.includes("create table if not exists public.store_checkout_rate_limits"), "Persistent rate-limit table must exist");
assert.ok(rateMigration.includes("create or replace function public.consume_store_rate_limit"), "Persistent rate-limit RPC must exist");
assert.ok(rateMigration.includes("grant execute on function public.consume_store_rate_limit(text,integer,integer) to service_role"), "Only the backend service role may call the rate-limit RPC");

assert.equal((edge.match(/"BAL-/g) || []).length, 15, "Edge Function must validate the 15 currently requestable references");
const productBlock = js.slice(js.indexOf("let products=["), js.indexOf("\\n];", js.indexOf("let products=[")));
const storefrontRequestable = productBlock.split("\\n").flatMap(line => {
  const code = line.match(/(?:code:'|\\"code\\":\\")(BAL-[A-Z0-9-]+)/);
  const status = line.match(/(?:status:'|\\"status\\":\\")([a-z_]+)/);
  return code && status && status[1] !== "unavailable" ? [code[1]] : [];
}).sort();
const serverRequestable = [...edge.matchAll(/"(BAL-[A-Z0-9-]+)"\\s*:/g)].map(match => match[1]).sort();
assert.deepEqual(serverRequestable, storefrontRequestable, "Browser-selectable products and the server-side order allowlist must match exactly");
assert.ok(edge.includes("rpc/create_store_order"), "Edge Function must persist the enquiry in Supabase first");
assert.ok(edge.includes("Deno.env.get(\"NOTION_STORE_API_KEY\")"), "Notion credential must remain server-side");
assert.ok(edge.includes("notion_sync_status") && edge.includes('"pending"'), "Notion failures must leave a recoverable pending state");
const publicResponse = edge.slice(edge.lastIndexOf("return json("));
assert.ok(publicResponse.includes("orderRef") && publicResponse.includes("notionSync") && !/customer_(?:name|phone|email|message)/.test(publicResponse), "Public response must never return customer contact details");
assert.ok(edge.includes('"Cache-Control": "no-store"'), "Customer enquiry responses must not be cached");

assert.ok(edge.includes("isRateLimited(req, secretKey)") && edge.includes("MAX_BODY_BYTES"), "Public endpoint must apply persistent request throttling and body-size limits");
assert.ok(edge.includes('crypto.subtle.sign("HMAC"') && edge.includes("rpc/consume_store_rate_limit"), "Rate limiting must use a non-reversible IP fingerprint stored in Supabase");
assert.ok(edge.includes("request_id") && edge.includes("duplicate"), "Endpoint must support idempotent retries");

assert.ok(readme.includes("Supabase is the transactional source of truth"), "Architecture documentation must match the implementation");
console.log("Store order contract checks passed: Supabase-first persistence, Notion mirror, isolated RLS tables, idempotency, 15-reference request allowlist, unavailable-reference exclusion and disabled public intake.");
