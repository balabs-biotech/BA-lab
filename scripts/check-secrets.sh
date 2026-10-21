#!/bin/sh
# Fails if a tracked non-Markdown file contains a secret-looking token.
# The Supabase *publishable* key (sb_publishable_...) is allowed in the frontend.
#
# Two passes:
#  - VALUES: real token/key shapes, checked in every tracked file.
#  - NAMES : env-var names such as NOTION_API_KEY. Forbidden everywhere except in
#    Edge Function source and its tests (supabase/functions/, supabase/tests/), which
#    read them via Deno.env.
set -eu
cd "$(dirname "$0")/.."
VALUES='(sb_secret_[A-Za-z0-9_-]{10,}|secret_[A-Za-z0-9]{30,}|ntn_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_|xox[bap]-|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.)'
NAMES='(SUPABASE_SERVICE_ROLE_KEY|NOTION_(API_)?(KEY|TOKEN))'
found=0
if git grep -nIE "$VALUES" -- . ':(exclude)*.md' ':(exclude)scripts/check-secrets.sh'; then found=1; fi
if git grep -nIE "$NAMES" -- . ':(exclude)*.md' ':(exclude)scripts/check-secrets.sh' ':(exclude)supabase/functions/*' ':(exclude)supabase/tests/*'; then found=1; fi
if [ "$found" -ne 0 ]; then
  echo "Possible secret found above." >&2
  exit 1
fi
echo "no secret patterns found"
