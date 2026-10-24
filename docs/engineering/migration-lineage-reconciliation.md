# Migration lineage reconciliation and stabilization

**Prepared:** 2026-10-24  
**Branch:** `fix/stabilize-migration-lineage-20261024`  
**Scope:** source-control reconciliation and CI hardening only; no production schema or data changes were made.

## Findings from the live Supabase migration ledger

The production ledger returned 52 versions. The `main` branch initially contained 49 SQL migration files. Nine production versions had no same-version file, while six repository files used alternate timestamps for migrations with the same functional names.

### Canonical timestamp alignment

The following files were renamed in this branch to match the version IDs already recorded in production. Their SQL bodies were copied unchanged:

| Old source version | Production version | Migration |
|---|---|---|
| `20261022070000` | `20261022043824` | Link IoT measurements to environments |
| `20261022080000` | `20261022043901` | Atomic IoT ingestion RPC |
| `20261022090000` | `20261022043951` | Controlled public dataset exports |
| `20261022093000` | `20261022044035` | Restrict public dataset client writes |
| `20261023012000` | `20261023012845` | Mycology culture formats |
| `20261023020000` | `20261023152559` | Version NASA POWER cron secret verifier |

These are source filename corrections, not new production migrations. They must not be applied to the live project simply because the filenames changed.

### Missing migration source restored

Three files absent from the repository were added using the production ledger names:

- `20261023020711_enable_pg_net_for_secure_scheduled_imports.sql`
- `20261023023224_schedule_secure_nasa_power_daily_import.sql`
- `20261023213359_index_plant_cultures_location_environment_fks.sql`

The extension and scheduled-job migrations were reconstructed from the live ledger's recorded statements and observed production state. The scheduler reconstruction now includes the verifier function, least-privilege grants, creation of a high-entropy Vault secret when absent, and the 04:30 UTC daily job. It checks for Supabase Vault, pg_cron, and pg_net before running the integration block, allowing plain PostgreSQL CI containers without those integrations to continue replaying schema migrations. The index migration recreates the two indexes observed in production. **These three files are not byte-for-byte recovery of the original source**, because the live migration ledger stores recorded statements, not original source files. They still require review before merge.

No secret value is embedded in source. Production currently has the expected Vault secret and active cron job; this was verified read-only. No production SQL was applied during this work.

### Clean-replay ordering correction

The first replay attempt exposed a real ordering defect: the production ledger places the measurement-to-IoT-device migration before the IoT device registry migration. Production already contains the referenced table, but a clean database does not at that point in the replay.

This branch now:
- defers creation of the device foreign key when `public.iot_devices` does not yet exist;
- adds an idempotent follow-up migration, `20261024060000_complete_measurements_iot_device_fk.sql`, after the registry is created;
- adds a post-replay assertion that the foreign key exists and is validated.

This is a source/replay correction. The live production database was not changed. The follow-up migration should be reviewed and applied only through the normal migration deployment process; because production already has the constraint, it should be a no-op there.

### Security audit notes

Read-only inspection of production `SECURITY DEFINER` functions found:
- no execute grant to `anon` on the eight public-schema functions in the current audit set;
- the three batch workflow functions callable by `authenticated` check organization membership through `private.is_org_member` before modifying batch state;
- IoT ingestion and Notion sync-lock functions are restricted to `service_role`;
- the NASA POWER verifier uses an empty `search_path` and is executable only by `service_role`;
- `anon`, `authenticated`, and `service_role` cannot create objects in `public` or `private`, reducing search-path object-shadowing risk.

This is a focused audit of current functions and grants, not a complete certification of every table policy or tenant boundary. Continue with table-level RLS and cross-organization negative tests before treating the security review as complete.

## CI results and pending migrations

The latest CI run on commit `464cd9df324484a9f4ea438059b7868a01992c28` completed successfully. All seven jobs passed, including firmware build, firmware logic, migration contract tests, clean PostgreSQL 17 migration replay, and secret scanning. The scheduler reconstruction has since been amended, so its new commit must complete CI before the PR can be considered ready.

The branch has 55 migration files: 52 versions matching production history and three pending migrations (`20261024050000`, `20261024060000`, `20261024070000`). These pending migrations are intentionally not applied to production.

## Safety constraints

1. Do not run `supabase db push`, reset production, or replay historical migrations against the live database as part of this reconciliation.
2. Review the three reconstructed migrations and the latest CI result before merging.
3. Confirm the resulting migration list contains each production version exactly once.
4. After merge, compare the linked project's migration ledger with the repository again. If the CLI reports pending changes, inspect the diff before applying anything.
5. Test scheduled invocation in Supabase with a controlled, non-secret health check and confirm the latest NASA POWER import succeeds.

## CI guard

`scripts/check-migration-filenames.mjs` verifies that migration filenames have valid 14-digit versions and that versions are unique. This catches future filename collisions; it does not replace comparison with the live Supabase ledger.
