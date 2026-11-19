// SPDX-License-Identifier: MIT
// Read-only public catalogue endpoint for the independent BA Labs Store.
import { createClient } from "npm:@supabase/supabase-js@2";

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

function getServerKey(): string | null {
  const keysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysRaw) {
    try {
      const keys = JSON.parse(keysRaw);
      if (typeof keys.default === "string") return keys.default;
    } catch {
      return null;
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
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
  const serviceKey = getServerKey();
  if (!supabaseUrl || !serviceKey) {
    console.error("[store-catalogue] Server configuration is incomplete");
    return response(500, { error: "server_configuration_error" }, origin);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: products, error: productError } = await admin
      .from("store_products")
      .select("id, product_code, slug, family, organism_label, title_i18n, description_i18n, source_notion_url, passport_enabled, display_order")
      .eq("publication_status", "published")
      .order("display_order", { ascending: true });

    if (productError) {
      console.error("[store-catalogue] Product query failed:", productError.code);
      return response(503, { error: "catalogue_temporarily_unavailable" }, origin);
    }

    const productIds = (products ?? []).map((product) => product.id);
    let variants: Record<string, unknown>[] = [];
    if (productIds.length > 0) {
      const { data, error } = await admin
        .from("store_variants")
        .select("product_id, variant_code, label_i18n, unit_code, pack_quantity, price_mode, price_dzd, availability, lead_time_days")
        .in("product_id", productIds)
        .neq("availability", "hidden");
      if (error) {
        console.error("[store-catalogue] Variant query failed:", error.code);
        return response(503, { error: "catalogue_temporarily_unavailable" }, origin);
      }
      variants = data ?? [];
    }

    const variantsByProduct = new Map<string, Record<string, unknown>[]>();
    for (const variant of variants) {
      const productId = String(variant.product_id);
      const current = variantsByProduct.get(productId) ?? [];
      current.push(variant);
      variantsByProduct.set(productId, current);
    }

    const safeProducts = (products ?? []).map((product) => ({
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
