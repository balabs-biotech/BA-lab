import { createHmac } from "node:crypto";

const baseUrl = process.env.SUPABASE_FUNCTIONS_URL ?? "http://127.0.0.1:54321/functions/v1";
const dispatchSecret = process.env.BA_ENGINE_DISPATCH_TOKEN ?? "";
const anonKey = process.env.ANON_KEY ?? "";
const jwtSecret = process.env.JWT_SECRET ?? "";
if (!anonKey) throw new Error("ANON_KEY must be exported by supabase status -o env");
if (!jwtSecret) throw new Error("JWT_SECRET must be exported by supabase status -o env");

const encodeBase64Url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const issuedAt = Math.floor(Date.now() / 1000);
const unsignedToken = [
  encodeBase64Url({ alg: "HS256", typ: "JWT" }),
  encodeBase64Url({
    iss: "supabase-demo",
    role: "authenticated",
    aud: "authenticated",
    sub: "00000000-0000-4000-8000-000000000001",
    iat: issuedAt,
    exp: issuedAt + 300,
  }),
].join(".");
const signature = createHmac("sha256", jwtSecret).update(unsignedToken).digest("base64url");
const routeSmokeJwt = `${unsignedToken}.${signature}`;

async function post(name, headers = {}, body = {}) {
  return await fetch(`${baseUrl}/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", "apikey": anonKey, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function assertGatewayUnauthorized(name) {
  const response = await post(name);
  if (response.status !== 401) {
    const body = await response.json().catch(() => null);
    throw new Error(`${name}: expected gateway 401 without bearer JWT, received ${response.status}/${JSON.stringify(body)}`);
  }
  process.stdout.write(`ok ${name}: gateway rejects requests without a bearer JWT\\n`);
}

async function assertUnauthorized(name, extraHeaders = {}) {
  const response = await post(name, {
    authorization: `Bearer ${routeSmokeJwt}`,
    ...extraHeaders,
  });
  const body = await response.json().catch(() => null);
  if (response.status !== 401 || body?.error !== "authentication_required") {
    throw new Error(`${name}: expected 401/authentication_required, received ${response.status}/${JSON.stringify(body)}`);
  }
  process.stdout.write(`ok ${name}: handler rejected missing dispatcher credentials\\n`);
}

async function assertFunction(name, { headers, expectedStatus, expectedError, body = {} }) {
  const response = await post(name, {
    authorization: `Bearer ${routeSmokeJwt}`,
    ...headers,
  }, body);
  const body = await response.json().catch(() => null);
  if (response.status !== expectedStatus || body?.error !== expectedError) {
    throw new Error(`${name}: expected ${expectedStatus}/${expectedError}, received ${response.status}/${JSON.stringify(body)}`);
  }
  process.stdout.write(`ok ${name}: reached handler and received ${expectedStatus}/${expectedError}\\n`);
}

await assertGatewayUnauthorized("engine-orchestrator");
await assertUnauthorized("engine-queue-dispatch", { "x-ba-dispatch-secret": "" });

await assertFunction("engine-orchestrator", {
  headers: {},
  expectedStatus: 401,
  expectedError: "invalid_session",
  body: {
    organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    engine_id: "environmental.timeseries.qc",
    engine_version: "0.2.0",
    record_ids: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
    record_type: "measurement",
    parameters: {},
    scope: { organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    idempotency_key: "edge-auth-smoke-001",
  },
});
await assertFunction("engine-queue-dispatch", {
  headers: { "x-ba-dispatch-secret": dispatchSecret },
  expectedStatus: 503,
  expectedError: "dispatcher_not_configured",
});
