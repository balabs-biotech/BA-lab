import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set(["https://balabs-biotech.github.io"]);
const DATA_SOURCE_ID = Deno.env.get("NOTION_CATALOGUE_DATA_SOURCE_ID") ?? "8998bc08-5a51-4c61-a94c-d9fd144a7236";
const NOTION_VERSION = "2025-09-03";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin"
  };
}

function json(status: number, body: Record<string, unknown>, origin: string, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function richText(property: any): string {
  const parts = Array.isArray(property?.rich_text) ? property.rich_text : [];
  return parts.map((part: any) => typeof part?.plain_text === "string" ? part.plain_text : "").join("").trim();
}

function titleText(property: any): string {
  const parts = Array.isArray(property?.title) ? property.title : [];
  return parts.map((part: any) => typeof part?.plain_text === "string" ? part.plain_text : "").join("").trim();
}

function selectValue(property: any): string | null {
  return typeof property?.select?.name === "string" ? property.select.name : null;
}

function publicProduct(page: any) {
  const properties = page?.properties ?? {};
  if (properties["Actif au catalogue"]?.checkbox !== true) return null;

  const product = {
    product_code: richText(properties["Référence publique"]),
    short_code: richText(properties["Code court"]),
    title: titleText(properties["Produit"]),
    family: selectValue(properties["Famille"]),
    availability: selectValue(properties["Disponibilité"]),
    formats: richText(properties["Formats disponibles"]),
    applications: richText(properties["Applications"]),
    evidence_level: selectValue(properties["Niveau de preuve"])
  };

  if (!product.product_code || !product.title) return null;
  return product;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "GET") return json(405, { success: false, error: "method_not_allowed" }, origin);

  const token = Deno.env.get("NOTION_CATALOGUE_API_KEY") ?? "";
  if (!token) {
    console.error("[store-catalogue] Dedicated read-only catalogue integration is not configured");
    return json(503, { success: false, error: "catalogue_temporarily_unavailable" }, origin);
  }

  const products: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  try {
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      const response = await fetch("https://api.notion.com/v1/data_sources/" + DATA_SOURCE_ID + "/query", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Authorization": "Bearer " + token,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          filter: { property: "Actif au catalogue", checkbox: { equals: true } },
          page_size: PAGE_SIZE,
          ...(cursor ? { start_cursor: cursor } : {})
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.results)) {
        const code = typeof payload?.code === "string" ? payload.code : "catalogue_query_failed";
        console.error("[store-catalogue] Notion query failed", response.status, code);
        return json(503, { success: false, error: "catalogue_temporarily_unavailable" }, origin);
      }

      for (const page of payload.results) {
        const product = publicProduct(page);
        if (product) products.push(product);
      }

      if (!payload.has_more || typeof payload.next_cursor !== "string") {
        return json(200, { success: true, products, truncated: false }, origin, "public, max-age=60, s-maxage=300");
      }
      cursor = payload.next_cursor;
    }

    return json(200, { success: true, products, truncated: true }, origin, "public, max-age=60, s-maxage=300");
  } catch (error) {
    console.error("[store-catalogue] Catalogue read failed", error instanceof Error ? error.message : "unknown");
    return json(503, { success: false, error: "catalogue_temporarily_unavailable" }, origin);
  }
});
