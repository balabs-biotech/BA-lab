// SPDX-License-Identifier: MIT
// Guest order tracking: bearer-token lookup returning order state only.
const ALLOWED_ORIGINS = new Set(["https://balabs-biotech.github.io"]);
const MAX_BODY_BYTES = 2048;

type JsonObject = Record<string, unknown>;

function json(status: number, body: JsonObject, origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "apikey, content-type, x-client-info");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return "\\x" + bytesToHex(new Uint8Array(digest));
}

async function hmacFingerprint(secret: string, ip: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip));
  return "\\x" + bytesToHex(new Uint8Array(signature));
}

function clientIp(req: Request): string | null {
  const direct = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
  if (direct && direct.trim()) return direct.trim().slice(0, 80);
  const forwarded = req.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last ? last.slice(0, 80) : null;
}

function getServerCredentials(): { key: string; legacyJwt: boolean } | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (typeof keys.default === "string" && keys.default.startsWith("sb_secret_")) {
        return { key: keys.default, legacyJwt: false };
      }
    } catch {
      return null;
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return legacy ? { key: legacy, legacyJwt: true } : null;
}

async function postRpc(
  supabaseUrl: string,
  credentials: { key: string; legacyJwt: boolean },
  name: string,
  body: JsonObject,
): Promise<{ ok: boolean; status: number; data: unknown; errorCode?: string }> {
  const headers = new Headers({ "apikey": credentials.key, "Content-Type": "application/json" });
  if (credentials.legacyJwt) headers.set("Authorization", "Bearer " + credentials.key);
  const response = await fetch(supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  const errorCode = isObject(data) && typeof data.code === "string" ? data.code : undefined;
  return { ok: response.ok, status: response.status, data, errorCode };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(403, { error: "origin_not_allowed" }, origin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin ?? "https://balabs-biotech.github.io",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
        "Vary": "Origin",
      },
    });
  }
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return json(413, { error: "request_too_large" }, origin);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json(413, { error: "request_too_large" }, origin);
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json(400, { error: "invalid_json_body" }, origin); }
  if (!isObject(body)) return json(400, { error: "invalid_tracking_request" }, origin);

  const orderCode = typeof body.order_code === "string" ? body.order_code.trim() : "";
  const trackingToken = typeof body.tracking_token === "string" ? body.tracking_token.trim() : "";
  if (!/^BA-[0-9]{6}-[A-F0-9]{8}$/.test(orderCode) ||
    !/^[A-Za-z0-9_-]{43}$/.test(trackingToken)) {
    return json(404, { error: "order_not_found" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const credentials = getServerCredentials();
  const rateLimitSecret = Deno.env.get("STORE_RATE_LIMIT_HMAC_SECRET");
  const ip = clientIp(req);
  if (!supabaseUrl || !credentials || !rateLimitSecret || !ip) {
    console.error("[track-store-order] Server configuration or client fingerprint is unavailable");
    return json(503, { error: "tracking_temporarily_unavailable" }, origin);
  }

  try {
    const rate = await postRpc(supabaseUrl, credentials, "consume_store_checkout_rate_limit", {
      p_fingerprint_hash: await hmacFingerprint(rateLimitSecret, ip),
      p_limit: 10,
      p_window_seconds: 600,
    });
    if (!rate.ok) {
      console.error("[track-store-order] Rate-limit RPC failed:", rate.errorCode ?? rate.status);
      return json(503, { error: "tracking_temporarily_unavailable" }, origin);
    }
    if (rate.data !== true) return json(429, { error: "too_many_requests" }, origin);

    const result = await postRpc(supabaseUrl, credentials, "lookup_store_guest_order", {
      p_order_code: orderCode,
      p_tracking_token_hash: await hash(trackingToken),
    });
    if (!result.ok) {
      console.error("[track-store-order] Tracking RPC failed:", result.errorCode ?? result.status);
      return json(503, { error: "tracking_temporarily_unavailable" }, origin);
    }
    if (!isObject(result.data)) return json(404, { error: "order_not_found" }, origin);

    return json(200, { order: result.data }, origin);
  } catch (error) {
    console.error("[track-store-order] Unexpected failure:", error instanceof Error ? error.message : "unknown");
    return json(503, { error: "tracking_temporarily_unavailable" }, origin);
  }
});
