import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/store-catalogue/index.ts", "utf8");
const storefront = readFileSync("store/store.js", "utf8");

assert.ok(source.includes('Deno.env.get("NOTION_CATALOGUE_API_KEY")'), "Public catalogue must use its own read-only Notion credential");
assert.ok(!source.includes("NOTION_STORE_API_KEY") && !source.includes("NOTION_API_KEY"), "Public catalogue must not share the commercial order or CultureOps credentials");
assert.ok(source.includes('8998bc08-5a51-4c61-a94c-d9fd144a7236'), "Catalogue API must target the dedicated public data source");
assert.ok(source.includes('filter: { property: "Actif au catalogue", checkbox: { equals: true } }'), "Only explicitly active public catalogue records may be returned");
assert.ok(source.includes('"Référence publique"') && source.includes('"Produit"') && source.includes('"Disponibilité"'), "Response must use the approved public catalogue fields");
assert.ok(!source.includes("customer_email") && !source.includes("customer_phone") && !source.includes("customer_message"), "Catalogue endpoint must never query customer data");
assert.ok(!source.includes('properties["Résumé public"]') && !source.includes('properties["Usage cible"]') && !source.includes('properties["Lien demande"]'), "Catalogue endpoint must not expose potentially sensitive formulation summaries or internal request links");
assert.ok(source.includes('ALLOWED_ORIGINS.has(origin)') && source.includes('"Access-Control-Allow-Methods": "GET, OPTIONS"') && source.includes('req.method !== "GET"'), "Catalogue endpoint must be read-only and origin-restricted for browser use");
assert.ok(source.includes('"Cache-Control": cache') && source.includes('"public, max-age=60, s-maxage=300"'), "Public catalogue responses must use short-lived shared caching");
assert.ok(!source.includes("return payload") && !source.includes("JSON.stringify(page)"), "Raw Notion pages and internal metadata must never be exposed");
assert.ok(source.includes("signal: AbortSignal.timeout(15_000)"), "Notion catalogue requests must have a bounded network timeout");
assert.ok(storefront.includes("STORE_REMOTE_CATALOGUE_ENABLED=false"), "Remote catalogue integration must remain disabled until the dedicated secret and product reconciliation are complete");
assert.ok(storefront.includes("const REMOTE_STATUS_MAP=Object.freeze({") && storefront.includes('"sur demande":"on_request"') && storefront.includes('"à confirmer":"to_confirm"') && storefront.includes('"indisponible":"unavailable"'), "Remote availability values must map to the storefront status model");
assert.ok(storefront.includes("products=products.map(product=>{") && storefront.includes("return remoteStatus?{...product,status:remoteStatus}:product;"), "Remote catalogue may update availability only while preserving local multilingual titles, descriptions and prices");
assert.ok(storefront.includes(".filter(([,status])=>status!==null)") && storefront.includes("if(!updates.size)return;"), "Unknown remote availability values must not overwrite reviewed local statuses");
assert.ok(!storefront.includes("products=remote") && !storefront.includes("titles:p.title_i18n") && !storefront.includes("descriptions:p.description_i18n"), "Remote catalogue must not replace curated multilingual storefront content with absent or unreviewed fields");
assert.ok(storefront.includes("products.some(product=>product.code===code&&product.status!==\"unavailable\")"), "Cart contents must be pruned when a product becomes unavailable in the public catalogue");
assert.ok(storefront.includes("products=products.map(product=>{") && storefront.includes("const remoteStatus=updates.get(product.code);"), "Remote catalogue may only update existing locally curated products and must never inject unreviewed product records");
assert.ok(storefront.includes("credentials:\"omit\"") && storefront.includes("method:\"GET\""), "Public catalogue request must be read-only and must not send browser cookies");

console.log("Public catalogue contract passed: isolated read-only credential, active-only records, field allowlist, no customer data, bounded network timeout and disabled frontend switch.");
