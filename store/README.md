# BA Labs Store

The store is a separate, static customer-facing application published under `/store/` on GitHub Pages. It is not part of CultureOps and does not reuse Product Passport as its checkout database.

## Current release boundary

This branch contains the storefront, legal-page drafts, versioned commerce schema, and Edge Function source. **The production migration and Edge Functions have not been applied or deployed.** The public page therefore remains a catalogue/request preview; do not represent it as an active checkout.

## Data ownership

- **Notion:** editorial source for product descriptions, scientific copy, and language content.
- **Supabase:** transactional source of truth for published store catalogue records, variants, guest orders, price snapshots, and order events.
- **GitHub Pages:** static storefront delivery only. The browser integration for the read-only `store-catalogue` GET is staged behind `STORE_REMOTE_CATALOGUE_ENABLED=false`. Keep it disabled until cross-border processing, provider disclosures, and the privacy notice are approved; the reviewed static catalogue remains the only active source.
- **CultureOps:** remains separate; its tenant-scoped `orders` and `order_items` are not reused.
- **Product Passport:** separate post-purchase traceability surface, linked to a product/lot only when a real lot exists.

## Supabase schema

The migration `supabase/migrations/20261119010000_ba_labs_store_commerce_v1.sql` creates:

- `store_products`: 12 existing published catalogue references, localized in FR / EN / AR / PT.
- `store_variants`: pack formats, availability, confirmed DZD price or quote-only mode. No speculative prices, stock, pack sizes, or lead times are seeded.
- `store_orders`: guest contact and delivery data, legal-document version acknowledgements, manual-payment state, hashed tracking and idempotency tokens.
- `store_order_items`: immutable snapshots of product, variant, quantity and confirmed price.
- `store_order_events`: append-only order-state audit trail.
- `store_checkout_rate_limits`: HMAC-fingerprinted request windows; raw client IPs are not stored.

All store tables enable RLS. `anon` and `authenticated` have no direct table privileges. The Edge Functions are the only intended public interface. The existing CultureOps order tables are unchanged.

## Edge Functions

| Function | Intended access | Responsibility |
|---|---|---|
| `store-catalogue` | Public GET; `verify_jwt=false` | Return only published product fields and public variant data. Never expose stock quantities or customer data. |
| `create-store-order` | Guest POST; `verify_jwt=false` | Validate guest input, enforce origin and body limits, apply HMAC rate limiting, hash tracking/idempotency tokens, and call the atomic database RPC. |
| `track-store-order` | Guest POST; `verify_jwt=false` | Validate order code + bearer token, rate-limit lookups, and return order state only (no contact/address data). |

The guest order RPC recalculates prices from database variants and rejects quantities above tracked available stock. Browser-supplied prices, discounts, and totals are ignored. A quote-only item keeps its price and total null until BA Labs confirms the quote. The initial payment state is unpaid and the payment method is to be agreed; no payment gateway is integrated.

### Required server-side secrets before deployment

- `STORE_RATE_LIMIT_HMAC_SECRET`: high-entropy secret used to HMAC the trusted client-IP fingerprint. Never commit it.
- `STORE_TERMS_VERSION`: exact version identifier of the final sales terms shown at checkout.
- `STORE_PRIVACY_NOTICE_VERSION`: exact version identifier of the privacy notice shown at checkout.
- `SUPABASE_SECRET_KEYS` (preferred) or the legacy `SUPABASE_SERVICE_ROLE_KEY`: backend-only key. Never expose it in GitHub Pages or browser code.
- Supabase supplies `SUPABASE_URL` to Edge Functions.

If any required secret is missing, guest-order intake fails closed. The current Edge Function CORS allowlist is the GitHub Pages origin; it must be reviewed if the lawful public domain changes.

## Release sequence

1. Resolve the Algerian e-commerce hosting/domain requirements and the final legal identity fields.
2. Confirm product variants, packaging, DZD prices, stock rules, and shipping fees.
3. Review and merge the migration and Edge Function source.
4. Apply the additive schema migration to Supabase.
5. Configure server secrets and deploy `store-catalogue` and `create-store-order` with JWT verification disabled only because each function enforces its own public-access contract.
6. Connect the storefront to the public catalogue endpoint and guest-order endpoint; keep the static catalogue as a controlled fallback.
7. Run end-to-end tests before enabling customer order submission.

## Verification

- `supabase/tests/store-commerce-security.test.sql` covers table grants, RLS, immutable snapshots/events, security-definer RPC grants, fixed-price calculation, quote-only pricing, idempotency, and rate limiting.
- `supabase/tests/store-catalogue-contract.test.mjs` checks the public catalogue data boundary.
- `supabase/tests/store-guest-order-contract.test.mjs` checks guest request validation, rate limiting, token hashing, and PII minimization.
- `scripts/test-storefront.mjs` checks the static storefront and GitHub Pages publication structure.
