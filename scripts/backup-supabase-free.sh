#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the database connection string (do not commit it)}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF to the project ref}"

for cmd in supabase docker sha256sum; do
  command -v "$cmd" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$cmd" >&2
    exit 1
  }
done

docker info >/dev/null 2>&1 || {
  printf 'Docker must be running because Supabase CLI db dump uses a local container.\n' >&2
  exit 1
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${BACKUP_ROOT:-$HOME/ba-labs-backups/supabase}"
backup_dir="$backup_root/$SUPABASE_PROJECT_REF/$timestamp"
mkdir -p "$backup_dir"

printf 'Creating BA Labs Supabase logical backup: %s\n' "$backup_dir"
printf 'Project ref: %s\n' "$SUPABASE_PROJECT_REF"

# PostgreSQL roles, schema, and application data.
supabase db dump --db-url "$SUPABASE_DB_URL" --file "$backup_dir/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" --file "$backup_dir/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --file "$backup_dir/data.sql" --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

# Preserve Supabase CLI migration history separately; it is not part of the
# normal application-schema dump.
supabase db dump --db-url "$SUPABASE_DB_URL" --schema supabase_migrations \
  --file "$backup_dir/migration-history-schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --schema supabase_migrations \
  --file "$backup_dir/migration-history-data.sql" --use-copy --data-only

{
  printf 'project_ref=%s\n' "$SUPABASE_PROJECT_REF"
  printf 'created_utc=%s\n' "$timestamp"
  printf 'supabase_cli=%s\n' "$(supabase --version)"
  printf 'git_commit=%s\n' "$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
} > "$backup_dir/manifest.txt"

(
  cd "$backup_dir"
  sha256sum roles.sql schema.sql data.sql migration-history-schema.sql \
    migration-history-data.sql manifest.txt > SHA256SUMS
)

printf '\nBackup files created:\n'
du -h "$backup_dir"/*
printf '\nVerify checksums with: (cd "%s" && sha256sum -c SHA256SUMS)\n' "$backup_dir"
printf 'Copy this directory to a separate encrypted/off-site location.\n'
printf 'This backup does NOT contain Auth users, Storage objects, Edge Function secrets, or Dashboard settings.\n'
