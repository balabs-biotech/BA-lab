import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../functions/copernicus-sentinel-catalogue/index.ts", import.meta.url),
  "utf8",
);

const checks = [
  ["rejects requests without an Authorization header", /if \(!authorization\) return reply\(401, \{ error: "authentication_required" \}\)/],
  ["validates the user token with Supabase Auth", /db\.auth\.getUser\(\)/],
  ["validates ISO calendar dates", /const validDate =/],
  ["limits searches to 180 past days", /days > 180 \|\| Date\.parse\(end \+ "T00:00:00Z"\) > Date\.now\(\)/],
  ["bounds result count to 1–20", /limit < 1 \|\| limit > 20/],
  ["bounds cloud cover to 0–100%", /cloud < 0 \|\| cloud > 100/],
  ["checks location access through the user's RLS scope", /db\.from\("locations"\)[\s\S]*?\.eq\("id", locationId\)\.maybeSingle\(\)/],
  ["queries Sentinel-2 L2A", /collections", "sentinel-2-l2a"/],
  ["returns the newest matching scenes first", /sortby", "-properties\.datetime"/],
  ["requests STAC asset metadata needed for image previews", /searchParams\.set\("fields", "id,collection,bbox,properties\.datetime,properties\.eo:cloud_cover,properties\.platform,properties\.constellation,links,assets,-geometry"\)/],
  ["detects preview assets by key or STAC role", /asset\.roles[\s\S]*?thumbnail[\s\S]*?overview/],
  ["allows HTTPS preview URLs only from Copernicus or the documented CloudFerro host", /parsedPreview\.protocol === "https:"[\s\S]*?hostname === "s3\.waw3-2\.cloudferro\.com"/],
  ["does not write satellite data to the database", /Does not download imagery or write database rows/],
  ["uses a bounded upstream timeout", /AbortSignal\.timeout\(20000\)/],
  ["does not leak upstream response bodies", /copernicus_catalogue_unavailable/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log(`✓ ${label}`);
}

console.log(`Passed ${checks.length} Sentinel-2 contract checks.`);
