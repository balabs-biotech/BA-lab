# Supabase Edge Functions — deployment inventory

Snapshot of the active `BALabs` project captured on 15 November 2026. Each `index.ts` is a source snapshot retrieved from the deployed project and reconciled into Git.

| Function | Remote version | Gateway JWT | Source path |
|---|---:|---|---|
| claim-ba-labs | 9 | required | `claim-ba-labs/index.ts` |
| sync-culture-to-notion | 14 | required | `sync-culture-to-notion/index.ts` |
| iot-ingest | 2 | disabled; device-token validation is handled by the function | `iot-ingest/index.ts` |
| nasa-power-agroclimate | 8 | required | `nasa-power-agroclimate/index.ts` |
| nasa-power-scheduled-import | 4 | disabled; scheduled caller authentication is handled by the function | `nasa-power-scheduled-import/index.ts` |
| copernicus-sentinel-catalogue | 8 | required | `copernicus-sentinel-catalogue/index.ts` |
| sentinel-2-ndvi-preview | 1 | required | `sentinel-2-ndvi-preview/index.ts` |
| earth-search-sentinel2-catalogue | 1 | required | `earth-search-sentinel2-catalogue/index.ts` |
| earth-search-sentinel2-ndvi-preview | 6 | required | `earth-search-sentinel2-ndvi-preview/index.ts` |
| engine-worker | 61 | disabled; internal worker secret validation is handled by the function | `engine-worker/index.ts` |

## Reconciliation results

- Nine deployed functions were fetched from the active Supabase project.
- Four existing source files already matched the deployed content exactly.
- Three existing files were stale and have been replaced by the exact deployed snapshots.
- Two deployed functions had no source file in Git and have now been added.
- The engine worker v61 snapshot was separately retrieved and verified identical.
- Runtime credentials are referenced through Supabase secrets/environment variables; no secret values are intentionally stored here.

## Security and deployment constraints

- Gateway `verify_jwt=false` is not equivalent to public access. For `iot-ingest`, `nasa-power-scheduled-import` and `engine-worker`, the handler must enforce its own device, scheduler or worker authentication.
- Do not change these settings without reviewing the function's internal authentication and caller.
- Re-fetch the remote function and compare the source before every deployment.
- The migration history and `supabase/config.toml` have not yet been reconstructed or synchronized. This directory is a source snapshot, not yet a complete reproducible Supabase project.
