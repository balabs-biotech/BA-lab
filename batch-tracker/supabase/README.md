# Batch Tracker — Supabase (reference only)

**Supabase is the source of truth for the backend.** This directory deliberately contains no SQL, migrations, schema dumps or data exports, and none must be added: the schema, access rules (RLS), RPC functions and Edge Functions are managed and documented in the Supabase project itself.

| | |
|---|---|
| Project | `BALabs` (ref `axcouwiodqsauwnsiotn`, region `eu-west-3`) |
| Frontend | [`../index.html`](../index.html) |
| Edge Functions | `claim-ba-labs`, `sync-culture-to-notion` (deployed in Supabase, not versioned here) |

## Batch workflow (as applied in production)

```text
preparation → sterilization → inoculation → incubation → cultivation
→ harvest → formulation → packaging → qc → release
```

Standard stage advancement cannot cross `qc`. Release goes through `release_batch()` only, after the QC checks pass or are explicitly waived.

## Secrets

- The frontend uses the project URL and a **publishable** key only. That key is meant for browsers.
- A `service_role` / secret key or a Notion token must **never** be placed in this repository or in the frontend. They belong in Supabase Edge Function secrets.
