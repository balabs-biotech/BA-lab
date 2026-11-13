// SPDX-License-Identifier: MIT
// Service-only bounded consumer for the durable scientific execution queue.
import { createClient } from "npm:@supabase/supabase-js@2";
import Ajv2020 from "npm:ajv@8.17.1/dist/2020.js";
import addFormats from "npm:ajv-formats@3.0.1";
import requestSchema from "../../../schemas/engine/v1/request.schema.json" with { type: "json" };
import responseSchema from "../../../schemas/engine/v1/response.schema.json" with { type: "json" };

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ba-dispatch-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const MAX_BODY_BYTES = 4_096;
const MAX_WORKER_RESPONSE_BYTES = 128_000;
const MAX_DISPATCH_BATCH = 2;
const EXECUTION_LEASE_SECONDS = 120;
const WORKER_TIMEOUT_MS = 20_000;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);

type Execution = {
  id: string;
  organization_id: string;
  engine_id: string;
  engine_version: string;
  input_snapshot_sha256: string;
  request_payload: Record<string, any>;
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers });
}
function object(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
async function readBoundedBody(req: Request): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
async function readBoundedWorkerResponse(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WORKER_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("worker_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
async function persistFailure(
  db: ReturnType<typeof createClient>,
  execution: Execution,
  workerId: string,
  code: string,
  message: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db.from("engine_executions").update({
    status: "failed",
    error_code: code,
    error_message: message.slice(0, 1_000),
    completed_at: now,
    updated_at: now,
  })
    .eq("organization_id", execution.organization_id)
    .eq("id", execution.id)
    .eq("claimed_by", workerId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  return !error && !!data;
}
async function processExecution(
  db: ReturnType<typeof createClient>,
  execution: Execution,
  workerId: string,
  workerUrl: string,
  workerToken: string,
): Promise<"completed" | "failed" | "lost"> {
  const request = execution.request_payload;
  if (!object(request) || !validateRequest(request) ||
    request.engine?.engine_id !== execution.engine_id ||
    request.engine?.engine_version !== execution.engine_version ||
    request.scope?.organization_id !== execution.organization_id ||
    request.input?.snapshot_sha256 !== execution.input_snapshot_sha256) {
    return await persistFailure(
      db, execution, workerId, "stored_request_invalid",
      "The immutable queued request failed engine contract validation.",
    ) ? "failed" : "lost";
  }

  let response: Response;
  let body: string;
  try {
    response = await fetch(new URL("/v1/execute", workerUrl), {
      method: "POST",
      headers: {
        "Authorization": \`Bearer \${workerToken}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
    });
    body = await readBoundedWorkerResponse(response);
  } catch (error) {
    const code = error instanceof Error && error.message === "worker_response_too_large"
      ? "worker_response_too_large"
      : error instanceof DOMException && error.name === "TimeoutError"
      ? "worker_timeout"
      : "worker_unreachable";
    return await persistFailure(
      db, execution, workerId, code,
      "The registered engine worker did not return a usable response.",
    ) ? "failed" : "lost";
  }

  let result: unknown;
  try {
    result = JSON.parse(body);
  } catch {
    result = null;
  }
  if (!response.ok || !validateResponse(result) || !object(result) ||
    result.request_id !== request.request_id ||
    result.engine?.engine_id !== execution.engine_id ||
    result.engine?.engine_version !== execution.engine_version ||
    result.input_snapshot_sha256 !== execution.input_snapshot_sha256) {
    return await persistFailure(
      db, execution, workerId,
      !response.ok ? "worker_http_error" : "worker_response_invalid_or_unbound",
      "Worker response failed transport, schema, or execution-correlation validation.",
    ) ? "failed" : "lost";
  }

  result.execution_id = execution.id;
  const completedAt = new Date().toISOString();
  if (result.status === "completed") {
    const { data: resultId, error } = await db.rpc("complete_engine_execution", {
      p_organization_id: execution.organization_id,
      p_execution_id: execution.id,
      p_result: result,
      p_completed_at: completedAt,
    });
    if (!error && resultId) return "completed";
    return await persistFailure(
      db, execution, workerId, "result_persistence_failed",
      "The worker result could not be committed atomically to the execution ledger.",
    ) ? "failed" : "lost";
  }

  const error = result.error;
  return await persistFailure(
    db, execution, workerId,
    typeof error?.code === "string" ? error.code : "engine_execution_failed",
    typeof error?.message === "string" ? error.message : "The registered engine reported a failure.",
  ) ? "failed" : "lost";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const expectedSecret = Deno.env.get("BA_ENGINE_DISPATCH_TOKEN") ?? "";
  const suppliedSecret = req.headers.get("x-ba-dispatch-secret") ?? "";
  if (expectedSecret.length < 32 || !constantTimeEqual(suppliedSecret, expectedSecret)) {
    return reply(401, { error: "authentication_required" });
  }

  try {
    const raw = await readBoundedBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!object(body) || Object.keys(body).length !== 0) {
      return reply(400, { error: "request body must be an empty object" });
    }
  } catch (error) {
    return reply(error instanceof Error && error.message === "payload_too_large" ? 413 : 400,
      { error: "invalid_body" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const workerUrl = Deno.env.get("BA_ENGINE_WORKER_URL");
  const workerToken = Deno.env.get("BA_ENGINE_WORKER_TOKEN");
  if (!url || !serviceKey || !workerUrl || !workerToken) {
    console.error("[engine-queue-dispatch] required server configuration is missing");
    return reply(503, { error: "dispatcher_not_configured" });
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const workerId = \`engine-queue-dispatch:\${crypto.randomUUID()}\`;
  const { data, error } = await db.rpc("claim_engine_executions", {
    p_worker_id: workerId,
    p_limit: MAX_DISPATCH_BATCH,
    p_lease_seconds: EXECUTION_LEASE_SECONDS,
    p_execution_id: null,
    p_organization_id: null,
  });
  if (error) {
    console.error("[engine-queue-dispatch] queue claim failed");
    return reply(500, { error: "queue_claim_failed" });
  }

  const executions = Array.isArray(data) ? data as Execution[] : [];
  if (executions.length === 0) {
    return reply(200, { claimed: 0, completed: 0, failed: 0, lost: 0 });
  }

  const outcomes = await Promise.all(executions.map((execution) =>
    processExecution(db, execution, workerId, workerUrl, workerToken)
  ));
  return reply(200, {
    claimed: executions.length,
    completed: outcomes.filter((outcome) => outcome === "completed").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    lost: outcomes.filter((outcome) => outcome === "lost").length,
  });
});
