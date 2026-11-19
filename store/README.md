# BA Labs Store

The store is a separate, static customer-facing application published under `/store/` on GitHub Pages. It is not part of CultureOps and does not reuse CultureOps' tenant-scoped order tables.

## Current release boundary

The storefront is a catalogue and request-preparation interface. **Guest order submission remains disabled** in `store/store.js` through `STORE_ORDER_ENABLED=false`. No public customer orders are being accepted through the site.

The request form has been redesigned as a two-column enquiry workspace: selected references on one side, customer details on the other. It is localized in FR / EN / AR / PT. The form remains disabled until the end-to-end intake and privacy checks are complete.

## Data flow

```
Public BA Labs storefront
        |
        v
Supabase Edge Function: create-store-order
        |
        v
Supabase: store_orders + store_order_items
        |
        v
Notion: 🛒 DEMANDES COMMERCIALES
```

- **Supabase is the transactional source of truth** for guest enquiries and their item snapshots.
- **Notion is the commercial follow-up workspace** populated after the Supabase write succeeds.
- A Notion API outage does not discard the enquiry: the Supabase record remains stored with `notion_sync_status='pending'`.
- The storefront sync uses a dedicated server-side `NOTION_STORE_API_KEY`, separate from CultureOps. Its Notion integration must be shared only with the commercial orders data source, never with CultureOps databases.
- The legacy direct-to-Notion endpoints `store-notion-order` and `notion-store-order` have been retired. Both now return HTTP 410 and require an authenticated JWT at the gateway. Only `create-store-order` remains the supported intake endpoint.
- The new endpoint is deployed in Supabase. The public form remains disabled, so normal storefront visitors cannot submit customer data.

## Supabase schema

Migrations:
- `supabase/migrations/20261119223731_store_orders_v1.sql`
- `supabase/migrations/20261119224223_store_checkout_rate_limits_v1.sql`

It creates:

- `store_orders`: customer enquiry, request reference, workflow status, estimated total and Notion sync state.
- `store_order_items`: immutable product-title, code, family, quantity and price snapshots.
- `create_store_order(...)`: atomic insert RPC with request-id idempotency.
- `store_checkout_rate_limits` and `consume_store_rate_limit(...)`: persistent per-client request throttling using HMAC fingerprints, without storing raw IP addresses.

Both tables have RLS enabled. Direct table access is revoked from `anon` and `authenticated`; the service role is the only intended database writer. The RPC is executable only by `service_role`. CultureOps `orders` and `order_items` are untouched.

The migration has been applied to Supabase project `axcouwiodqsauwnsiotn`. A transaction-level smoke test inserted a synthetic request and then rolled back; no test row was retained.

## Public catalogue API

Source: `supabase/functions/store-catalogue/index.ts`

- Deployed as a read-only public GET endpoint with an exact storefront-origin allowlist.
- Reads only the dedicated Notion data source `CATALOGUE PUBLIC — Ressources publiables`.
- Returns only rows where `Actif au catalogue` is checked.
- Exposes an explicit field allowlist: public reference, short code, product title, family, availability, formats, applications, public summary, target use, evidence level and request URL.
- Never queries or returns customer records, order records, internal notes, Notion page IDs or workspace metadata.
- Uses a separate read-only Notion integration secret, `NOTION_CATALOGUE_API_KEY`, which must have access only to the public catalogue data source.
- The frontend flag `STORE_REMOTE_CATALOGUE_ENABLED=false` remains off until this secret is configured and public catalogue codes are reconciled with the server-side order allowlist.

## Edge Function

Source: `supabase/functions/create-store-order/index.ts`

- Validates the exact GitHub Pages origin, request size, customer fields, locale, product codes and quantities.
- Rebuilds item titles and price snapshots from a server-side allowlist; browser prices are never trusted.
- Returns only the public order reference and synchronization state. It never returns customer names, email addresses, phone numbers or message contents to the browser.
- Does not log customer payloads or contact fields.
- The browser persists only the product selection and language preference; customer form values are not written to local storage.
- Catalogue strings are HTML-escaped before DOM rendering to reduce stored/reflected XSS risk.
- The storefront applies a restrictive Content Security Policy: scripts and styles load only from the site origin, network calls are limited to the site and its Supabase project, and object embedding is disabled.
- Writes the request and all items atomically to Supabase before attempting Notion.
- Uses a server-side Supabase secret/service-role key and the dedicated `NOTION_STORE_API_KEY`; neither credential is present in browser code.
- Uses a request UUID to make retries idempotent.
- Applies a persistent limit of five requests per ten minutes using an HMAC-SHA-256 fingerprint of the gateway-provided client IP. The raw IP is not stored.
- Does not process payment or confirm stock, delivery fees, or lead times.

The function is deployed as `create-store-order` with JWT verification disabled for guest requests; it performs its own origin, payload, idempotency and persistent rate-limit checks. The deployed function was exercised through the Supabase HTTP extension with a synthetic internal request. Supabase returned HTTP 201 and Notion confirmed the matching page. That test record was then marked cancelled in both systems. Before future deployments, confirm that the Edge Function environment contains either `SUPABASE_SECRET_KEYS` (with the `default` key) or `SUPABASE_SERVICE_ROLE_KEY`, plus `NOTION_STORE_API_KEY` (a separate Notion integration token with access limited to the commercial orders data source) and `NOTION_CATALOGUE_API_KEY` (a different read-only integration token with access limited to the public catalogue data source). The previous shared `NOTION_API_KEY` is deliberately no longer accepted by either storefront function.

## Catalogue

- The static storefront currently contains 15 references.
- `STORE_REMOTE_CATALOGUE_ENABLED=false`; the remote catalogue endpoint is not part of this release.
- Product presence in the catalogue does not mean current availability. BA Labs confirms availability, format, final price and delivery conditions after receiving an enquiry.
- Prices that are still indicative are not treated as confirmed totals.

## Before enabling customer submissions

1. Test the failure path by making Notion temporarily unavailable and confirming the Supabase request remains intact with `notion_sync_status='pending'`.
2. Implement and test a reliable retry mechanism for pending Notion syncs.
3. Complete the privacy notice, legal identity, data-retention and cross-border processing review.
4. Only then set `STORE_ORDER_ENABLED=true` and publish the storefront.

## CultureOps boundary

CultureOps, its tenant-scoped tables, authentication, culture synchronization and Product Passport remain separate. Do not reuse or modify those systems as part of the public storefront order flow.
