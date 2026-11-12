# Deployed Supabase Edge Function snapshots

Captured read-only from Supabase project `axcouwiodqsauwnsiotn` on 2026-11-01.

This directory records the exact source currently deployed for all nine active Edge Functions, together with each deployed version, `verify_jwt` setting, Git blob checksum, and Supabase bundle SHA-256 in `manifest.json`.

## Important distinction

- `supabase/functions/` is the maintained source tree used for future development.
- `supabase/deployed-functions-snapshot/` is a point-in-time recovery/reference snapshot of what was actually deployed at capture time.
- The two trees are not interchangeable. Four tracked functions differed from their deployed source at capture time; three deployed functions had no matching source directory in the main branch.
- Do not deploy this snapshot automatically. First review the differences, choose the intended canonical version, and validate it in CI.

## Functions with JWT verification disabled

Two endpoints deliberately use their own authentication mechanism and must not be made public without those checks:

- `iot-ingest`: device bearer token, SHA-256 lookup, enabled-device check, bounded payload, and atomic ingestion RPC.
- `nasa-power-scheduled-import`: dedicated cron-secret header checked against the Vault secret through `verify_nasa_power_cron_secret`.

All other functions had `verify_jwt=true` at capture time. See the manifest for exact settings.

The snapshot contains source code only. It does not contain Edge Function secrets, Vault contents, database credentials, or project-level configuration.
