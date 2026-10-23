# Supabase Integration Audit — BA-Labs Batch Tracker

**Updated**: 2026-10-22  
**Scope**: Notion sync idempotence and data consistency  
**Status**: Partial mitigation confirmed in versioned source; concurrent race remains.

---

## 1. Notion Sync Idempotence — Updated Finding

**Status: Partially mitigated; concurrent duplicate creation remains possible.**

The current versioned Edge Function (`supabase/functions/sync-culture-to-notion/index.ts`) now reconciles sequential retries before creating a page:

1. It trusts a stored `notion_page_id` only when the page belongs to the configured Notion database and its `Supabase Culture ID` matches the requested culture.
2. Otherwise, it queries the database by `Supabase Culture ID`.
3. One matching page is updated; multiple matches cause the function to stop for manual resolution; lookup errors fail closed rather than creating a page.
4. If a page is created but its ID cannot be persisted in Supabase, the next retry should find that page through the reconciliation query.

This addresses the earlier documented **sequential partial-failure scenario**. The previous description that every retry could create a duplicate is stale and has been replaced.

### Residual race condition

Notion creation and the Supabase write cannot be committed in one transaction. Two concurrent requests for the same culture can both query before either page exists, both see no match, and both create a page. The frontend's `syncInProgress` flag only coordinates calls within one page instance; it is not a cross-tab or server-side lock.

### Recommended next step

Before claiming full idempotence, implement and test a cross-request claim/lock or another server-side idempotency mechanism, then test simultaneous requests and partial failures against a non-production Notion database. No production schema or data was changed by this documentation audit.

---

## 2. batch-tracker Licence Status

