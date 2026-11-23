import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const admin = await read("../functions/passport-admin/index.ts");
const publicFn = await read("../functions/public-passport/index.ts");
const frontend = await read("../../product-passport/admin/src/App.tsx");
const config = await read("../config.toml");

test("admin Edge Function verifies the Supabase user and resolves roles server-side", () => {
  assert.match(admin, /\/auth\/v1\/user/);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(admin, /user_roles/);
  assert.match(admin, /revoked_at/);
  assert.match(admin, /hasRole\(/);
  assert.match(config, /\[functions\.passport-admin\]\s*\nverify_jwt\s*=\s*true/);
});

test("public Edge Function accepts only opaque tokens and published passports", () => {
  assert.match(publicFn, /token\.length < 32/);
  assert.match(publicFn, /sha256Hex\(token\)/);
  assert.match(publicFn, /status: "eq\.published"/);
  assert.match(publicFn, /passport_versions/);
  assert.match(publicFn, /select: "snapshot"/);
  assert.match(publicFn, /return json\(\{ passport: snapshot \}\)/);
  assert.doesNotMatch(publicFn, /select: "[^"]*(internal_notes|storage_path|uploaded_by|actor_id)/);
  assert.match(config, /\[functions\.public-passport\]\s*\nverify_jwt\s*=\s*false/);
});

test("service-role credentials are not shipped to either browser surface", () => {
  assert.doesNotMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  assert.doesNotMatch(await read("../../product-passport/passport.js"), /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("admin function requires bearer authentication and role authorization for writes", () => {
  assert.match(admin, /authorization\.startsWith\("Bearer "\)/);
  assert.match(admin, /authResponse\.ok/);
  assert.match(admin, /if \(action === "publish"\)[\s\S]*?hasRole\("approver", "administrator", "principal_admin"\)/);
  assert.match(admin, /if \(action === "create_draft"\)[\s\S]*?activeRoles\.some/);
});
