# Edge Function source reconciliation

This directory records which captured production functions have been restored to the maintained deployment source tree and which remain intentionally snapshot-only.

## Restored to maintained source

- `claim-ba-labs`: restored byte-for-byte from the 2026-11-01 deployed snapshot. The frontend calls this bootstrap function during initial workspace setup. Keep its authenticated-user verification and tightly scoped BA-LABS bootstrap restriction intact; add regression coverage before changing its authorization model.
- `earth-search-sentinel2-catalogue`: restored from the 2026-11-01 deployed snapshot. The Green Tech environmental-data workflow invokes this public Earth Search catalogue endpoint. The maintained copy now adds a 32 KiB request-body limit and a 2 MiB STAC response limit; the original remains preserved unchanged in the deployed snapshot.

These restorations preserve the known deployed baseline. They are not new production deployments and do not imply that the captured versions are the final desired implementation.

## Snapshot-only / dormant function

- `sentinel-2-ndvi-preview`: retained only under `supabase/deployed-functions-snapshot/`. The current frontend explicitly avoids invoking this Copernicus/Sentinel Hub endpoint because its required credentials are not configured; it uses the public Earth Search NDVI renderer instead. Do not reintroduce it as a fallback or deploy it until credential availability, provider terms/costs, and an explicit product decision are verified.

## Still to reconcile

- `sync-culture-to-notion`: deployed version lacks the maintained source's explicit writer-role check before the privileged Notion sync.
- `nasa-power-agroclimate`: deployed version lacks the maintained source's explicit writer-role check before privileged observation persistence.
- `earth-search-sentinel2-ndvi-preview`: deployed version lacks the maintained source's bounded request and STAC-response parsing.
- `copernicus-sentinel-catalogue`: CORS header differences need browser-request evidence before selecting canonical behavior.

No production function was deployed or changed during this reconciliation. The new payload limits exist only in the maintained repository source until separately reviewed and deployed.
