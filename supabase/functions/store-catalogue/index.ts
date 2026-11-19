// SPDX-License-Identifier: MIT
// Read-only public catalogue endpoint for the independent BA Labs Store.
const ALLOWED_ORIGINS = new Set([
  "https://balabs-biotech.github.io",
]);

function response(status: number, body: Record<string, unknown>, origin?: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": status === 200 ? "public, max-age=60, stale-while-revalidate=300" : "no-store",
    "Vary": "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "apikey, content-type, x-client-info");
  }
  return new Response(JSON.stringify(body), { status, headers });
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

function serverHeaders(credentials: { key: string; legacyJwt: boolean }): Headers {
  const headers = new Headers({ "apikey": credentials.key });
  // New sb_secret keys are sent on apikey only; legacy service_role JWTs also need Authorization.
  if (credentials.legacyJwt) headers.set("Authorization", "Bearer " + credentials.key);
  return headers;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return response(403, { error: "origin_not_allowed" });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin ?? "https://balabs-biotech.github.io",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
        "Vary": "Origin",
      },
    });
  }
  if (req.method !== "GET") return response(405, { error: "method_not_allowed" }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const credentials = getServerCredentials();
  if (!supabaseUrl || !credentials) {
    console.error("[store-catalogue] Server configuration is incomplete");
    return response(500, { error: "server_configuration_error" }, origin);
  }

  try {
    const productUrl = new URL(supabaseUrl.replace(/\/$/, "") + "/rest/v1/store_products");
    productUrl.searchParams.set(
      "select",
      "id,product_code,slug,family,organism_label,title_i18n,description_i18n,source_notion_url,passport_enabled,display_order",
    );
    productUrl.searchParams.set("publication_status", "eq.published");
    productUrl.searchParams.set("order", "display_order.asc");

    const productResponse = await fetch(productUrl, { headers: serverHeaders(credentials) });
    if (!productResponse.ok) {
      console.error("[store-catalogue] Product query failed:", productResponse.status);
      return response(503, { error: "catalogue_temporarily_unavailable" }, origin);
    }
    const products = await productResponse.json();
    if (!Array.isArray(products)) return response(503, { error: "catalogue_temporarily_unavailable" }, origin);

    const productIds = products
      .map((product) => product && typeof product.id === "string" ? product.id : "")
      .filter(Boolean);

    let variants: Record<string, unknown>[] = [];
    if (productIds.length > 0) {
      const variantUrl = new URL(supabaseUrl.replace(/\/$/, "") + "/rest/v1/store_variants");
      variantUrl.searchParams.set(
        "select",
        "product_id,variant_code,label_i18n,unit_code,pack_quantity,price_mode,price_dzd,availability,lead_time_days",
      );
      variantUrl.searchParams.set("product_id", "in.(" + productIds.join(",") + ")");
      variantUrl.searchParams.set("availability", "neq.hidden");

      const variantResponse = await fetch(variantUrl, { headers: serverHeaders(credentials) });
      if (!variantResponse.ok) {
        console.error("[store-catalogue] Variant query failed:", variantResponse.status);
        return response(503, { error: "catalogue_temporarily_unavailable" }, origin);
      }
      const data = await variantResponse.json();
      if (!Array.isArray(data)) return response(503, { error: "catalogue_temporarily_unavailable" }, origin);
      variants = data;
    }

    const variantsByProduct = new Map<string, Record<string, unknown>[]>();
    for (const variant of variants) {
      const productId = String(variant.product_id);
      const current = variantsByProduct.get(productId) ?? [];
      current.push(variant);
      variantsByProduct.set(productId, current);
    }

    const safeProducts = products.map((product) => ({
      product_code: product.product_code,
      slug: product.slug,
      family: product.family,
      organism_label: product.organism_label,
      title_i18n: product.title_i18n,
      description_i18n: product.description_i18n,
      source_notion_url: product.source_notion_url,
      passport_enabled: product.passport_enabled,
      variants: variantsByProduct.get(product.id) ?? [],
    }));

    return response(200, { products: safeProducts, count: safeProducts.length }, origin);
  } catch (error) {
    console.error("[store-catalogue] Unexpected failure:", error instanceof Error ? error.message : "unknown");
    return response(503, { error: "catalogue_temporarily_unavailable" }, origin);
  }
});
