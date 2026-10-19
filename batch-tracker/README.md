# Batch Tracker (web interface)

Single static page ([`index.html`](index.html), HTML/CSS/JavaScript, no build step) that talks to the `BALabs` Supabase project through `@supabase/supabase-js`. Backend details: [`supabase/README.md`](supabase/README.md).

The repository root `index.html` only redirects here.

## Open points

- **Hosting is not documented.** The redirect suggests GitHub Pages, but this is unconfirmed. The deployment URL and publication procedure should be written here.
- `supabase-js` is loaded as `@2` from jsDelivr, which is not a pinned version. Pin an exact version after testing it in a browser.
- Notion sync (`syncPendingCultures()`) only retries cultures with status `pending`. Cultures that end in `error` are not retried, and the `sync-culture-to-notion` function can create a duplicate Notion page if its final database write fails. This must be fixed on the Supabase side (idempotency, retry policy) before retry is added in the UI.

## Manual test checklist

Run against a non-production organisation before publishing a change:

1. Sign in, sign out; wrong password; expired session.
2. Create a culture (valid and invalid input); check its Notion sync status.
3. Create a batch from a culture; advance each stage in order.
4. Confirm `qc` cannot be crossed by normal advancement.
5. Complete QC checks (pass, fail, waived); `release_batch` only when all pass or are waived.
6. Network error during each action: no success message must be shown unless the backend confirmed it.
7. Any new field rendered through `innerHTML` must go through `escapeHtml`.
