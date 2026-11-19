// SPDX-License-Identifier: MIT
// Guest order intake. Public entry point; all writes and price decisions stay server-side.
const ALLOWED_ORIGINS = new Set(["https://balabs-biotech.github.io"]);
const MAX_BODY_BYTES = 16 * 1024;
const MAX_ITEMS = 30;

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

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
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
  if (!forwarded) return null;
  // The edge proxy appends the connecting client address to the forwarded chain.
  const last = forwarded.split(",").at(-1)?.trim();
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
  const headers = new Headers({
    "apikey": credentials.key,
    "Content-Type": "application/json",
  });
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
  if (!isObject(body) || !isObject(body.order) || !Array.isArray(body.items)) {
    return json(400, { error: "invalid_order_payload" }, origin);
  }
  if (cleanText(body.website, 200)) return json(400, { error: "invalid_order_payload" }, origin);
  if (body.items.length < 1 || body.items.length > MAX_ITEMS) {
    return json(422, { error: "invalid_item_count" }, origin);
  }

  const order = body.order;
  const customerName = cleanText(order.customer_name, 160);
  const customerPhone = cleanText(order.customer_phone, 40);
  const customerEmail = cleanText(order.customer_email, 254).toLowerCase();
  const deliveryMode = order.delivery_mode;
  const locale = order.locale ?? "fr";
  const termsVersion = Deno.env.get("STORE_TERMS_VERSION");
  const privacyVersion = Deno.env.get("STORE_PRIVACY_NOTICE_VERSION");
  if (!termsVersion || !privacyVersion) {
    console.error("[create-store-order] Legal document versions are not configured");
    return json(503, { error: "store_temporarily_unavailable" }, origin);
  }
  if (customerName.length < 2 || customerPhone.length < 6 ||
    (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) ||
    !["fr", "en", "ar", "pt"].includes(String(locale)) ||
    !["pickup", "shipping"].includes(String(deliveryMode)) ||
    order.terms_accepted !== true ||
    order.terms_version !== termsVersion ||
    order.privacy_notice_version !== privacyVersion) {
    return json(422, { error: "invalid_customer_or_consent_fields" }, origin);
  }
  if (deliveryMode === "shipping" &&
    (!cleanText(order.delivery_address, 500) || !cleanText(order.delivery_wilaya, 120))) {
    return json(422, { error: "shipping_address_required" }, origin);
  }
  if (order.marketing_opt_in !== undefined && typeof order.marketing_opt_in !== "boolean") {
    return json(422, { error: "invalid_marketing_preference" }, origin);
  }

  const trackingToken = cleanText(body.tracking_token, 80);
  const idempotencyKey = cleanText(body.idempotency_key, 80);
  if (!/^[A-Za-z0-9_-]{43}$/.test(trackingToken) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return json(422, { error: "invalid_order_security_tokens" }, origin);
  }

  const safeItems: JsonObject[] = [];
  for (const item of body.items) {
    if (!isObject(item)) return json(422, { error: "invalid_order_item" }, origin);
    const productCode = cleanText(item.product_code, 80);
    const variantCode = cleanText(item.variant_code, 80);
    const quantity = Number(item.quantity);
    if (!productCode || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      return json(422, { error: "invalid_order_item" }, origin);
    }
    // Deliberately ignore all browser-supplied price, discount, stock, and total fields.
    safeItems.push({
      product_code: productCode,
      ...(variantCode ? { variant_code: variantCode } : {}),
      quantity,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const credentials = getServerCredentials();
  const rateLimitSecret = Deno.env.get("STORE_RATE_LIMIT_HMAC_SECRET");
  const ip = clientIp(req);
  if (!supabaseUrl || !credentials || !rateLimitSecret || !ip) {
    console.error("[create-store-order] Server configuration or client fingerprint is unavailable");
    return json(503, { error: "store_temporarily_unavailable" }, origin);
  }

  try {
    const fingerprintHash = await hmacFingerprint(rateLimitSecret, ip);
    const rate = await postRpc(supabaseUrl, credentials, "consume_store_checkout_rate_limit", {
      p_fingerprint_hash: fingerprintHash,
      p_limit: 5,
      p_window_seconds: 600,
    });
    if (!rate.ok) {
      console.error("[create-store-order] Rate-limit RPC failed:", rate.errorCode ?? rate.status);
      return json(503, { error: "store_temporarily_unavailable" }, origin);
    }
    if (rate.data !== true) return json(429, { error: "too_many_requests" }, origin);

    const created = await postRpc(supabaseUrl, credentials, "create_store_guest_order", {
      p_order: {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        company_name: cleanText(order.company_name, 180) || null,
        delivery_mode: deliveryMode,
        locale,
        delivery_address: cleanText(order.delivery_address, 500) || null,
        delivery_wilaya: cleanText(order.delivery_wilaya, 120) || null,
        delivery_commune: cleanText(order.delivery_commune, 120) || null,
        delivery_instructions: cleanText(order.delivery_instructions, 500) || null,
        terms_accepted: true,
        terms_version: termsVersion,
        privacy_notice_version: privacyVersion,
        marketing_opt_in: order.marketing_opt_in === true,
      },
      p_items: safeItems,
      p_tracking_token_hash: await sha256(trackingToken),
      p_idempotency_key_hash: await sha256(idempotencyKey),
    });

    if (!created.ok || !isObject(created.data)) {
      console.error("[create-store-order] Order RPC failed:", created.errorCode ?? created.status);
      return json(422, { error: "order_could_not_be_created" }, origin);
    }

    return json(created.data.idempotent_replay === true ? 200 : 201, {
      order_code: created.data.order_code,
      status: created.data.status,
      idempotent_replay: created.data.idempotent_replay === true,
      tracking_token: trackingToken,
    }, origin);
  } catch (error) {
    console.error("[create-store-order] Unexpected failure:", error instanceof Error ? error.message : "unknown");
    return json(503, { error: "store_temporarily_unavailable" }, origin);
  }
});
