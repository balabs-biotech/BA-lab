# BA Labs Store

The store is a separate, static customer-facing application published under `/store/` on GitHub Pages. It is not part of CultureOps and does not reuse CultureOps' tenant-scoped order tables.

## Current release boundary

The storefront is a catalogue and request-preparation interface. **Guest order submission remains disabled at both the browser and server layers**: `store/store.js` uses `STORE_ORDER_ENABLED=false`, and the Edge Function rejects every request unless both server-side `STORE_ORDER_ENABLED=true` and `TURNSTILE_ENABLED=true` are explicitly configured. A valid Turnstile token is verified server-side before any customer record is written. The server flag is absent by default and must not be enabled until the launch gates below are complete. No public customer orders are being accepted through the site.

The request form has been redesigned as a two-column enquiry workspace: selected references on one side, customer details on the other. It is localized in FR / EN / AR / PT. The form remains disabled until the end-to-end intake and privacy checks are complete.

## Verified operational state — 20 November 2026

- Public order submission is disabled in both the browser and the deployed Edge Function. Do not enable either switch yet.
- The remote public catalogue is disabled. Its dedicated read-only Notion credential is not provisioned.
- The private Notion order-sync worker and five-minute cron schedule are deployed, but the worker cannot run until its dedicated Notion credential and Vault-held service-role JWT are provisioned.
- Turnstile verification code is deployed, but the public site key and private secret are not provisioned; the browser challenge has only been exercised with a mocked test widget.
- Legal identity, privacy, retention, shipping and cross-border-processing details remain draft items requiring verified company information and review.
- Database access controls have been rechecked: RLS is enabled on the order and rate-limit tables; `anon` and `authenticated` have no direct order-table read/insert privileges and cannot execute the sensitive order/sync/rate-limit RPCs. The service role retains the required execution privileges.

This is a readiness snapshot, not authorization to launch. Recheck deployed flags, secrets and database grants immediately before any production activation.

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
Private locked worker: store-order-sync
        |
        v
