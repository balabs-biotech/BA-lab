# BA Labs — Supabase Free backup and recovery runbook

## Scope and current state

This runbook covers the BA Labs CultureOps Supabase project on the Free plan. It is designed for a manual, zero-additional-cost logical backup. It does not change the live project.

A read-only audit on 2026-11-01 found:

- PostgreSQL database size: approximately 19 MB.
- 47 public base tables.
- 2 Auth users.
- 0 Storage buckets and 0 Storage objects.
- 9 active Edge Functions.
- Migration history is stored in `supabase_migrations.schema_migrations`.

Supabase Free does not include automatic daily database backups or Point-in-Time Recovery (PITR). The official recommendation for Free projects is to export regularly with the Supabase CLI and keep off-site copies.

## What the CLI backup covers

The helper script `scripts/backup-supabase-free.sh` creates:

| File | Content |
|---|---|
| `roles.sql` | PostgreSQL role definitions/grants (not custom role passwords) |
| `schema.sql` | Database schema dump |
| `data.sql` | Application data dump using COPY |
| `migration-history-schema.sql` | CLI migration-history schema |
| `migration-history-data.sql` | CLI migration-history rows |
| `manifest.txt` | Project ref, UTC timestamp, CLI version, local Git commit |
| `SHA256SUMS` | SHA-256 integrity checksums |

The normal Supabase CLI dump does **not** back up Auth users or Storage objects. The database backup also does not include Edge Function source/secrets, Auth settings, API keys, Realtime configuration, or all project-level settings.

Current Storage usage is zero, so there are no existing object files to export. If buckets or objects are introduced later, add a separate Storage export/verification procedure before relying on this runbook.

Auth users are not recoverable from these SQL files. In a disaster recovery, recreate/invite users and require password resets or account recovery. Do not assume password hashes or active sessions can be restored.

Edge Function source and deployment state require a separate repository snapshot; they are not part of the PostgreSQL SQL dump. A read-only capture of all nine active production functions is stored in `supabase/deployed-functions-snapshot/`, with exact source, deployed version, `verify_jwt` setting, and checksums in `manifest.json`.

The capture exposed source drift that must be resolved before a disaster deployment:
- Three deployed functions were absent from the `main` source tree: `claim-ba-labs`, `sentinel-2-ndvi-preview`, and `earth-search-sentinel2-catalogue`.
- Four tracked functions differed from their deployed source at capture time: `sync-culture-to-notion`, `nasa-power-agroclimate`, `copernicus-sentinel-catalogue`, and `earth-search-sentinel2-ndvi-preview`.
- Only `iot-ingest` and `nasa-power-scheduled-import` matched their deployed source exactly.


The deployed inventory at capture time was:

| Function | Deployed version | Supabase JWT verification |
|---|---:|---|
| `claim-ba-labs` | 9 | Enabled |
| `sync-culture-to-notion` | 13 | Enabled |
| `iot-ingest` | 2 | Disabled — device-token authentication in handler |
| `nasa-power-agroclimate` | 6 | Enabled |
| `nasa-power-scheduled-import` | 4 | Disabled — Vault-backed cron secret in handler |
| `copernicus-sentinel-catalogue` | 8 | Enabled |
| `sentinel-2-ndvi-preview` | 1 | Enabled |
| `earth-search-sentinel2-catalogue` | 1 | Enabled |
| `earth-search-sentinel2-ndvi-preview` | 5 | Enabled |

The deployed snapshot is a recovery/reference artifact, not a deployment instruction. Compare it with `supabase/functions/`, choose the intended canonical source, and run tests before deploying. Never place Edge Function secrets or Vault values in this repository. The snapshot contains source code only; project secrets must be inventoried separately by secret name and re-entered securely in a target project.

## Requirements

- Supabase CLI installed.
- Docker running.
- PostgreSQL connection string for the source project.
- Enough local disk space.
- A second encrypted/off-site copy location.

Set credentials only in the local shell environment. Do not paste connection strings into chat, commit them, or store them in this repository.

```bash
export SUPABASE_PROJECT_REF="your-project-ref"
export SUPABASE_DB_URL="postgresql://..."
bash scripts/backup-supabase-free.sh
unset SUPABASE_DB_URL
```

The script writes under `$HOME/ba-labs-backups/supabase/<project-ref>/<UTC timestamp>/` by default. Override `BACKUP_ROOT` to use another location.

After completion, verify the checksums:

```bash
cd "$HOME/ba-labs-backups/supabase/$SUPABASE_PROJECT_REF/<timestamp>"
sha256sum -c SHA256SUMS
```

Then copy the complete timestamped directory to a separate encrypted/off-site location. A backup that exists only on the same computer is not sufficient protection against device loss.

## Recovery outline

A restore is a separate, deliberate operation. Never point restore commands at the live production database during a test.

1. Create a new Supabase project (or a local PostgreSQL/Supabase environment for a rehearsal).
2. Configure required extensions and project-level settings. The production audit identified installed extensions including `postgis`, `pgcrypto`, `pg_net`, `pg_cron`, `pgtap`, `uuid-ossp`, and `pg_stat_statements`; confirm versions and availability in the target before restoring.
3. Obtain the target database connection string.
4. Verify `SHA256SUMS` before using any file.
5. Restore `roles.sql`, `schema.sql`, and `data.sql` following the official Supabase CLI restore procedure. The documented sequence uses `psql --single-transaction --variable ON_ERROR_STOP=1`, applies roles and schema, sets `session_replication_role = replica` for the data load, then loads the data file.
6. Restore migration history separately if preserving the CLI migration ledger is required.
7. Recreate Auth users through invitation/account recovery; do not try to restore managed Auth internals from the application SQL dump.
8. Recreate project-level Auth settings, API keys, Edge Function secrets, function deployments, and Realtime settings. Deploy functions from the version-controlled source.
9. Re-run the repository migration replay and security tests against the recovered environment.
10. Validate login, tenant isolation, culture/batch traceability, and the critical create/update/read workflows before directing users to the recovered project.

Supabase's official restore guide contains the exact `psql` invocation and troubleshooting notes. Follow it for the current CLI version rather than improvising a restore command.

## Operating cadence

Until an automated backup service is affordable and approved:

- Run a manual backup at least weekly.
- Run one immediately before any production migration, schema change, or significant data import.
- Keep at least one recent copy on a separate encrypted device or storage location.
- Keep the manifest and checksums with each copy.
- Perform a restore rehearsal to a disposable/local target before treating the process as proven.

A successful dump is not proof of recoverability. Recovery is only verified after a restore rehearsal and application-level checks.

## Explicit exclusions

This runbook does not enable paid PITR, create a paid Supabase branch/project, alter production settings, change Auth configuration, or run a production backup. The first actual backup still requires the project database connection string to be configured locally by an authorized operator.

## Official references

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Free plan backup FAQ](https://supabase.com/kb/faqs/platform/free-plan-backups)
- [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
