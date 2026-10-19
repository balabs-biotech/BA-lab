# Batch Tracker (web interface)

Single static page ([`index.html`](index.html), HTML/CSS/JavaScript, no build step) that talks to the `BALabs` Supabase project through `@supabase/supabase-js`. Backend details: [`supabase/README.md`](supabase/README.md).

The repository root `index.html` only redirects here.

## Known issues and risk mitigation

### Notion sync — Idempotence and duplicates
**Status** : 🟡 Medium priority — Discoverable but not prevented  
**Risk** : The `sync-culture-to-notion` Edge Function can create duplicate Notion pages if it fails after creating the page but before updating the culture's `notion_page_id` in Supabase.

**How it happens** :
1. Frontend calls Edge Function with culture_id = 42
2. Function creates Notion page successfully
3. Network timeout before `notion_page_id` update in Supabase → stays `null` in DB
4. Next call to `syncPendingCultures()` finds culture 42 again (filter: `notion_page_id IS NULL`)
5. Culture synced twice → duplicate Notion page

**Current mitigation** :
- Limit to 20 cultures per sync batch (prevents runaway)
- Log errors to browser console (manual discovery)
- No automatic retry of failed syncs (prevents cascade)

**Permanent fix** (owner action) :
- Add database-level constraint: `notion_page_id` can only be updated from `NULL` → non-null once
- OR: Implement transaction in Edge Function (Supabase code review needed)
- See [`../SUPABASE_AUDIT.md`](../SUPABASE_AUDIT.md) for options A/B/C

### supabase-js version not pinned
**Status** : ✅ **Fixed** (2026-10-19) — Pinned to `2.118.0` in `index.html`.

Previously loaded `@supabase/supabase-js@2` (latest 2.x, floating). Breaking changes in a future
2.x release could have broken sync without warning. Now pinned to a specific, tested version.
To upgrade deliberately: change the version in the `<script>` tag, test in a browser, then commit.

### batch-tracker licence undefined
**Status** : 📋 To be decided  
**Issue** : `batch-tracker/` depends on 25+ open-source packages but its own licence is not declared.

**Decision needed** :
- **Proprietary** (B.A. LAB internal use only) → add `"private": true` to package.json
- **Open-source** (MIT / Apache-2.0 / ...) → add licence key to package.json

See root [`LICENSE`](../LICENSE) for per-directory mapping.

### Hosting not documented
**Status** : 📋 To be confirmed  
**Issue** : Current hosting (GitHub Pages? Vercel?) and URL not documented. Deployment procedure unclear.

## Manual test checklist

Run against a non-production organisation before publishing a change:

1. Sign in, sign out; wrong password; expired session.
2. Create a culture (valid and invalid input); check its Notion sync status.
3. Create a batch from a culture; advance each stage in order.
4. Confirm `qc` cannot be crossed by normal advancement.
5. Complete QC checks (pass, fail, waived); `release_batch` only when all pass or are waived.
6. Network error during each action: no success message must be shown unless the backend confirmed it.
7. Any new field rendered through `innerHTML` must go through `escapeHtml`.
