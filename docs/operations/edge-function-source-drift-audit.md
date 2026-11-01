# Production Edge Function source-drift audit

Capture date: 2026-11-01  
Project: `axcouwiodqsauwnsiotn`  
Scope: read-only comparison of the deployed Edge Function source with the maintained `main` source tree.

## Summary

All 9 deployed function bundles were captured in `supabase/deployed-functions-snapshot/` and checked against their manifest Git blob hashes. The comparison found:

- 3 deployed functions with no corresponding directory in `main`.
- 4 functions whose maintained source differs from the deployed source.
- 2 functions whose source matched exactly at capture time.

This is source drift, not evidence that a deployment should happen immediately. The deployed snapshot and the maintained source have different roles: one preserves the live state; the other is the candidate future state.

## Functions absent from main

| Function | Deployed version | `verify_jwt` |
|---|---:|---|
| `claim-ba-labs` | 9 | true |
| `sentinel-2-ndvi-preview` | 1 | true |
| `earth-search-sentinel2-catalogue` | 1 | true |

Action: decide whether each function is still required. If yes, restore it to the maintained source tree with tests and documented secrets/config dependencies. If obsolete, document its retirement plan before disabling it. Do not infer that an absent source directory means a function is unused.

## Tracked source differs from production

### 1. `sync-culture-to-notion` — deployed version 13

The maintained source contains an explicit role check before using privileged service-role writes:
- resolves the caller with `userClient.auth.getUser()`;
- reads the caller's organization membership;
- allows only `owner`, `admin`, or `member`;
- returns HTTP 403 otherwise.

The deployed snapshot does not contain this check. The live function therefore does not have this specific writer-role gate at the captured version. Treat this as a high-priority authorization discrepancy and review the complete handler path before any release.

### 2. `nasa-power-agroclimate` — deployed version 6

The maintained source checks the authenticated caller's membership in the location's organization and permits only `owner`, `admin`, or `member` before persisting observations through the service role. The deployed snapshot lacks that explicit check.

This is a high-priority authorization discrepancy. Verify all read/write paths and the relationship between the requested location and organization before preparing a controlled deployment.

### 3. `earth-search-sentinel2-ndvi-preview` — deployed version 5

The maintained source adds bounded JSON parsing:
- request body limit: 32 KiB;
- STAC response limit: 2 MiB;
- streaming read with early cancellation when the limit is exceeded.

The deployed snapshot uses direct `req.json()` and `searchResponse.json()` parsing in the corresponding paths. This is a resource-exhaustion / input-size hardening gap, not evidence of a confirmed exploit.

### 4. `copernicus-sentinel-catalogue` — deployed version 8

The deployed source has a broader CORS allow-headers list and adds `Vary: Access-Control-Request-Headers`. The maintained source has a narrower allow-headers list. This may be an intentional simplification or a browser compatibility regression; compare actual frontend request headers before choosing the canonical version.

## Exact matches at capture time

- `iot-ingest` — version 2; custom device-token validation; `verify_jwt=false`.
- `nasa-power-scheduled-import` — version 4; Vault-backed cron-secret validation; `verify_jwt=false`.

Their JWT-disabled settings are intentional only while the corresponding in-handler authentication remains intact. The snapshot contract test asserts the critical checks remain present.

## Recommended reconciliation order

1. Review and prioritize the two missing writer-role gates in the deployed Notion sync and NASA agroclimate functions.
2. Review the NDVI request/response bounds and prepare resource-limit tests.
3. Resolve the Copernicus CORS behavior with browser request evidence.
4. Recover the three missing function sources and identify their runtime dependencies.
5. Build a controlled release plan with per-function tests, rollback source, and explicit approval before any production deployment.

## Production safety

This audit was read-only. No Edge Function was deployed, disabled, or changed. Do not deploy all four maintained versions as a batch: each discrepancy needs its own review and regression validation.
