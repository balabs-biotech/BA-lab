import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../supabase/functions/originkit-mcp/index.ts", import.meta.url), "utf8");
const doc = readFileSync(new URL("../docs/ORIGINKIT-INTEGRATION.md", import.meta.url), "utf8");

assert.match(source, /https:\/\/mcp\.originkit\.dev\/vellumai/);
assert.match(source, /Deno\.env\.get\("ORIGINKIT_API_KEY"\)/);
assert.match(source, /tools\/call/);
assert.match(source, /get_component/);
assert.match(source, /Deno\.serve/);
assert.match(source, /hasAuthenticatedUser/);
assert.match(source, /claims\\.role === "authenticated"/);
assert.match(source, /claims\\.is_anonymous !== true/);
assert.match(source, /authenticated_session_required/);
assert.match(source, /origin_not_allowed/);
assert.match(source, /component_not_found/);
assert.match(source, /unsupported_action/);
assert.doesNotMatch(source, /cmp_live_[A-Za-z0-9_-]+/);
assert.match(doc, /Rotate any API key previously pasted/);
assert.match(doc, /Never add the key to GitHub/);
console.log("OriginKit bridge static checks passed.");
