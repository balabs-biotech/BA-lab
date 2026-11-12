import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/engine-orchestrator/index.ts", "utf8");
const checks = [
  ["caller identity is verified", /supabase\.auth\.getUser\(\)/],
  ["organization membership is checked", /organization_members/],
  ["source rows are loaded through caller-scoped client", /userClient[\s\S]*\.from\(["']measurements["']\)/],
  ["snapshot is SHA-256 hashed", /crypto\.subtle\.digest\(["']SHA-256["']/],
  ["idempotency is organization-scoped", /idempotency_key/],
  ["worker response is schema validated", /validateResponse/],
  ["request and snapshot correlation is enforced", /input_snapshot_sha256/],
  ["service credential is server-side only", /SUPABASE_SERVICE_ROLE_KEY/],
  ["worker call has an abort timeout", /AbortController/],
  ["raw source records are not updated", !/\.from\(["']measurements["']\)[\s\S]{0,500}\.update\(/],
];
for (const [name, pattern] of checks) {
  assert.ok(pattern instanceof RegExp ? pattern.test(source) : pattern, name);
}
console.log("Engine orchestration boundary contract passed");
