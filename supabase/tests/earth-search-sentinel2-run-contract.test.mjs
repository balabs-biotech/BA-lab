import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../functions/earth-search-sentinel2-run/index.ts", import.meta.url),
  "utf8",
);
const checks = [
  ["authenticates the caller JWT before processing", /userClient\.auth\.getUser\(\)/],
  ["requires explicit writer membership", /organization_members[\s\S]*?\["owner", "admin", "member"\]/],
  ["resolves organization and coordinates from the authorized location", /from\("locations"\)[\s\S]*?organization_id,latitude,longitude/],
  ["bounds the requested historical window", /MAX_DAYS = 90/],
  ["bounds each ingestion batch to ten scenes", /MAX_SCENES = 10/],
  ["restricts STAC search and pagination to Earth Search HTTPS", /earth-search\.aws\.element84\.com/],
  ["uses the location-derived approximate AOI transparently", /approximate_location_buffer_not_cadastral_boundary/],
  ["validates cloud-cover filtering", /max_cloud_cover_pct_must_be_between_0_and_100/],
  ["uses only a configured private worker endpoint", /BA_ENVIRONMENTAL_ENGINE_URL[\s\S]*?BA_ENVIRONMENTAL_ENGINE_API_KEY/],
  ["forwards the caller JWT and private engine key to the worker", /"X-BA-Engine-Key": engineApiKey,[\s\S]*?Authorization: authorization/],
  ["forwards the Supabase publishable key required by the Functions gateway", /apikey: publishableKey/],
  ["does not use a service-role key in the gateway", !/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/.test(source)],
  ["does not expose upstream worker response bodies on errors", /sentinel2_processing_worker_failed/],
];
for (const [label, pattern] of checks) {
  if (pattern instanceof RegExp) assert.match(source, pattern, label);
  else assert.equal(pattern, true, label);
  console.log("✓ " + label);
}
console.log("Passed " + checks.length + " Sentinel-2 gateway contract checks.");
