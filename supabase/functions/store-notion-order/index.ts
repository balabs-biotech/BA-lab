import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DATA_SOURCE_ID = "7a40b95b-e353-4eb9-a471-99c97c5904f5";
const ALLOWED_ORIGINS = new Set(["https://balabs-biotech.github.io"]);
const PRODUCTS: Record<string, { title: string; family: "agar" | "liquid" | "spawn"; price?: number; indicative?: boolean }> = {
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
  "BAL-CUL-AGAR-001": { title: "Water Agar — boîte non inoculée", family: "agar", price: 100 },
  "BAL-PETRI-INOC-001": { title: "Boîte de Pétri inoculée · 1 souche", family: "agar", price: 2000 },
  "BAL-GRAIN-SPAWN-WHEAT-25-001": { title: "Blé inoculé — grain spawn · 2,5 kg", family: "spawn", price: 1000 },
  "BAL-LC-SYR-10ML-001": { title: "Seringue de culture liquide · 10 ml", family: "liquid", price: 5000, indicative: true }
};

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});
const reply = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const rich = (value: string) => ({ rich_text: [{ type: "text", text: { content: value.slice(0, 1900) } }] });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST" || !ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  const notionKey = Deno.env.get("NOTION_API_KEY");
  if (!notionKey) return reply({ success: false, error: "service_not_configured" }, 503, origin);
  let rawBody = "";
  try { rawBody = await req.text(); } catch { return reply({ success: false, error: "invalid_body" }, 400, origin); }
  if (new TextEncoder().encode(rawBody).byteLength > 12000) return reply({ success: false, error: "payload_too_large" }, 413, origin);
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return reply({ success: false, error: "invalid_json" }, 400, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ success: false, error: "invalid_payload" }, 400, origin);
  if (clean(body.website, 200)) return reply({ success: true }, 200, origin);

  const customer = body.customer && typeof body.customer === "object" ? body.customer as Record<string, unknown> : {};
  const name = clean(customer.name, 120);
  const phone = clean(customer.phone, 32);
  const email = clean(customer.email, 160);
  const organization = clean(customer.organization, 120);
  const wilaya = clean(customer.wilaya, 80);
  const message = clean(customer.message, 1200);
  const delivery = clean(customer.deliveryMode, 40);
  if (name.length < 2 || !/^\+?[0-9 ()-]{7,32}$/.test(phone)) return reply({ success: false, error: "invalid_customer" }, 400, origin);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ success: false, error: "invalid_email" }, 400, origin);
  if (!["À définir", "Retrait sur place", "Livraison", "Expédition"].includes(delivery)) return reply({ success: false, error: "invalid_delivery" }, 400, origin);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return reply({ success: false, error: "invalid_items" }, 400, origin);

  const selected: Array<{ code: string; quantity: number; product: typeof PRODUCTS[string] }> = [];
  for (const raw of body.items) {
    if (!raw || typeof raw !== "object") return reply({ success: false, error: "invalid_item" }, 400, origin);
    const item = raw as Record<string, unknown>;
    const code = clean(item.code, 64);
    const quantity = Number(item.quantity);
    if (!PRODUCTS[code] || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return reply({ success: false, error: "invalid_item" }, 400, origin);
    selected.push({ code, quantity, product: PRODUCTS[code] });
  }

  const totalQuantity = selected.reduce((sum, item) => sum + item.quantity, 0);
  const lines = selected.map(item => item.quantity + " × " + item.product.title + " [" + item.code + "]");
  const formatLines = selected.map(item => item.code + ": " + item.quantity).join("\n");
  const fixedPricesOnly = selected.every(item => typeof item.product.price === "number" && !item.product.indicative);
  const estimate = fixedPricesOnly ? selected.reduce((sum, item) => sum + (item.product.price || 0) * item.quantity, 0) : null;
  const categories = new Set(selected.map(item => item.product.family === "agar" ? "Géloses" : "Cultures"));
  const category = categories.size === 1 ? Array.from(categories)[0] : "Autre";
  const title = "Demande boutique — " + name + " — " + new Date().toISOString().slice(0, 10);

  const properties: Record<string, unknown> = {
    "Demande": { title: [{ type: "text", text: { content: title } }] },
    "Nom": rich(name),
    "Téléphone": { phone_number: phone },
    "Catégorie": { select: { name: category } },
    "Produit": rich(lines.join("\n")),
    "Format": rich(formatLines),
    "Quantité": { number: totalQuantity },
    "Prix estimé": { number: estimate },
    "Mode de livraison": { select: { name: delivery } },
    "Statut": { select: { name: "🆕 Nouvelle" } }
  };
  if (email) properties["Email"] = { email };
  if (organization) properties["Organisation"] = rich(organization);
  if (wilaya) properties["Wilaya"] = rich(wilaya);
  if (message) properties["Message"] = rich(message);

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { "Authorization": "Bearer " + notionKey, "Notion-Version": "2025-09-03", "Content-Type": "application/json" },
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: DATA_SOURCE_ID }, properties })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Notion create page failed", response.status, detail.slice(0, 500));
    return reply({ success: false, error: "notion_write_failed" }, 502, origin);
  }
  const created = await response.json();
  return reply({ success: true, requestId: created.id }, 201, origin);
});
