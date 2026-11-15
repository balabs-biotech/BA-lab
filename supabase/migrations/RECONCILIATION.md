# Supabase migrations — reconciliation report

**Project:** `BALabs`  
**Recovery date:** 15 November 2026  
**Source of truth for applied SQL:** `supabase_migrations.schema_migrations` in the active project.

## Result after recovery

| Measure | Count |
|---|---:|
| Applied migrations registered in Supabase | 92 |
| Exact version + name migration files now in Git | 92 |
| Additional legacy/local SQL files retained | 14 |
| Total SQL files in Git | 106 |

All 92 applied migration SQL bodies were retrieved directly from the migration ledger and restored to Git under their exact remote version/name identifiers. The recovery was committed to the architecture branch as `6360779972086e0479df92aa5ae7d8509db9ddea`.

The 14 pre-existing local-only migration filenames were retained. They were not renamed, deleted, or treated as authoritative for the active production history. Where their names resembled remote migrations, the exact remote SQL was restored separately under the actual remote identifier.

## Recovery safeguards

- SQL was read from the applied migration ledger, not reconstructed from the current schema.
- Each stored statement was reassembled with an explicit SQL statement terminator; multi-statement migrations were checked for preserved statement boundaries. The initial draft without separators was replaced before validation.
- The recovered set contained 92 non-empty SQL bodies (approximately 290,000 characters).
- A targeted scan found no obvious private-key blocks, Supabase service secret patterns, or JWT-shaped credentials.
- No SQL migration was replayed, no migration history row was inserted, and no production schema/data/permissions were changed.
- This recovery restores source files; it does **not** prove that a clean environment can replay the full project. That requires isolated replay validation and the missing project configuration.

## Remaining work

1. Recover and validate `supabase/config.toml` and any required local seed/configuration files from a verified source.
2. Preserve and explain the 14 legacy/local-only migration files; do not automatically delete them.
3. Validate replay of the 92 exact migrations against an isolated database using the correct Supabase CLI version and extensions. The CI run for commit `6360779972086e0479df92aa5ae7d8509db9ddea` is queued.
4. Compare the replayed schema and function definitions to the active project before claiming reproducible deployment parity.
5. Keep production migration history untouched during this process.
