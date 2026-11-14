const baseUrl = process.env.SUPABASE_FUNCTIONS_URL ?? "http://127.0.0.1:54321/functions/v1";
const dispatchSecret = process.env.BA_ENGINE_DISPATCH_TOKEN ?? "";
const anonKey = process.env.ANON_KEY ?? "";
// Functions are served with --no-verify-jwt in this isolated route smoke. Use a
// syntactically valid placeholder so Kong does not mistake a publishable key
// for a bearer JWT; the orchestrator rejects the empty request before getUser().
const routeSmokeJwt = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJjaS1yb3V0ZS1zbW9rZSIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQifQ.c2lnbmF0dXJl";
if (!anonKey) throw new Error("ANON_KEY must be exported by supabase status -o env");

async function assertFunction(name, { headers, expectedStatus, expectedError }) {
  const response = await fetch(`${baseUrl}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "apikey": anonKey, "authorization": `Bearer ${routeSmokeJwt}`, ...headers },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (response.status !== expectedStatus || body?.error !== expectedError) {
    throw new Error(`${name}: expected ${expectedStatus}/${expectedError}, received ${response.status}/${JSON.stringify(body)}`);
  }
  process.stdout.write(`ok ${name}: reached handler and received ${expectedStatus}/${expectedError}\n`);
}

await assertFunction("engine-orchestrator", {
  headers: {},
  expectedStatus: 422,
  expectedError: "invalid_or_incomplete_request",
});
await assertFunction("engine-queue-dispatch", {
  headers: { "x-ba-dispatch-secret": dispatchSecret },
  expectedStatus: 503,
  expectedError: "dispatcher_not_configured",
});
