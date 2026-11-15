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

## Replay finding — blocking dependency

The isolated PostgreSQL 17 replay reached migration `20261022043824_link_iot_measurements_to_environment.sql` and failed because it adds a foreign key to `public.iot_devices` before that relation exists in the ordered migration history. The relation is created only by `20261022060000_add_iot_device_registry.sql`, which has a later version identifier.

This is a real historical dependency gap, not a formatting issue. The two migration files have been preserved exactly as recovered from the active migration ledger. Do not silently edit an already-applied migration or reorder history to make CI green. A deliberate remediation must first establish whether `iot_devices` existed outside the recorded migration history when the earlier migration was applied. Until then, the empty-database replay is correctly marked **blocked**; production remains untouched.

## Remaining work

1. Recover and validate `supabase/config.toml` and any required local seed/configuration files from a verified source.
2. Preserve and explain the 14 legacy/local-only migration files; do not automatically delete them.
3. Resolve the `iot_devices` prerequisite gap described above, then rerun the isolated migration replay. The current CI run confirms this is the first blocking migration dependency.
4. Compare the replayed schema and function definitions to the active project before claiming reproducible deployment parity.
5. Keep production migration history untouched during this process.