Notion: 🛒 DEMANDES COMMERCIALES
```

- **Supabase is the transactional source of truth** for guest enquiries and their item snapshots.
- **Notion is the commercial follow-up workspace** populated after the Supabase write succeeds.
- The public intake endpoint never reads customer rows back and never calls the Notion API. It returns HTTP 202 after durable Supabase persistence; only the service-role worker can claim an order and create or reconcile its Notion page.
- Rate limiting uses an HMAC fingerprint of the Cloudflare `CF-Connecting-IP` header only. It does not store raw IP addresses or trust `X-Forwarded-For` / `X-Real-IP` fallbacks.
- A Notion API outage does not discard the enquiry: the Supabase record remains stored with `notion_sync_status='pending'`. The private `store-order-sync` worker retries pending records with an atomic claim, an eight-attempt ceiling and bounded exponential backoff.
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
- `claim_store_order_sync(...)`, `complete_store_order_sync(...)` and `fail_store_order_sync(...)`: service-role-only RPCs for atomic worker claims, lock ownership and retry state.

Both tables have RLS enabled. Direct table access is revoked from `anon` and `authenticated`; the service role is the only intended database writer. The RPC is executable only by `service_role`. CultureOps `orders` and `order_items` are untouched.

The migration has been applied to Supabase project `axcouwiodqsauwnsiotn`. A transaction-level smoke test inserted a synthetic request and then rolled back; no test row was retained.

## Public catalogue API

Source: `supabase/functions/store-catalogue/index.ts`

- Deployed as a read-only public GET endpoint with an exact storefront-origin allowlist.
- Reads only the dedicated Notion data source `CATALOGUE PUBLIC — Ressources publiables`.
- Returns only rows where `Actif au catalogue` is checked.
- Exposes an explicit field allowlist: public reference, short code, product title, family, availability, formats, applications and evidence level.
- Never queries or returns customer records, order records, internal notes, Notion page IDs or workspace metadata.
- Uses a separate read-only Notion integration secret, `NOTION_CATALOGUE_API_KEY`, which must have access only to the public catalogue data source.
- The frontend flag `STORE_REMOTE_CATALOGUE_ENABLED=false` remains off until this secret is configured and public catalogue codes are reconciled with the server-side order allowlist.
- When enabled after review, the remote loader updates availability only for product codes already present in the static multilingual catalogue. It never inserts remote products or replaces localized titles, descriptions or prices. Unknown availability values are ignored, and cart entries are removed if a reference becomes unavailable.

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
- Includes a Cloudflare Turnstile browser integration scaffold. The widget loads only when both `STORE_ORDER_ENABLED` and a non-empty public `TURNSTILE_SITE_KEY` are set; its token is sent with the request, and the submit control remains locked until verification succeeds. The Content Security Policy allows only the required Cloudflare challenge origin. The site key is intentionally blank and guest submissions remain disabled. The server-side verifier is deployed behind `TURNSTILE_ENABLED=true`; it validates the exact hostname (`balabs-biotech.github.io`) and action (`store_order`) and fails closed on invalid tokens or verification outages.
- Does not process payment or confirm stock, delivery fees, or lead times.

The function is deployed as `create-store-order` with JWT verification disabled for guest requests; it performs its own origin, payload, idempotency and persistent rate-limit checks. A historical synthetic integration smoke test previously returned HTTP 201 and confirmed a matching Notion page; its test record was subsequently marked cancelled. Treat that result only as evidence that the integration worked at that earlier point in time, not as proof that the current deployment has its credentials configured or that the worker is operational. Current readiness requires either `SUPABASE_SECRET_KEYS` (with the `default` key) or `SUPABASE_SERVICE_ROLE_KEY`, plus the dedicated `NOTION_STORE_API_KEY`. The separate read-only `NOTION_CATALOGUE_API_KEY` is required only if the remote public catalogue is intentionally enabled. The previous shared `NOTION_API_KEY` is deliberately no longer accepted by either storefront function.

## Catalogue

- The static storefront currently contains 32 reviewed references (29 active public catalogue references plus three additional commercial references retained for review).
- `STORE_REMOTE_CATALOGUE_ENABLED=false`; the remote catalogue endpoint is not part of this release.
- Product presence in the catalogue does not mean current availability. BA Labs confirms availability, format, final price and delivery conditions after receiving an enquiry.
- Prices that are still indicative are not treated as confirmed totals.

## Notion retry worker

Source: `supabase/functions/store-order-sync/index.ts`.

- Requires a valid Supabase JWT at the gateway and independently checks that its role claim is `service_role`.
- Claims at most three requests per run (`MAX_BATCH = 3`) using `FOR UPDATE SKIP LOCKED`; a five-minute lease prevents concurrent workers from processing the same row.
- Checks the exact commercial request title in Notion before creating a page, so a timeout after page creation can be safely retried without intentionally creating a duplicate.
- Uses bounded retries (maximum eight attempts) with increasing delays from one minute to 24 hours. Exhausted records move to `failed` for manual review.
- Sends only aggregate counts in its HTTP response. Customer contact fields are used only server-side and are never logged or returned.
- The function is deployed with JWT verification enabled. A five-minute `pg_cron` schedule is installed but remains dormant until the service-role JWT is stored in Supabase Vault. Before activating it, configure `NOTION_STORE_API_KEY` under Supabase Edge Function secrets, then add the legacy `service_role` JWT to Vault under the name `store_sync_service_role_jwt`. The cron job reads that secret only at execution time; no credential is stored in the repository.

## Activate the private retry schedule

1. In Supabase Dashboard → Edge Functions → Secrets, add `NOTION_STORE_API_KEY` using the dedicated Notion integration that has access only to the commercial orders data source.
2. In Supabase SQL Editor, store the legacy `service_role` JWT in Vault (never in GitHub or the browser):

   ```sql
   select vault.create_secret('PASTE_SERVICE_ROLE_JWT_HERE', 'store_sync_service_role_jwt');
   ```

3. The existing five-minute cron job will then invoke `store-order-sync`. Verify the function logs and confirm a synthetic request moves from `pending` to `synced` before considering any public intake launch.

Do not paste the JWT or Notion token into a chat, source file, SQL migration, or browser code.

## Before enabling customer submissions

1. Create a Cloudflare Turnstile widget restricted to `balabs-biotech.github.io`, place its public site key in `TURNSTILE_SITE_KEY` in `store/store.js`, and store the matching private `TURNSTILE_SECRET_KEY` only in Supabase Edge Function secrets. Enable `TURNSTILE_ENABLED=true` only after the browser challenge is tested end-to-end. Keep `STORE_ORDER_ENABLED=false` until every launch gate is cleared.
2. Test the failure path by making Notion temporarily unavailable and confirming the Supabase request remains intact with `notion_sync_status='pending'`.
3. Configure and test the scheduled `store-order-sync` worker using a service-role JWT stored in Supabase Vault; confirm retries and duplicate prevention.
4. Complete the privacy notice, legal identity, data-retention and cross-border processing review.
5. Only after all prior gates are complete, set the Edge Function's server-side `STORE_ORDER_ENABLED=true`, then enable the browser flag and publish the storefront.

## CultureOps boundary

CultureOps, its tenant-scoped tables, authentication, culture synchronization and Product Passport remain separate. Do not reuse or modify those systems as part of the public storefront order flow.


### Catalogue publication and availability

The reviewed static storefront currently contains 32 references: the 29 active public Notion catalogue records plus three additional commercial references retained for review. Each reference carries a localized availability state (`Sur demande`, `À confirmer`, or `Indisponible`). Unavailable references remain visible but cannot be added to the enquiry selection. Water Agar pricing is not published until the unit price and packaging are confirmed. The remote Notion catalogue loader remains disabled; the static multilingual catalogue is the publication layer until a dedicated integration and translation mapping are approved. Once enabled, the remote source may update only availability for matching, pre-reviewed product codes; it cannot create products or overwrite multilingual commercial content.
