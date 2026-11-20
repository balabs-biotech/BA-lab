import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set(["https://balabs-biotech.github.io"]);
const MAX_BODY_BYTES = 16384;
const MAX_ITEMS = 20;
type Product = {
  title: string;
  family: "liquid" | "agar" | "spawn";
  price?: number;
  indicative?: boolean;
};

const PRODUCTS: Record<string, Product> = {
  "BAL-LC-PPU-ETE-001": { title: "LC — Pleurotus pulmonarius · été", family: "liquid" },
  "BAL-LC-PPU-HIV-001": { title: "LC — Pleurotus pulmonarius · hiver", family: "liquid" },
  "BAL-LC-PER-HYB-001": { title: "LC — Pleurotus eryngii · hybrides", family: "liquid" },
  "BAL-LC-POS-KRYOS-001": { title: "LC — Pleurotus ostreatus · KRYOS", family: "liquid" },
  "BAL-LC-POS-GRISAM-001": { title: "LC — Pleurotus ostreatus · Gris américain", family: "liquid" },
  "BAL-LC-POS-HK35-001": { title: "LC — Pleurotus ostreatus · HK35", family: "liquid" },
  "BAL-LC-PPU-001": { title: "LC — Pleurotus pulmonarius", family: "liquid" },
  "BAL-LC-PCO-001": { title: "LC — Pleurotus columbinus", family: "liquid" },
  "BAL-LC-POS-P80-001": { title: "LC — Pleurotus ostreatus · P80", family: "liquid" },
  "BAL-LC-POS-G8-001": { title: "LC — Pleurotus ostreatus · G8", family: "liquid" },
  "BAL-LC-POS-BLUE-001": { title: "LC — Pleurotus ostreatus · Blue Oyster", family: "liquid" },
  "BAL-CUL-AGAR-001": { title: "Water Agar — boîte non inoculée", family: "agar" },
  "BAL-PETRI-INOC-001": { title: "Boîte de Pétri inoculée · 1 souche", family: "agar", price: 2000 },
  "BAL-GRAIN-SPAWN-WHEAT-25-001": { title: "Blé inoculé — grain spawn · 2,5 kg", family: "spawn", price: 1000 },
  "BAL-LC-SYR-10ML-001": { title: "Seringue de culture liquide · 10 ml", family: "liquid", price: 5000, indicative: true }
};

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});

function json(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\u0000/g, "").slice(0, max) : "";
}

