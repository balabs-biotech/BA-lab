#!/bin/sh
# Fails if a tracked non-Markdown file contains a secret-looking token.
# The Supabase *publishable* key (sb_publishable_...) is allowed in the frontend.
set -eu
cd "$(dirname "$0")/.."
PATTERN='(sb_secret_[A-Za-z0-9_-]{10,}|SUPABASE_SERVICE_ROLE_KEY|NOTION_(API_)?(KEY|TOKEN)|ntn_[A-Za-z0-9]{20,}|secret_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[bap]-|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.)'
if git grep -nIE "$PATTERN" -- . ':(exclude)*.md' ':(exclude)scripts/check-secrets.sh'; then
  echo "Possible secret found above." >&2
  exit 1
fi
echo "no secret patterns found"
