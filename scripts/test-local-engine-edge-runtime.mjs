const baseUrl = process.env.SUPABASE_FUNCTIONS_URL ?? "http://127.0.0.1:54321/functions/v1";

async function assertFunction(name, headers, expectedStatus = 401) {
  const response = await fetch(`${baseUrl}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (response.status !== expectedStatus || body?.error !== "authentication_required") {
    throw new Error(`${name}: expected ${expectedStatus}/authentication_required, received ${response.status}/${JSON.stringify(body)}`);
  }
  process.stdout.write(`ok ${name}: handler executed and rejected unauthenticated request\n`);
}

await assertFunction("engine-orchestrator", {});
await assertFunction("engine-queue-dispatch", {});
