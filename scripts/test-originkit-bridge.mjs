import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../supabase/functions/originkit-mcp/index.ts", import.meta.url), "utf8");
const doc = readFileSync(new URL("../docs/ORIGINKIT-INTEGRATION.md", import.meta.url), "utf8");

assert.match(source, /https:\/\/mcp\.originkit\.dev\/vellumai/);
assert.match(source, /Deno\.env\.get\("ORIGINKIT_API_KEY"\)/);
assert.match(source, /tools\/call/);
assert.match(source, /get_component/);
assert.match(source, /verify_jwt/ === null ? / : /Deno\.serve/); // Keep this test tied to the Edge Function entrypoint.
assert.doesNotMatch(source, /cmp_live_[A-Za-z0-9_-]+/);
assert.match(source, /origin_not_allowed/);
assert.match(source, /component_not_found/);
assert.match(doc, /Rotate any API key previously pasted/);
assert.match(doc, /Never add the key to GitHub/);
console.log("OriginKit bridge static checks passed.");
