import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const maintained = new URL("../supabase/functions/", import.meta.url);
const snapshots = new URL("../supabase/deployed-functions-snapshot/", import.meta.url);

for (const name of ["claim-ba-labs"]) {
  const [source, snapshot] = await Promise.all([
    readFile(new URL(name + "/index.ts", maintained), "utf8"),
    readFile(new URL(name + "/index.ts", snapshots), "utf8"),
  ]);
  assert.equal(source, snapshot, name + " must preserve the captured deployed baseline byte-for-byte until reviewed");
}

const claim = await readFile(new URL("claim-ba-labs/index.ts", maintained), "utf8");
assert.match(claim, /userClient\.auth\.getUser\(\)/);
assert.match(claim, /toLowerCase\(\) !== "ba\.labs\.redev@gmail\.com"/);
assert.match(claim, /role: "owner"/);
assert.match(claim, /\.eq\("code", "BA-LABS"\)/);
assert.doesNotMatch(claim, /req\.json\(/, "bootstrap must not accept a caller-selected organization or role");

const catalogue = await readFile(new URL("earth-search-sentinel2-catalogue/index.ts", maintained), "utf8");
const catalogueSnapshot = await readFile(new URL("earth-search-sentinel2-catalogue/index.ts", snapshots), "utf8");
assert.match(catalogueSnapshot, /const upstream = await fetch\(search/);
assert.match(catalogue, /const upstream = await fetch\(search/);
assert.match(catalogue, /db\.auth\.getUser\(\)/);
assert.match(catalogue, /\.from\("locations"\)/);
assert.match(catalogue, /limit > 20/);
assert.match(catalogue, /cloud < 0 \|\| cloud > 100/);
assert.match(catalogue, /AbortSignal\.timeout\(20000\)/);
assert.match(catalogue, /earth-search\.aws\.element84\.com/);
assert.doesNotMatch(catalogue, /serviceKey|adminClient/);
assert.match(catalogue, /MAX_REQUEST_BYTES\s*=\s*32\s*\*\s*1024/);
assert.match(catalogue, /MAX_STAC_RESPONSE_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/);
assert.match(catalogue, /readBoundedJson\(req, MAX_REQUEST_BYTES\)/);
assert.match(catalogue, /readBoundedJson\(upstream, MAX_STAC_RESPONSE_BYTES\)/);
assert.match(catalogue, /request_body_too_large/);
assert.match(catalogue, /earth_search_response_too_large_or_invalid/);
assert.match(catalogue, /reply\(tooLarge \? 413 : 400/);

console.log("✓ BA-LABS bootstrap source matches its exact captured deployed baseline");
console.log("✓ Earth Search catalogue retains the captured query contract with additional payload limits");
console.log("✓ BA-LABS bootstrap remains authenticated and restricted to the intended admin account");
console.log("✓ Earth Search catalogue validates session, RLS-scoped location, bounds, and upstream timeout");
