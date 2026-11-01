import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../supabase/deployed-functions-snapshot/", import.meta.url);
const manifestPath = new URL("manifest.json", root);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

assert.equal(manifest.project_ref, "axcouwiodqsauwnsiotn");
assert.equal(manifest.capture_date, "2026-11-01");
assert.equal(manifest.source_kind, "read-only snapshot of currently deployed Supabase Edge Functions");

const expected = [
  "claim-ba-labs",
  "sync-culture-to-notion",
  "iot-ingest",
  "nasa-power-agroclimate",
  "nasa-power-scheduled-import",
  "copernicus-sentinel-catalogue",
  "sentinel-2-ndvi-preview",
  "earth-search-sentinel2-catalogue",
  "earth-search-sentinel2-ndvi-preview",
].sort();

assert.deepEqual(
  manifest.functions.map(fn => fn.name).sort(),
  expected,
  "snapshot manifest must cover every active Edge Function"
);

for (const fn of manifest.functions) {
  assert.ok(Number.isInteger(fn.version) && fn.version > 0, fn.name + " needs a deployed version");
  assert.equal(typeof fn.verify_jwt, "boolean", fn.name + " needs its deployed JWT-verification setting");
  assert.deepEqual(fn.files, ["index.ts"], fn.name + " snapshot file inventory changed; review before accepting");
  const path = new URL(fn.name + "/index.ts", root);
  const source = await readFile(path, "utf8");
  const gitObject = createHash("sha1")
    .update(`blob ${Buffer.byteLength(source, "utf8")}\0`, "utf8")
    .update(source, "utf8")
    .digest("hex");
  assert.equal(gitObject, fn.git_blob_sha, fn.name + " snapshot Git blob checksum mismatch");
}

const byName = Object.fromEntries(manifest.functions.map(fn => [fn.name, fn]));
assert.equal(byName["iot-ingest"].verify_jwt, false);
assert.equal(byName["nasa-power-scheduled-import"].verify_jwt, false);
for (const fn of manifest.functions.filter(fn => !["iot-ingest", "nasa-power-scheduled-import"].includes(fn.name))) {
  assert.equal(fn.verify_jwt, true, fn.name + " must retain JWT verification");
}

const iot = await readFile(new URL("iot-ingest/index.ts", root), "utf8");
assert.match(iot, /device_token_required/);
assert.match(iot, /sha256Hex\(match\[1\]\)/);
assert.match(iot, /ingest_iot_payload/);
assert.match(iot, /32_000/);

const cron = await readFile(new URL("nasa-power-scheduled-import/index.ts", root), "utf8");
assert.match(cron, /x-ba-cron-secret/);
assert.match(cron, /verify_nasa_power_cron_secret/);
assert.match(cron, /candidate\.length < 32/);

const claim = await readFile(new URL("claim-ba-labs/index.ts", root), "utf8");
assert.match(claim, /auth\.getUser\(\)/);
assert.match(claim, /ba\.labs\.redev@gmail\.com/);
assert.match(claim, /role: "owner"/);

// Maintained source must retain the security hardening missing from the captured
// production versions. These assertions prevent accidental regression in main.
const maintainedRoot = new URL("../supabase/functions/", import.meta.url);
const notionSync = await readFile(new URL("sync-culture-to-notion/index.ts", maintainedRoot), "utf8");
assert.match(notionSync, /userClient\.auth\.getUser\(\)/);
assert.match(notionSync, /organization_members/);
assert.match(notionSync, /Write permission required/);

const agroclimate = await readFile(new URL("nasa-power-agroclimate/index.ts", maintainedRoot), "utf8");
assert.match(agroclimate, /userClient\.auth\.getUser\(\)/);
assert.match(agroclimate, /organization_members/);
assert.match(agroclimate, /write_permission_required/);

const ndvi = await readFile(new URL("earth-search-sentinel2-ndvi-preview/index.ts", maintainedRoot), "utf8");
assert.match(ndvi, /MAX_REQUEST_BYTES\s*=\s*32\s*\*\s*1024/);
assert.match(ndvi, /MAX_STAC_RESPONSE_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
assert.match(ndvi, /readBoundedJson/);

console.log("✓ All 9 deployed Supabase Edge Functions are snapshotted with exact source hashes and auth settings");
console.log("✓ Both JWT-disabled endpoints retain their independent device-token or cron-secret authentication");
console.log("✓ BA-LABS organization bootstrap remains restricted to the verified admin account");
