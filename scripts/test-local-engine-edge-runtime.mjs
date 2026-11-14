const baseUrl = process.env.SUPABASE_FUNCTIONS_URL ?? "http://127.0.0.1:54321/functions/v1";
const dispatchSecret = process.env.BA_ENGINE_DISPATCH_TOKEN ?? "";
const anonKey = process.env.ANON_KEY ?? "";
if (!anonKey) throw new Error("ANON_KEY must be exported by supabase status -o env");

async function assertFunction(name, { headers, expectedStatus, expectedError }) {
  const response = await fetch(`${baseUrl}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "apikey": anonKey, "authorization": `Bearer ${anonKey}`, ...headers },
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
  expectedError: "invalid_request",
});
await assertFunction("engine-queue-dispatch", {
  headers: { "x-ba-dispatch-secret": dispatchSecret },
  expectedStatus: 503,
  expectedError: "dispatcher_not_configured",
});
