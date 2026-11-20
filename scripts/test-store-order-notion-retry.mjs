import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261120000100_store_order_notion_retry_v1.sql", "utf8");
const worker = readFileSync("supabase/functions/store-order-sync/index.ts", "utf8");
const intake = readFileSync("supabase/functions/create-store-order/index.ts", "utf8");
const readme = readFileSync("store/README.md", "utf8");

for (const column of ["notion_sync_next_attempt_at", "notion_sync_locked_until", "notion_sync_lock_token"]) {
  assert.ok(migration.includes(column), "Retry migration must include " + column);
}
for (const rpc of ["claim_store_order_sync", "complete_store_order_sync", "fail_store_order_sync"]) {
  assert.ok(migration.includes("function public." + rpc), "Retry migration must define " + rpc);
  assert.ok(migration.includes("grant execute on function public." + rpc), rpc + " must be service-role only");
}
assert.ok(migration.includes("for update skip locked"), "Concurrent workers must not claim the same request");
assert.ok(migration.includes("notion_sync_attempts >= 8"), "Retries must have a hard maximum");
assert.ok(migration.includes("interval '1 minute'") && migration.includes("interval '24 hours'"), "Retry delays must use bounded backoff");
assert.ok(worker.includes("payload?.role === \"service_role\""), "Retry worker must require a service-role JWT claim");
assert.ok(worker.includes("rpc/claim_store_order_sync") && worker.includes("rpc/complete_store_order_sync") && worker.includes("rpc/fail_store_order_sync"), "Worker must use atomic claim and completion/failure RPCs");
assert.equal((worker.match(/AbortSignal\.timeout\(20_000\)/g) ?? []).length, 2, "Supabase and Notion requests must time out well before the five-minute processing lock expires");
assert.equal((intake.match(/AbortSignal\.timeout\(20_000\)/g) ?? []).length, 1, "Order intake Supabase requests must have a bounded network timeout");
assert.ok(worker.includes('if (!orderId || !lockToken)') && worker.includes('if (!items.length) throw new Error("claimed_order_has_no_items")'), "A claimed request with no items must be rejected inside the guarded try/catch so it enters retry handling");
assert.ok(worker.indexOf('if (!items.length) throw new Error("claimed_order_has_no_items")') < worker.indexOf("const pageId = await syncToNotion(order, items, notionToken)"), "Malformed claims must be rejected before a Notion API call");
assert.ok(worker.includes('rpc/fail_store_order_sync'), "Malformed claimed requests must use the failure RPC to clear the processing lock and schedule retry");

assert.ok(worker.includes('filter: { property: "Demande", title: { equals: title } }'), "Worker must look up the exact order reference before creating a Notion page");
assert.ok(worker.includes('Deno.env.get("NOTION_STORE_API_KEY")'), "Worker must use the dedicated commercial Notion credential");
assert.ok(!/console\.(?:log|error)\([^\n]*(?:customer_name|customer_email|customer_phone|customer_message)/.test(worker), "Worker must not log customer PII");
assert.ok(!/return Response\.json\([^\n]*(?:customer_name|customer_email|customer_phone)/.test(worker), "Worker response must not expose customer PII");
assert.ok(intake.includes("notion_sync_next_attempt_at") || migration.includes("default (now() + interval '10 minutes')"), "New requests must have a delayed retry fallback if inline sync exits early");
assert.ok(readme.includes("store-order-sync") && readme.includes("eight attempts") && readme.includes("service_role"), "Documentation must explain the secured retry worker and retry cap");

const immediateMigration = readFileSync("supabase/migrations/20261120002000_store_order_sync_immediate_first_attempt.sql", "utf8");
assert.ok(/alter column notion_sync_next_attempt_at set default pg_catalog\.now\(\)/.test(immediateMigration), "New requests must be eligible for the next worker cycle immediately");
assert.ok(immediateMigration.includes("notion_sync_attempts = 0") && immediateMigration.includes("notion_sync_status = 'pending'"), "Only never-attempted pending requests may be accelerated");

console.log("Store Notion retry contract checks passed: service-role-only worker, atomic claims, duplicate lookup, bounded backoff and PII-safe responses.");
