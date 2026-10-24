# Migration lineage reconciliation and stabilization

**Prepared:** 2026-10-24  
**Branch:** `fix/stabilize-migration-lineage-20261024`  
**Scope:** source-control reconciliation only; no production schema or data changes were made.

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

The extension and scheduled-job migrations were reconstructed to reproduce the observed production intent. The index migration recreates the two indexes observed in production. **These three reconstructed files are not a byte-for-byte recovery of the original SQL**, because the live migration ledger stores versions/names, not the original migration contents. They require CI replay and review before merge.

The scheduled job uses the existing project endpoint and retrieves its secret from Supabase Vault. No secret value is embedded in source. The pg_net/pg_cron setup is guarded so plain PostgreSQL test containers without these Supabase extensions can replay the remaining schema migrations; those containers do not validate the actual extension or scheduled-job behavior.

### Clean-replay ordering correction

The first replay attempt exposed a real ordering defect: the production ledger places the measurement-to-IoT-device migration before the IoT device registry migration. Production already contains the referenced table, but a clean database does not at that point in the replay.

This branch now:
- defers creation of the device foreign key when `public.iot_devices` does not yet exist;
- adds an idempotent follow-up migration, `20261024060000_complete_measurements_iot_device_fk.sql`, after the registry is created;
- adds a post-replay assertion that the foreign key exists and is validated.

This is a source/replay correction. The live production database was not changed. The follow-up migration should be reviewed and applied only through the normal migration deployment process; because production already has the constraint, it should be a no-op there.

## Safety constraints

1. Do not run `supabase db push`, reset production, or replay historical migrations against the live database as part of this reconciliation.
2. Review the three reconstructed migrations and the CI result before merging.
3. Confirm the resulting migration list contains each production version exactly once.
4. After merge, compare the linked project's migration ledger with the repository again. If the CLI reports pending changes, inspect the diff before applying anything.
5. Test scheduled invocation in Supabase with a controlled, non-secret health check and confirm the latest NASA POWER import succeeds.

## CI guard

`scripts/check-migration-filenames.mjs` verifies that migration filenames have valid 14-digit versions and that versions are unique. This catches future filename collisions; it does not replace comparison with the live Supabase ledger.
