import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../legal/admin.html", import.meta.url), "utf8");
assert.match(html, /name="robots" content="noindex,nofollow"/, "admin console must not be indexed");
assert.match(html, /@supabase\/supabase-js@2\.118\.0/, "Supabase JS CDN must be exactly pinned");
assert.match(html, /sb_publishable_/, "browser must use only the publishable key");
assert.doesNotMatch(html, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|service_role/i, "no privileged key or role may be shipped to the browser");
assert.match(html, /signInWithPassword/, "admin console must authenticate existing accounts");
assert.doesNotMatch(html, /signUp\s*\(/, "admin console must not offer self-registration");
assert.match(html, /functions\.invoke\("legal-document-registry"/, "all registry operations must go through the protected Edge Function");
assert.match(html, /crypto\.subtle\.digest\("SHA-256"/, "document hash must be computed with Web Crypto");
assert.match(html, /PATHS\s*=\s*\{\s*terms:/, "document paths must be allowlisted");
assert.match(html, /textContent\s*=/, "registry data must be rendered as text, not injected HTML");
assert.match(html, /at least|au moins une minute dans le futur/, "publication must be scheduled in the future");
console.log("PASS legal admin console security contract");
