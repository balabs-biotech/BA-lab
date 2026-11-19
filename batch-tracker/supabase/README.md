# Batch Tracker — Supabase

**Production backend:** Supabase project `BALabs` (ref `axcouwiodqsauwnsiotn`, region `eu-west-3`). Supabase is the runtime source of truth; the repository also keeps versioned SQL migrations, tests, and Edge Function source under the root-level `supabase/` directory. A repository copy is not proof that the deployed function matches it: compare the deployed version and source hash before release.

| | |
|---|---|
| Frontend | [`../index.html`](../index.html) |
| Versioned migrations | [`../../supabase/migrations/`](../../supabase/migrations/) |
| Versioned Edge Functions | [`../../supabase/functions/`](../../supabase/functions/) |
| Database tests | [`../../supabase/tests/`](../../supabase/tests/) |

## Batch workflow

```text
preparation → sterilization → inoculation → incubation → cultivation
→ harvest → formulation → packaging → qc → release
```

The deployed RPCs validate organization membership and resource ownership. Standard stage advancement cannot skip QC; release goes through `release_batch()` only after QC checks pass or are explicitly waived. These controls must remain covered by automated cross-organization tests.

## Secrets and browser configuration

- The frontend may contain the project URL and a **publishable** Supabase key. Publishable keys are not authorization controls; RLS, grants, and RPC authorization must enforce access.
- Never put a Supabase secret/service-role key or a Notion token in Git, public documentation, or browser code.
- Keep Notion credentials in Supabase Edge Function secrets and grant the connected Notion integration only the access it needs.

## Notion synchronization

The deployed `sync-culture-to-notion` Edge Function was observed at **version 13** on 2026-10-23. The repository contains a source copy under `supabase/functions/sync-culture-to-notion/index.ts`; verify parity before deployment rather than assuming the copy is identical.

The deployed implementation:
1. Authenticates the caller and checks access to the requested culture through the caller-scoped Supabase client before using the service role.
2. Uses a per-culture server-side lock with a 180-second lease to serialize concurrent requests.
3. Verifies a stored Notion page belongs to the configured database and carries the matching Supabase Culture ID.
4. Reconciles a prior partial success by querying Notion before creating a new page.
5. Fails closed on lookup errors or ambiguous duplicate matches, and releases the lock in a `finally` block.

This reduces duplicate creation risk but does not replace integration tests for simultaneous requests, expired leases, partial failures, and lock-release errors. Do not describe synchronization as fully idempotent until those cases are exercised.

## Database migrations

Migrations are versioned in `supabase/migrations/`. The production migration ledger reports `20261020090000_protect_cultures_notion_columns_v1` as applied. The repository migration remains the source for replay and review; do not instruct operators to apply it manually unless the production ledger shows it is missing.

## Security review follow-up

- Review Supabase Security Advisor findings. The two RLS-enabled IoT tables without policies currently have no direct grants to `anon` or `authenticated`; keep that grant boundary explicit and recheck it after schema changes.
- The Security Advisor flags four authenticated-callable `SECURITY DEFINER` batch RPCs. Their definitions include organization membership checks, but keep least-privilege grants and cross-organization denial tests in CI.
- Enable leaked/compromised-password protection in Supabase Auth settings.
- Verify repository branch protection/rulesets and require successful CI checks before merging.
