import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DATA_SOURCE_ID = Deno.env.get("NOTION_STORE_DATA_SOURCE_ID") ?? "7a40b95b-e353-4eb9-a471-99c97c5904f5";
const NOTION_VERSION = "2025-09-03";
const MAX_BATCH = 3;

function getSecretKey(): string {
  const packed = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch { /* fall through to the legacy server key */ }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function hasServiceRoleJwt(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
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
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000)
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function rich(value: string) {
  return { rich_text: value ? [{ type: "text", text: { content: value.slice(0, 1900) } }] : [] };
}

async function notionRequest(path: string, token: string, method: string, body?: unknown) {
  const response = await fetch("https://api.notion.com/v1" + path, {
    method,
    headers: {
      "Authorization": "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000)
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function syncToNotion(order: Record<string, any>, items: Array<Record<string, any>>, token: string) {
  const title = "Boutique BA Labs — " + order.order_ref;
  const lookup = await notionRequest("/data_sources/" + DATA_SOURCE_ID + "/query", token, "POST", {
    filter: { property: "Demande", title: { equals: title } },
    page_size: 1
  });
  if (!lookup.response.ok) {
    const code = typeof lookup.data?.code === "string" ? lookup.data.code : "lookup_failed";
    throw new Error("notion_lookup_" + lookup.response.status + "_" + code);
  }
  const existing = Array.isArray(lookup.data?.results) ? lookup.data.results[0] : null;
  if (existing?.id) return String(existing.id);

  const families = new Set(items.map(item => String(item.product_family)));
  const allCultureFamilies = [...families].every(family => family === "liquid" || family === "spawn");
  const category = families.size === 1 && families.has("agar") ? "Géloses" : allCultureFamilies ? "Cultures" : "Autre";
  const productText = items.map(item =>
    Number(item.quantity) + " × " + String(item.product_title) + " [" + String(item.product_code) + "]"
  ).join("\n");
  const formatText = items.map(item =>
    String(item.product_code) + " : " + Number(item.quantity) + " unité(s) — conditionnement à confirmer"
  ).join("\n");
  const message = [
    order.customer_message ? String(order.customer_message) : "",
    "Référence : " + String(order.order_ref),
    "Prix, disponibilité, conditionnement et modalités à confirmer par BA Labs.",
    "Aucun paiement effectué à ce stade."
  ].filter(Boolean).join("\n");

  const properties: Record<string, unknown> = {
    "Demande": { title: [{ type: "text", text: { content: title } }] },
    "Statut": { select: { name: "🆕 Nouvelle" } },
    "Nom": rich(String(order.customer_name)),
    "Téléphone": { phone_number: String(order.customer_phone) },
    "Wilaya": rich(String(order.customer_wilaya ?? "")),
    "Produit": rich(productText),
    "Format": rich(formatText),
    "Quantité": { number: Number(order.total_quantity) },
    "Catégorie": { select: { name: category } },
    "Mode de livraison": { select: { name: String(order.delivery_mode) } },
    "Message": rich(message),
    "Notes internes": rich([
      "Origine : Boutique publique BA Labs",
      "Référence : " + String(order.order_ref),
      "Synchronisation : Supabase → Notion",
      "ID Supabase : " + String(order.id)
    ].join("\n"))
  };
  if (order.customer_email) properties["Email"] = { email: String(order.customer_email) };
  if (order.customer_organization) properties["Organisation"] = rich(String(order.customer_organization));
  if (order.estimated_total_dzd !== null && order.estimated_total_dzd !== undefined) {
    properties["Prix estimé"] = { number: Number(order.estimated_total_dzd) };
  }

  const created = await notionRequest("/pages", token, "POST", {
    parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID },
    properties
  });
  if (!created.response.ok || !created.data?.id) {
    const code = typeof created.data?.code === "string" ? created.data.code : "create_failed";
    throw new Error("notion_create_" + created.response.status + "_" + code);
  }
  return String(created.data.id);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // Supabase gateway verifies the JWT signature; this second check restricts the caller to service_role.
  if (!hasServiceRoleJwt(req)) return new Response("Forbidden", { status: 403 });

  const secretKey = getSecretKey();
  const notionToken = Deno.env.get("NOTION_STORE_API_KEY") ?? "";
  if (!secretKey || !notionToken || !Deno.env.get("SUPABASE_URL")) {
    console.error("[store-order-sync] Server credentials are not configured");
    return Response.json({ success: false, error: "sync_not_configured" }, { status: 503 });
  }

  const claimed = await supabaseRequest("rpc/claim_store_order_sync", secretKey, "POST", { p_limit: MAX_BATCH });
  if (!claimed.response.ok || !Array.isArray(claimed.data)) {
    console.error("[store-order-sync] Claim operation failed", claimed.response.status);
    return Response.json({ success: false, error: "claim_failed" }, { status: 503 });
  }

  let synced = 0;
  let deferred = 0;
  for (const record of claimed.data) {
    const order = record?.order;
    const items = Array.isArray(record?.items) ? record.items : [];
    const lockToken = String(order?.notion_sync_lock_token ?? "");
    const orderId = String(order?.id ?? "");
    if (!orderId || !lockToken) {
      deferred++;
      console.error("[store-order-sync] Claimed record lacks its processing lock");
      continue;
    }
    try {
      if (!items.length) throw new Error("claimed_order_has_no_items");
      const pageId = await syncToNotion(order, items, notionToken);
      const completed = await supabaseRequest("rpc/complete_store_order_sync", secretKey, "POST", {
        p_order_id: orderId,
        p_lock_token: lockToken,
        p_notion_page_id: pageId
      });
      if (!completed.response.ok || completed.data !== true) {
        throw new Error("sync_completion_not_confirmed");
      }
      synced++;
    } catch (error) {
      const code = error instanceof Error ? error.message : "notion_sync_failed";
      const failed = await supabaseRequest("rpc/fail_store_order_sync", secretKey, "POST", {
        p_order_id: orderId,
        p_lock_token: lockToken,
        p_error: code.slice(0, 180)
      });
      if (!failed.response.ok) {
        console.error("[store-order-sync] Retry state update failed", failed.response.status);
      }
      deferred++;
      console.error("[store-order-sync] A commercial request remains pending", code.slice(0, 180));
    }
  }

  return Response.json({ success: true, claimed: claimed.data.length, synced, deferred }, {
    headers: { "Cache-Control": "no-store" }
  });
});
