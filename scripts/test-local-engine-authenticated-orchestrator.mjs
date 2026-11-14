import { randomUUID } from "node:crypto";

const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const anonKey = process.env.ANON_KEY ?? "";
const serviceRoleKey = process.env.SERVICE_ROLE_KEY ?? "";
if (!anonKey || !serviceRoleKey) {
  throw new Error("ANON_KEY and SERVICE_ROLE_KEY must be exported by supabase status -o env");
}

async function api(path, { method = "GET", key = serviceRoleKey, authorization = key, body, headers = {} } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* retain raw body for diagnostics */ }
  if (!response.ok) {
    throw new Error(`Supabase API ${method} ${path} failed: ${response.status}/${text.slice(0, 500)}`);
  }
  return parsed;
}

async function invoke(accessToken, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/engine-orchestrator`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "idempotency-key": body.idempotency_key,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* retain raw body for diagnostics */ }
  return { status: response.status, body: parsed };
}

function assertResponse(label, actual, status, error) {
  if (actual.status !== status || actual.body?.error !== error) {
    throw new Error(`${label}: expected ${status}/${error}, received ${actual.status}/${JSON.stringify(actual.body)}`);
  }
  process.stdout.write(`ok ${label}: ${status}/${error}\\n`);
}

const email = `cultureops-ci-${randomUUID()}@example.test`;
const password = `CI-${randomUUID()}-aA9!`;
let userId;

try {
  const created = await api("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  userId = created?.id;
  if (typeof userId !== "string") throw new Error("Supabase Auth admin did not return a user id");

  const session = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    authorization: null,
    body: { email, password },
  });
  if (typeof session?.access_token !== "string") throw new Error("Supabase Auth did not issue an access token");

  const organizations = await api("/rest/v1/organizations?code=eq.BA-LABS&select=id&limit=1");
  const organizationId = organizations?.[0]?.id;
  if (typeof organizationId !== "string") throw new Error("Seeded BA-LABS organization was not found");

  await api("/rest/v1/organization_members", {
    method: "POST",
    body: { organization_id: organizationId, user_id: userId, role: "owner" },
    headers: { Prefer: "return=minimal" },
  });
  process.stdout.write("ok auth fixture: temporary user joined the seeded BA-LABS tenant\\n");

  const windowStart = "2026-11-13T00:00:00Z";
  const windowEnd = "2026-11-14T00:00:00Z";
  const unmemberedOrganizationId = randomUUID();

  const denied = await invoke(session.access_token, {
    organization_id: unmemberedOrganizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    scope: { organization_id: unmemberedOrganizationId, culture_id: randomUUID() },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: `auth-denied-${randomUUID()}`,
  });
  assertResponse("orchestrator tenant isolation", denied, 403, "organization_access_denied");

  const qcMissingSource = await invoke(session.access_token, {
    organization_id: organizationId,
    engine_id: "environmental.timeseries.qc",
    engine_version: "0.2.0",
    record_ids: [randomUUID()],
    record_type: "environmental_observation",
    parameters: { window_start: windowStart, window_end: windowEnd },
    scope: { organization_id: organizationId, location_id: randomUUID() },
    idempotency_key: `auth-qc-source-${randomUUID()}`,
  });
  assertResponse(
    "authenticated QC source boundary",
    qcMissingSource,
    422,
    "one_or_more_source_records_missing_or_inaccessible",
  );

  const bieMissingCulture = await invoke(session.access_token, {
    organization_id: organizationId,
    engine_id: "biological.context.features",
    engine_version: "0.2.0",
    scope: { organization_id: organizationId, culture_id: randomUUID() },
    parameters: { window_start: windowStart, window_end: windowEnd, timezone: "Africa/Algiers" },
    idempotency_key: `auth-bie-culture-${randomUUID()}`,
  });
  assertResponse(
    "authenticated BIE biological source boundary",
    bieMissingCulture,
    422,
    "culture_not_found_or_inaccessible",
  );
} finally {
  if (userId) {
    await api(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    process.stdout.write("ok auth fixture: temporary user removed\\n");
  }
}
