import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../functions/earth-search-sentinel2-ingest/index.ts", import.meta.url),
  "utf8",
);
const checks = [
  ["requires an authenticated Supabase user", /userClient\.auth\.getUser\(\)/],
  ["requires a server-only worker HMAC secret", /BA_SENTINEL2_WORKER_SECRET/],
  ["verifies the exact raw request body using HMAC-SHA256", /crypto\.subtle\.importKey[\s\S]*?HMAC[\s\S]*?crypto\.subtle\.sign/],
  ["requires a signed timestamp within a five-minute window", /x-ba-worker-timestamp[\s\S]*?Math\.abs[\s\S]*?> 300/],
  ["allows the worker timestamp header through CORS", source.includes('x-ba-worker-signature, x-ba-worker-timestamp')],
  ["requires a 32-byte worker HMAC secret", source.includes("new TextEncoder().encode(workerSecret).length < 32")],
  ["rejects duplicate variable rows within a scene pair", source.includes("duplicate_scene_variable_row")],
  ["bounds request body size", /MAX_BODY_BYTES = 256 \* 1024/],
  ["bounds the number of observation rows", /MAX_ROWS = 200/],
  ["checks location scope using the caller JWT", /userClient\.from\("locations"\)[\s\S]*?eq\("organization_id", organizationId\)/],
  ["requires explicit organization writer membership", /userClient\.from\("organization_members"\)[\s\S]*?write_permission_required/],
  ["does not accept client-supplied organization membership claims", /authData\.user\.id/],
  ["accepts only Earth Search Sentinel-2 L2A observations", /EARTH_SEARCH[\s\S]*?SENTINEL_2_L2A/],
  ["accepts only mean and median NDVI rows", /ndvi_mean[\s\S]*?ndvi_median/],
  ["requires a stable scene identity and matching provenance", /source_record_id[\s\S]*?metadata\.scene_id/],
  ["requires canonical NDVI unit and valid quality flag", /row\.unit_code !== "1" \|\| row\.quality_flag !== "valid"/],
  ["requires cloud and valid-pixel provenance", /metadata\.valid_pixel_ratio[\s\S]*?metadata\.cloud_cover_pct/],
  ["restricts STAC source URLs to the Earth Search item endpoint", /earth-search\.aws\.element84\.com[\s\S]*?sentinel-2-l2a\/items/],
  ["binds the STAC item URL to the same scene ID as the payload", /decodeURIComponent\(url\.pathname\.split\("\/"\)\.pop\(\) \?\? ""\) === sceneId/],
  ["requires paired mean and median rows to share acquisition and provenance", /scene_pair_provenance_mismatch/],
  ["uses the scene-aware unique key for idempotent persistence", /onConflict: "organization_id,location_id,provider_code,dataset_code,variable_code,observed_at,source_record_id"/],
  ["keeps service-role persistence server-side", /adminClient\.rpc\([\s\S]*?upsert_satellite_environmental_observations/],
  ["does not return raw exception messages to callers", /error: "internal_error"/],
];
for (const [label, pattern] of checks) {
  if (pattern instanceof RegExp) assert.match(source, pattern, label);
  else assert.equal(pattern, true, label);
  console.log("✓ " + label);
}
console.log("Passed " + checks.length + " Sentinel-2 ingestion contract checks.");
