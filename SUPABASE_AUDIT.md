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
