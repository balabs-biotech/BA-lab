import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const fn = readFileSync("supabase/functions/store-notion-order/index.ts", "utf8");
assert.ok(fn.includes("endpoint_retired"), "Legacy endpoint must remain explicitly retired");
assert.ok(fn.includes("status: 410"), "Retired legacy endpoint must return HTTP 410 Gone");
assert.ok(fn.includes("create-store-order"), "Legacy endpoint must direct callers to the current Supabase order endpoint");
assert.ok(!fn.includes("NOTION_API_KEY") && !fn.includes("service_role"), "Retired endpoint must not contain credentials or privileged client secrets");
console.log("Retired Notion order endpoint contract checks passed.");
