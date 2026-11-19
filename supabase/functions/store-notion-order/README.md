# Storefront → Notion order intake

This Edge Function creates one page per guest request in the existing **🛒 DEMANDES COMMERCIALES** Notion data source.

## Required one-time setup

1. In Notion, open **🛒 DEMANDES COMMERCIALES**.
2. Open the database menu → Connections → connect the same internal integration used by the existing `sync-culture-to-notion` Edge Function. The integration must be allowed to create pages in this data source.
3. In Supabase project `axcouwiodqsauwnsiotn`, verify the Edge Function secret `NOTION_API_KEY` exists and belongs to that integration. Do not put this token in GitHub, the storefront JavaScript, or a public environment variable.
4. Deploy this function with JWT verification disabled because it is a guest endpoint; the function enforces an exact site-origin allowlist, validates the payload and product codes, rejects oversized bodies, and uses only the server-side Notion token.
5. Only after deployment and a successful test request, set `STORE_ORDER_ENABLED=true` in `store/store.js` and publish the storefront.

## Data mapping

- Parent: Notion data source `7a40b95b-e353-4eb9-a471-99c97c5904f5`
- New status: `🆕 Nouvelle`
- Customer identity: Nom, Téléphone, Email, Organisation, Wilaya
- Request: Produit, Format, Quantité, Message, Mode de livraison
- Estimate: only calculated when every selected item has a confirmed unit price; the proposed syringe price is not treated as confirmed.

## Important

The storefront feature flag remains disabled until the Notion integration has access and the Edge Function is deployed. The browser receives only the Supabase publishable key; the Notion credential remains server-side. The form is not a payment checkout and creates a commercial request, not a confirmed sale.
