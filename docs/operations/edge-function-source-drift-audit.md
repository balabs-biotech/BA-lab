# Production Edge Function source-drift audit

Capture date: 2026-11-01  
Project: `axcouwiodqsauwnsiotn`  
Scope: read-only comparison of the deployed Edge Function source with the maintained `main` source tree.

## Summary at original capture

All 9 deployed function bundles were captured in `supabase/deployed-functions-snapshot/` and checked against their manifest Git blob hashes. At that capture point, the comparison found:

- 3 deployed functions with no corresponding directory in `main`.
- 4 functions whose maintained source differed from the deployed source.
- 2 functions whose source matched exactly at capture time.

This is source drift, not evidence that a deployment should happen immediately. The deployed snapshot preserves a point-in-time live state; it is not automatically the current deployment state.

## Follow-up live verification — 2026-11-01

A subsequent read-only Supabase check retrieved the current deployed function inventory and source for the two authorization discrepancies below.

| Function | Current deployed version | `verify_jwt` | Current source compared with maintained source |
|---|---:|---:|---|
| `sync-culture-to-notion` | 14 | true | Matches; writer-role gate is deployed |
| `nasa-power-agroclimate` | 7 | true | Matches; writer-role gate is deployed |

Both live sources contain the explicit organization-membership check for `owner`, `admin`, or `member`, returning HTTP 403 for viewers and unknown roles before privileged service-role operations. The old deployed versions 13 and 6 in the immutable capture predate these deployments. **The two writer-role findings below are resolved in the currently deployed versions.**

This follow-up was read-only. No function was deployed or modified during the check.

## Functions absent from main at original capture

| Function | Deployed version | `verify_jwt` |
|---|---:|---|
| `claim-ba-labs` | 9 | true |
| `sentinel-2-ndvi-preview` | 1 | true |
| `earth-search-sentinel2-catalogue` | 1 | true |

The first and third have since been restored to the maintained source tree. `sentinel-2-ndvi-preview` remains snapshot-only. Do not infer that an absent source directory means a function is unused.

## Remaining tracked source differences from the original capture

### 1. `earth-search-sentinel2-ndvi-preview` — deployed version 5

The maintained source adds bounded JSON parsing:
- request body limit: 32 KiB;
- STAC response limit: 2 MiB;
- streaming read with early cancellation when the limit is exceeded.

The deployed snapshot uses direct `req.json()` and `searchResponse.json()` parsing in the corresponding paths. This is a resource-exhaustion / input-size hardening gap, not evidence of a confirmed exploit.

### 2. `copernicus-sentinel-catalogue` — deployed version 8

The deployed source has a broader CORS allow-headers list and adds `Vary: Access-Control-Request-Headers`. The maintained source has a narrower allow-headers list. This may be an intentional simplification or a browser compatibility regression; compare actual frontend request headers before choosing the canonical version.

## Exact matches at original capture time

- `iot-ingest` — version 2; custom device-token validation; `verify_jwt=false`.
- `nasa-power-scheduled-import` — version 4; Vault-backed cron-secret validation; `verify_jwt=false`.

Their JWT-disabled settings are intentional only while the corresponding in-handler authentication remains intact. The snapshot contract test asserts the critical checks remain present.

## Recommended reconciliation order

1. Review the NDVI request/response bounds and prepare resource-limit tests.
2. Resolve the Copernicus CORS behavior with browser request evidence.
3. Keep the three formerly missing function sources and their runtime dependencies documented.
4. Refresh the point-in-time deployed-function snapshot whenever another controlled capture is performed.
5. Require per-function tests, rollback source, and explicit approval before any production deployment.

## Production safety

The original capture and follow-up verification were read-only. No Edge Function was deployed, disabled, or changed during these audits. Do not deploy all maintained versions as a batch: each remaining discrepancy needs its own review and regression validation.
