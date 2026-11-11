// Node >= 22.6 — tests the Edge Function source with mocked Supabase clients.
// Usage: node --experimental-strip-types supabase/tests/legal-document-registry.test.mts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../functions/legal-document-registry/index.ts"), "utf8");
const importLine = 'import { createClient } from "npm:@supabase/supabase-js@2";';
assert.ok(source.includes(importLine), "Supabase import line changed; update the test loader");

let handler: (req: Request) => Promise<Response>;
let env: Record<string, string | undefined>;
let userValid = true;
let isAdmin = true;
let rpcError: string | null = null;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

(globalThis as any).__createClient = (_url: string, key: string) => ({
  auth: { getUser: async () => key === "publishable"
    ? (userValid ? { data: { user: { id: "user-verified" } }, error: null } : { data: { user: null }, error: { message: "invalid" } })
    : { data: { user: null }, error: null } },
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    rpcCalls.push({ name, args });
    if (rpcError) return { data: null, error: { message: rpcError } };
    if (name === "is_platform_administrator") return { data: isAdmin, error: null };
    if (name === "list_legal_document_versions") return { data: [{ id: "doc-1", version: "v1" }], error: null };
    if (name === "publish_legal_document_version") return { data: "new-doc-id", error: null };
    if (name === "retire_legal_document_version") return { data: true, error: null };
    return { data: null, error: { message: "unexpected rpc" } };
  },
});
(globalThis as any).Deno = {
  env: { get: (key: string) => env[key] },
  serve: (fn: any) => { handler = fn; },
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "legal-registry-"));
const tmpFile = path.join(tmpDir, "index.mts");
fs.writeFileSync(tmpFile, source.replace(importLine, "const createClient = (globalThis as any).__createClient;"));
await import(pathToFileURL(tmpFile).href);

function reset(overrides: { valid?: boolean; admin?: boolean; rpcError?: string | null } = {}) {
  env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable", SUPABASE_SECRET_KEY: "secret" };
  userValid = overrides.valid ?? true;
  isAdmin = overrides.admin ?? true;
  rpcError = overrides.rpcError ?? null;
  rpcCalls.length = 0;
}
async function call(body: Record<string, unknown> | null, authorization = "Bearer test-jwt", method = "POST") {
  const response = await handler(new Request("https://edge.test", {
    method,
    headers: authorization ? { authorization, "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

reset();
{
  const r = await call({ action: "list" }, "");
  assert.equal(r.status, 401);
  assert.equal(rpcCalls.length, 0);
}
reset({ valid: false });
{
  const r = await call({ action: "list" });
  assert.equal(r.status, 401);
  assert.equal(rpcCalls.length, 0);
}
reset({ admin: false });
{
  const r = await call({ action: "list" });
  assert.equal(r.status, 403);
  assert.deepEqual(rpcCalls.map((x) => x.name), ["is_platform_administrator"]);
}
reset();
{
  const r = await call({ action: "list" });
  assert.equal(r.status, 200);
  assert.equal(r.body.documents[0].version, "v1");
}
reset();
{
  const r = await call({
    action: "publish", document_type: "terms", version: "2026-11-v1",
    content_sha256: "a".repeat(64), document_path: "legal/terms.html",
    effective_at: "2099-01-01T00:00:00.000Z",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.document_version_id, "new-doc-id");
  const publish = rpcCalls.find((x) => x.name === "publish_legal_document_version");
  assert.equal(publish?.args.p_created_by, "user-verified");
}
reset();
{
  const r = await call({
    action: "publish", document_type: "terms", version: "v1",
    content_sha256: "not-a-hash", document_path: "legal/terms.html",
    effective_at: "2099-01-01T00:00:00.000Z",
  });
  assert.equal(r.status, 400);
  assert.equal(rpcCalls.length, 1, "only the platform-admin check should run");
}
reset();
{
  const r = await call({
    action: "publish", document_type: "terms", version: "v1",
    content_sha256: "a".repeat(64), document_path: "legal/other.html",
    effective_at: "2099-01-01T00:00:00.000Z",
  });
  assert.equal(r.status, 400, "document path must be allowlisted");
}
reset();
{
  const r = await call({
    action: "retire", document_version_id: "00000000-0000-0000-0000-000000000001",
    retired_at: "2099-01-01T00:00:00.000Z",
  });
  assert.equal(r.status, 200);
  assert.equal(rpcCalls.at(-1)?.name, "retire_legal_document_version");
}
reset({ rpcError: "database unavailable" });
{
  const r = await call({ action: "list" });
  assert.equal(r.status, 503);
}
{
  const r = await call({ action: "list" }, "Bearer test-jwt", "GET");
  assert.equal(r.status, 405);
}
console.log("PASS legal-document-registry: 10 scenarios");