function getSecretKey(): string {
  const packed = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch { /* use the legacy server-side key below */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

async function supabaseRequest(path: string, key: string, method: string, body?: unknown) {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("supabase_not_configured");
  const response = await fetch(base.replace(/\/$/, "") + "/rest/v1/" + path, {
    method,
    headers: {
      "apikey": key,
      "Content-Type": "application/json",
      ...(method === "PATCH" ? { "Prefer": "return=minimal" } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function isRateLimited(req: Request, secretKey: string): Promise<boolean> {
  const ip = (req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",").at(-1) ??
    "").trim().slice(0, 100);
  if (!ip) throw new Error("client_ip_unavailable");

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(ip));
  const fingerprint = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
  const result = await supabaseRequest("rpc/consume_store_rate_limit", secretKey, "POST", {
    p_fingerprint: fingerprint,
    p_limit: 5,
    p_window_seconds: 600
  });
  if (!result.response.ok || typeof result.data !== "boolean") {
    throw new Error("rate_limit_service_unavailable");
  }
  return !result.data;
}

async function verifyTurnstile(token: string, secret: string): Promise<"valid" | "invalid" | "unavailable"> {
  if (!token || token.length > 2048) return "invalid";
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return "unavailable";
    const result = await response.json().catch(() => null);
    return result?.success === true &&
      result?.hostname === "balabs-biotech.github.io" &&
      result?.action === "store_order"
      ? "valid"
      : "invalid";
  } catch {
    return "unavailable";
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST" || !ALLOWED_ORIGINS.has(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  // The browser flag is UX only; the server must remain closed by default.
  if (Deno.env.get("STORE_ORDER_ENABLED") !== "true" || Deno.env.get("TURNSTILE_ENABLED") !== "true") {
    return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) return json(413, { success: false, error: "payload_too_large" }, origin);

  let raw = "";
  try { raw = await req.text(); } catch { return json(400, { success: false, error: "invalid_body" }, origin); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json(413, { success: false, error: "payload_too_large" }, origin);
  }

  let body: Record<string, any>;
  try { body = JSON.parse(raw); } catch { return json(400, { success: false, error: "invalid_json" }, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(422, { success: false, error: "invalid_payload" }, origin);
  }
  if (clean(body.website, 200)) return json(200, { success: true }, origin);

  if (Deno.env.get("TURNSTILE_ENABLED") === "true") {
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
    if (!turnstileSecret) {
      console.error("[create-store-order] Anti-bot verification is not configured");
      return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
    }
    const challenge = await verifyTurnstile(clean(body.turnstileToken, 2048), turnstileSecret);
    if (challenge === "unavailable") {
      console.error("[create-store-order] Anti-bot verification service unavailable");
      return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
    }
    if (challenge !== "valid") {
      return json(403, { success: false, error: "anti_bot_verification_failed" }, origin);
    }
  }

  const customer = body.customer && typeof body.customer === "object" ? body.customer : {};
  const name = clean(customer.name, 120);
  const phone = clean(customer.phone, 32);
  const email = clean(customer.email, 160).toLowerCase();
  const organization = clean(customer.organization, 120);
  const wilaya = clean(customer.wilaya, 80);
  const message = clean(customer.message, 1200);
  const deliveryMode = clean(customer.deliveryMode, 40);
  const locale = clean(body.locale, 5);
  const requestId = clean(body.request_id, 36);

  if (name.length < 2 || !/^\+?[0-9 ()-]{7,32}$/.test(phone)) {
    return json(422, { success: false, error: "invalid_customer" }, origin);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(422, { success: false, error: "invalid_email" }, origin);
  }
  if (!["À définir", "Retrait sur place", "Livraison", "Expédition"].includes(deliveryMode)) {
    return json(422, { success: false, error: "invalid_delivery" }, origin);
  }
  if (!["fr", "en", "ar", "pt"].includes(locale)) {
    return json(422, { success: false, error: "invalid_locale" }, origin);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return json(422, { success: false, error: "invalid_request_reference" }, origin);
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ITEMS) {
    return json(422, { success: false, error: "invalid_items" }, origin);
  }

  const items: Array<Record<string, unknown>> = [];
  for (const rawItem of body.items) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      return json(422, { success: false, error: "invalid_item" }, origin);
    }
    const code = clean(rawItem.code, 64);
    const quantity = Number(rawItem.quantity);
    const product = Object.hasOwn(PRODUCTS, code) ? PRODUCTS[code] : undefined;
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return json(422, { success: false, error: "invalid_item" }, origin);
    }
    const priceConfirmed = typeof product.price === "number" && !product.indicative;
    items.push({
      product_code: code,
      product_title: product.title,
      product_family: product.family,
      quantity,
      unit_price_dzd: priceConfirmed ? product.price : null,
      price_confirmed: priceConfirmed
    });
  }

  const secretKey = getSecretKey();
  if (!secretKey || !Deno.env.get("SUPABASE_URL")) {
    console.error("[create-store-order] Supabase server configuration missing");
    return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
  }
  try {
    if (await isRateLimited(req, secretKey)) {
      return json(429, { success: false, error: "rate_limited" }, origin);
    }
  } catch (error) {
    console.error("[create-store-order] Rate limit service unavailable", error instanceof Error ? error.message : "unknown");
    return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
  }

  let createdOrder: Record<string, any>;
  try {
    const saved = await supabaseRequest("rpc/create_store_order", secretKey, "POST", {
      p_request_id: requestId,
      p_customer: { name, phone, email, organization, wilaya, deliveryMode, message },
      p_items: items,
      p_locale: locale
    });
    if (!saved.response.ok || !saved.data?.id || !saved.data?.order_ref) {
      console.error("[create-store-order] Database write failed", saved.response.status);
      return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
    }
    createdOrder = saved.data;
  } catch (error) {
    console.error("[create-store-order] Database request failed", error instanceof Error ? error.message : "unknown");
    return json(503, { success: false, error: "store_temporarily_unavailable" }, origin);
  }

  const orderRef = String(createdOrder.order_ref);
  return json(202, {
    success: true,
    orderRef,
    duplicate: Boolean(createdOrder.duplicate),
    notionSync: "pending"
  }, origin);
});
