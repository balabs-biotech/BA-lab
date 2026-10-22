# Batch Tracker

The Batch Tracker is a static HTML/CSS/JavaScript interface in `index.html`; it uses the `BALabs` Supabase project for operational data. There is no frontend build step.

## Entry and navigation

The repository root `../index.html` is the **universe chooser**, not a redirect. It links to the tracker with one of three supported query parameters:

- Agronomy: `../batch-tracker/?domain=agronomy`
- Mycology: `../batch-tracker/?domain=mycology`
- Laboratory: `../batch-tracker/?domain=laboratory`

Opening this page without exactly one supported `domain` parameter redirects to the root chooser. The in-tracker link **“Tous les univers”** returns to that chooser. CI checks the three entry links and verifies valid, missing, unknown, and duplicated domain parameters.

## Notion synchronisation

Supabase remains the operational source of truth. The Edge Function source is versioned at `../supabase/functions/sync-culture-to-notion/index.ts`; the deployed function and its secrets are managed in Supabase.

The current function implements sequential retry reconciliation:

1. It only trusts a stored Notion page ID after verifying that the page belongs to the configured cultures database and carries the same `Supabase Culture ID`.
2. If that check fails, it queries the database for a page carrying that culture ID.
3. If one page is found, it updates it; if more than one is found, it stops for manual duplicate resolution; if the lookup fails, it fails closed instead of creating a page.
4. If a new page is created but writing its ID back to Supabase fails, a later retry should find the existing page through the lookup.

**Residual limitation:** Notion page creation and the Supabase update are not one atomic transaction. Two concurrent requests can both query before either page exists and then create duplicates. The frontend's in-page `syncInProgress` guard does not coordinate separate tabs or external requests. Do not describe the flow as fully race-proof until cross-request idempotency or a lock is implemented and tested.

The frontend can retry pending/error records and provides a manual retry control. Validate sync behavior with a non-production organisation and Notion database before operational use.

## Manual validation checklist

Run against a non-production organisation before publishing a change:

1. Sign in and out; test wrong password and expired session.
2. Create a culture with valid and invalid input; check its sync status.
3. Create a batch from a culture and advance each stage in order.
4. Confirm normal advancement cannot cross `qc`.
5. Release only after QC checks pass or are explicitly waived.
6. Simulate network errors; never show success unless the backend confirms the action.
7. Ensure user-controlled values rendered with `innerHTML` pass through `escapeHtml`.
8. Test Notion sync retry after a partial failure and test concurrent requests separately.