### Finding
`batch-tracker/index.html` uses 25+ open-source packages via `supabase-js@^2`:
- supabase-js (Apache-2.0)
- @types/* (MIT)
- TypeScript (Apache-2.0)
- etc.

The root-level `LICENSE` declares the rest proprietary, but `batch-tracker/` licence is **undefined** in `package.json`.

### Risk
- Ambiguous whether batch-tracker UI is proprietary or open-source
- If shared/published, license compliance becomes unclear
- Dependency licenses must be listed if open-source

### Required Action (owner)
```json
{
  "license": "PROPRIETARY" | "MIT" | "Apache-2.0" | "...",
  "description": "Batch tracking UI for B.A. LAB cultures",
  "private": true | false
}
```

### Recommendation
If proprietary (B.A. LAB internal use only):
```javascript
// batch-tracker/package.json
{
  "license": "PROPRIETARY",
  "private": true,
  "dependencies": { "supabase-js": "2.118.0" }
}
```

Then add to `.gitignore` or CI:
```bash
# Check that proprietary UI is not in public builds
test ! -f dist/batch-tracker/index.html || echo "ERROR: proprietary UI in dist"
```

---

## 3. supabase-js Version Pinning

### Status: ✅ RESOLVED (2026-10-19)
Pinned to `2.118.0` in `batch-tracker/index.html` (Option A below). SRI (Option C) is not yet
applied — remains a lower-priority hardening step if the owner wants it.

### Finding
`batch-tracker/index.html` loads from CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

**Unpinned** `@2` means latest 2.x (currently 2.118.0) is fetched at runtime.

### Risk
- **Silent breaking changes** if 2.x deprecates APIs
- **No reproducibility** between dev and production
- **Security**: Update patches can't be validated before deployment

### Mitigation

**Option A: Pin in HTML** (simplest)
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0"></script>
```

**Option B: Use package.json + build** (best practice)
```json
{
  "dependencies": {
    "@supabase/supabase-js": "2.118.0"
  }
}
```
Then bundle with esbuild/vite.

**Option C: SRI (Subresource Integrity)**
```html
<script 
  src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0"
  integrity="sha384-... (hash)"
  crossorigin="anonymous">
</script>
```

### Recommendation
Pin to 2.118.0 (tested version) in batch-tracker README with SRI.

---

## 4. Architecture Separation — Actual vs Declared

### Current (GitHub)
```
├── firmware/             → Arduino/ESP32 code (MIT)
├── hardware/             → Design specs (CERN-OHL-P v2.0)
├── biotech-sops/         → Protocols (proprietary)
├── batch-tracker/        → Frontend (licence undefined)
└── docs/                 → Documentation (proprietary)
```

### Supabase (not in repo)
```
├── Schema               → cultures, batches, qc, strains, ...
├── RLS Policies         → Row-level security rules
├── Edge Functions       → claim-ba-labs, sync-culture-to-notion
├── API Keys             → Publishable (frontend), Secret (backend)
└── Secrets              → Notion token, service_role key
```

### Data Flow Risk
```
Frontend (batch-tracker)
  ├─ POST /cultures  → Supabase cultures table
  │  └─ Notion Edge Function (sync-culture-to-notion)
  │     └─ Notion API (async)
  └─ GET /cultures   → Display pending sync status
```

**Current gap**: If Notion sync fails, culture stays in DB with `notion_sync_status = "pending"` forever. Frontend shows warning, but no auto-retry strategy defined.

### Recommendation
Document retry policy in `batch-tracker/supabase/README.md`:
```markdown
## Sync Failure Recovery

- **User action**: Click "Retry" button (manual)
- **Automatic**: Every app reload (syncPendingCultures on init)
- **Max attempts**: 20 cultures per session (limit in code)
- **Stale**: Cultures pending > 24h → manual intervention flag

**To fix stale sync**:
1. Fix Notion token in Supabase secrets
2. Reload batch-tracker
3. Monitor sync in browser console

**To investigate duplicates**:
- Check Notion workspace for culture pages with same code
- Query Supabase: `SELECT * FROM cultures WHERE notion_page_id IS NULL ORDER BY created_at DESC`
```

---

## 5. Security Posture — Secrets & Access

### Verified ✅
- Publishable API key visible in frontend (expected)
- Service role key NOT in repo ✓
- Notion token NOT in repo ✓
- `.gitignore` covers `.env*` files ✓

### Assumptions (not verified in repo)
- Supabase Edge Function secrets are scoped to function only
- RLS policies enforce organization-level isolation
- Notion token has minimal scopes (read/write cultures only)

### Recommended Checks (owner)
1. **RLS Policies** : Verify `organization_id` filtering on all tables
2. **Edge Function Secrets** : Confirm Notion token is not over-privileged
3. **API Rate Limits** : Set per-user or per-IP limits on `sync-culture-to-notion`

---

## 6. Action Items

| Item | Owner | Priority | Status |
|---|---|---|---|
| **Notion sync atomicity** | Owner/DevOps | HIGH | 📋 To decide (A/B/C) |
| **batch-tracker licence** | Owner | HIGH | 📋 To define |
| **supabase-js pin version** | DevOps | MEDIUM | ✅ Done (2.118.0) |
| **Sync retry policy doc** | Owner | MEDIUM | 📋 To write |
| **RLS audit** | Security | MEDIUM | 📋 To verify |

---

## 7. Known Constraints

- **No migrations in repo** : Schema managed in Supabase UI (by design)
- **Edge Functions not versioned** : Deployed in Supabase, not in GitHub CI
- **Notion token in secrets** : Belongs in Supabase environment, not code
- **No database backups doc** : Supabase handles, but restore procedure should be SOPed

---

## Conclusion

The current Supabase integration is **functional** but has **idempotence and retry gaps**. The main risk is duplicate Notion pages if Edge Functions fail mid-way. This is **discoverable but not prevented** at the database level.

**Recommendation** : Implement Option A (RLS/trigger) before scaling batch-tracker to concurrent users. For now, manual deduplication is acceptable if sync failures are rare (< 1% of batches).

---

**Author** : Claude (Audit Phase 4)  
**Review Date** : 2026-10-19  
**Next Review** : After Edge Function retry logic implementation


---

## Update — 2026-10-23 (production verification)

This update supersedes older status statements above where they conflict with the live deployment. Earlier sections are retained as historical audit notes.

- The deployed `sync-culture-to-notion` Edge Function is **active, version 13**, with JWT verification enabled. Its current source uses `acquire_culture_notion_sync_lock` and `release_culture_notion_sync_lock` with a 180-second lease, checks the caller's RLS-scoped access to the culture before using the service role, and reconciles Notion pages by `Supabase Culture ID` before creating.
- The production migration ledger includes `20261020090000_protect_cultures_notion_columns_v1`; the old instruction that it still needs to be applied manually is stale.
- Current Security Advisor findings: two IoT tables have RLS enabled without policies; four authenticated-callable `SECURITY DEFINER` batch RPCs are flagged; leaked-password protection is disabled. The IoT tables were previously verified to have no direct grants to `anon` or `authenticated`, so do not add permissive policies merely to silence the informational warning.
- The four RPC definitions inspected on 2026-10-23 include organization-membership checks and validate referenced records against the same organization. Their authenticated execution should be retained only with regression tests for cross-organization denial and least-privilege grants.
- The CI workflow now declares top-level `permissions: contents: read`. A new CI run was queued for the resulting `main` commit; success must be verified from the run results rather than inferred from the commit.
- Branch-protection status could not be verified through the connected GitHub integration (API returned 403). Do not report branch protection as enabled until it is checked in repository settings by an administrator.

### Remaining actions

1. Enable leaked/compromised-password protection in Supabase Auth settings.
2. Verify branch protection/rulesets in GitHub settings and require CI checks before merge.
3. Keep automated cross-organization tests for every exposed tenant-scoped RPC.
4. Test simultaneous sync attempts and lease expiry; current sync tests are mocked and do not prove live Notion/Supabase integration behavior.


## Update — 2026-10-23 (CI and regression tests)

- CI run [39977641549](https://github.com/balabs-biotech/BA-lab/actions/runs/39977641549) completed successfully on commit `79702b26ad8489f52334d6a20b814e4ee6bfe7f8`. All seven jobs passed, including PostgreSQL migration tests, migration replay, the mocked `sync-culture-to-notion` test suite, secret scanning, repository checks, and firmware build/logic tests.
- Added a mocked regression test confirming that a Notion query failure returns an error, persists the sync error status, and still releases the per-culture lock. This verifies the function's `finally` path under the test harness; it is not a live-service integration test.
- Tenant-isolation coverage now explicitly checks the exposed batch workflow RPCs for cross-organization denial: stage advancement, batch creation, movement, and release. These tests run against disposable CI PostgreSQL fixtures; production behavior still depends on the deployed schema matching the versioned migrations.
- GitHub Pages deployment for the same commit completed successfully: [run 39977640375](https://github.com/balabs-biotech/BA-lab/actions/runs/39977640375).

### Still open
- Enable leaked/compromised-password protection in Supabase Auth settings.
- Confirm branch protection/rulesets in GitHub settings; the connected GitHub API returned 403, so this remains unverified.
- Add tests for concurrent sync attempts and lock-lease expiry, and perform a controlled end-to-end check with real Supabase/Notion services.


## Update — 2026-10-23 (agroclimate pipeline parity)

- Live database inspection found 575 `environmental_observations` rows from `NASA_POWER / POWER_DAILY_AGRO` across five locations; all are weather records and there are currently zero satellite records. Latest retrieval: 2026-10-23 04:30 UTC; observed data currently extends through 2026-10-19.
- Confirmed the production `nasa-power-scheduled-import` Edge Function is active at version 2 and its deployed `index.ts` exactly matches the source now committed under `supabase/functions/nasa-power-scheduled-import/index.ts`.
- Confirmed the production cron is active daily at 04:30 UTC. The cron secret remains in Supabase Vault, not in Git.
- Added `supabase/migrations/20261023020000_version_nasa_power_cron_secret_verifier.sql` and applied its SQL to production. The verifier is `SECURITY DEFINER` with an empty search path; its routine grants were checked after application and expose `EXECUTE` only to `service_role` among application roles.
- Added the NASA POWER scheduled importer to source control and documented current provider limitations and a staged Copernicus Sentinel-2 integration plan in `docs/architecture/iot-et-donnees-publiques.md`.
- Satellite ingestion remains unimplemented. The next safe step is a read-only Copernicus STAC catalogue adapter that stores scene metadata only; raster downloads and indices should follow after provenance, cloud masking, geometry and compute requirements are validated.
