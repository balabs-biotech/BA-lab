# CultureOps — Execution Queue v1

**Status:** implementation contract; not yet a database migration.  
**Target:** PostgreSQL 17 / Supabase Free, with a local Python 3.10+ consumer.  
**Isolation:** development branch only; no production database changes.

## 1. Responsibility boundaries

- PostgreSQL owns durable job state, idempotency, leases, attempt history and tenant ownership.
- The Python worker owns polling, exact-version engine resolution, engine execution and result normalization.
- An engine owns only its scientific or computational task. It does not claim jobs, renew leases or write queue state.
- CultureOps UI submits work and reads authorized status; it does not receive direct access to internal queue tables.

The queue must remain useful when no worker is running. Jobs remain durable in PostgreSQL until a local worker is started.

## 2. Internal tables

All three tables belong in the non-exposed `private` schema. They are not directly granted to `anon` or `authenticated`.

### `private.engine_jobs`

| Column | Contract |
|---|---|
| `id` | UUID primary key |
| `organization_id` | UUID, FK to `public.organizations(id)`, cascade delete |
| `engine_code` | non-empty stable identifier |
| `engine_version` | exact immutable version; never resolve implicitly to latest |
| `job_type` | non-empty task identifier |
| `payload` | JSON object, never arbitrary JSON scalar |
| `status` | queued / running / retry_wait / succeeded / failed / cancelled |
| `priority` | integer; higher value first |
| `attempt_count` | starts at zero; increments on each successful claim |
| `max_attempts` | positive integer; default 3 |
| `available_at` | earliest eligible claim timestamp |
| `idempotency_key` | non-empty client-generated key |
| `created_at`, `updated_at` | timestamptz |

Unique constraint: `(organization_id, idempotency_key)`. A repeated submission with the same key must return the existing job only when its immutable request identity matches; a conflicting payload or engine identity must be rejected.

### `private.engine_job_leases`

One row per claim attempt, retained after release for diagnostics.

| Column | Contract |
|---|---|
| `lease_token` | UUID primary key; new unpredictable token on every claim |
| `job_id` | FK to job |
| `worker_id` | non-empty worker instance identifier |
| `attempt_number` | positive attempt number |
| `leased_at` | claim timestamp |
| `expires_at` | lease deadline |
| `heartbeat_at` | most recent successful heartbeat |
| `released_at` | nullable terminal/release timestamp |
| `release_reason` | nullable completed / retry / expired / cancelled |

A lease token is a fencing token. Every heartbeat, completion and failure mutation must match the current job, lease token, worker and unexpired lease. A stale worker must affect zero rows and must not persist results.

### `private.engine_job_runs`

Append-only execution attempt history.

- Primary key: UUID.
- Foreign keys: job and lease token.
- Attempt number and exact engine version.
- Started / finished timestamps.
- Execution status: running / succeeded / retry_wait / failed / lease_expired.
- Result summary, structured error code and bounded error details.
- One row per attempt; never overwrite a prior attempt.

## 3. State transitions

| Current state | Event | Next state |
|---|---|---|
| queued | eligible claim | running |
| retry_wait | available_at reached and claim | running |
| running | valid completion | succeeded |
| running | retryable failure with attempts remaining | retry_wait |
| running | permanent failure or attempts exhausted | failed |
| running | lease expires | retry_wait or failed |
| queued / retry_wait | authorized cancellation | cancelled |

Terminal states are succeeded, failed and cancelled. A terminal job cannot be claimed again.

## 4. Atomic claim algorithm

A single database transaction must:

1. Select one eligible queued/retry_wait job, ordered by priority descending then creation time ascending.
2. Lock with `FOR UPDATE SKIP LOCKED` so concurrent consumers cannot claim the same row.
3. Exclude jobs whose `attempt_count >= max_attempts`.
4. Increment attempt_count and set status=running.
5. Create a new lease row with a fresh UUID token and bounded expiry.
6. Create the corresponding run-history row.
7. Return the job, attempt number and lease token to the worker.

The claim function must have a bounded lease duration (initial default 60 seconds). The consumer heartbeats approximately every 20 seconds. No claim operation may hold a transaction open while an engine executes.

## 5. Lease expiry, heartbeat and fencing

- Heartbeat extends expiry only if job is still running, token matches, lease is not expired and worker_id matches.
- Expiry recovery marks the old lease released as expired and closes its run row.
- A recovered job is scheduled for retry using bounded exponential backoff, unless max attempts are exhausted.
- A worker whose lease expired cannot heartbeat, complete, fail or persist a result, even if it later resumes.
- Result persistence and transition to succeeded must occur in one transaction after validating the fencing token.

Initial retry policy: 3 attempts total; exponential delay starting at 30 seconds, capped at 15 minutes. Permanent validation/unsupported-engine errors fail immediately. Network/timeouts may retry.

## 6. Authorization model

- Queue tables stay in `private`; no direct browser grants.
- `anon` and `authenticated` receive no table privileges.
- The local worker authenticates with a backend-only Supabase credential stored in a local environment variable; never embed it in frontend assets or commit it.
- Enqueue/status RPCs must derive or validate the organization against the authenticated user and existing tenant authorization helpers.
- Worker-only claim/heartbeat/complete/fail operations are restricted to the trusted backend role.
- Any privileged function must live in `private`, use an empty or fixed safe `search_path`, have EXECUTE revoked from PUBLIC/anon/authenticated, and be explicitly granted only to the intended role.
- Do not weaken existing tenant policies or reuse user-editable JWT metadata for authorization.

## 7. Failure isolation

The polling loop catches failures per job. An engine exception closes only that attempt; it must not terminate the consumer or prevent unrelated jobs from running. Unknown engine code/version is a permanent job error, not a fallback to another engine.

## 8. Required PostgreSQL 17 regression tests

1. Two concurrent consumers cannot claim the same job.
2. Jobs are claimed by priority then FIFO order.
3. Same organization + idempotency key cannot create duplicate jobs.
4. Reusing a key with a different request is rejected.
5. A heartbeat extends only the current unexpired lease.
6. Expired lease is recoverable and creates a new fencing token.
7. Old token cannot heartbeat, complete, fail or save a result.
8. Retry backoff is bounded and max attempts ends in failed.
9. Permanent error does not retry.
10. Every attempt has a durable run-history row.
11. Organization A cannot enqueue/read/cancel organization B jobs.
12. anon/authenticated cannot access internal tables or worker RPCs.
13. Worker operations are limited to trusted backend role.
14. A failed engine attempt does not mutate other jobs.

## 9. Implementation sequence

1. Generate the migration file with `supabase migration new` (CLI-generated version; do not hand-invent the filename).
2. Implement the internal schema and narrowly scoped RPCs.
3. Add SQL tests to the existing disposable PostgreSQL 17 CI replay.
4. Add a minimal Python queue client and consumer with `--once` and continuous modes.
5. Add a deterministic demo engine and end-to-end local integration test.
6. Run CI and security review. Only then consider a separately approved production migration.

## 10. Explicitly out of scope for v1

- Always-on hosted worker or paid compute.
- Supabase paid branches or paid plans.
- UI dashboard for queue operations.
- Scientific engine implementations (environmental, spatial, biological).
- Automatic production deployment.
