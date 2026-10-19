# Supabase Integration Audit — BA-Labs Batch Tracker

**Date** : 2026-10-19  
**Scope** : Notion sync, data consistency, security posture  
**Status** : FINDINGS — Implementation decisions deferred to owner

---

## 1. Notion Sync Idempotence Risk

### Finding
The `syncPendingCultures()` frontend function (batch-tracker/index.html:2262) fetches cultures where:
```javascript
.eq("notion_sync_status", "pending")
.is("notion_page_id", null)
```

If the Edge Function `sync-culture-to-notion` partially fails or if `notion_page_id` is not atomically updated in Supabase, **the same culture can be synced multiple times**, creating duplicate pages in Notion.

### Scenario
1. Frontend calls Edge Function with `culture_id = 42`
2. Edge Function creates Notion page successfully
3. Network timeout before `notion_page_id` update → DB still shows `null`
4. Next call to `syncPendingCultures()` finds culture 42 again → duplicate sync

### Root Cause
- **Frontend**: No retry logic or confirmation loop
- **Edge Function**: Logic assumed to be atomic (not verified in repo)
- **Database**: No application-level trigger to prevent double-updates

### Mitigation Options (owner decision)

**Option A: Database-side** (recommended)
- Add RLS policy or database trigger: `notion_page_id` can only be updated from `null` → non-null once
- Prevents physical duplicates regardless of Edge Function retries

**Option B: Edge Function** (requires Supabase review)
- Wrap schema update in transaction with Notion page creation
- Return updated `notion_page_id` to confirm client-side

**Option C: Frontend** (weakest)
- Track `notion_page_id` locally before retry
- Implement exponential backoff with max attempts

### Severity
🟡 **Medium** — Causes Notion duplicates, not data loss; discoverable via manual audit

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
| **supabase-js pin version** | DevOps | MEDIUM | ⏳ Implement |
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
