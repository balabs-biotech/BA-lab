# Engine execution queue — contract review

**Reviewed against:** active Supabase project `BALabs` and deployed `engine-worker` v61  
**Review date:** 15 November 2026  
**Scope:** read-only contract review; no production writes.

## 1. RPC surface observed

| RPC | Execution mode | Effective callers | Key checks |
|---|---|---|---|
| `enqueue_engine_job` | SECURITY INVOKER | `authenticated`, `service_role` | `auth.uid()`, `private.is_org_writer(org)`, active engine, exact contract version |
| `claim_engine_job` | SECURITY DEFINER | `service_role` | worker ID length, lease duration, row lock with `SKIP LOCKED` |
| `heartbeat_engine_job` | SECURITY DEFINER | `service_role` | matching, unexpired lease token; lease duration bounds |
| `finish_engine_job` | SECURITY DEFINER | `service_role` | matching, unexpired lease token; job must still be running |

All three SECURITY DEFINER RPCs have `search_path = pg_catalog, public`. Their ACLs observed in PostgreSQL grant EXECUTE to `service_role` and `postgres`, not `anon` or `authenticated`. `enqueue_engine_job` is invoker-security and explicitly checks authenticated identity and organization write access.

## 2. Lifecycle semantics

1. Enqueue accepts a JSON object payload, priority from -100 to 100, and an optional idempotency key up to 200 characters.
2. Engine lookup is organization-aware and requires `status = active` plus an exact `contract_version` match.
3. An idempotency collision on `(organization_id, idempotency_key)` returns the existing job only if engine code, contract version, and payload all match. Reuse with a different request is rejected. A NULL key intentionally bypasses this deduplication.
4. Claim accepts lease durations from 15 to 3600 seconds, locks one eligible job with `FOR UPDATE SKIP LOCKED`, increments attempts, and creates a fresh UUID lease token.
5. An expired prior run is marked abandoned when a job is reclaimed. Exhausted attempts are marked failed.
6. Heartbeat extends only the matching, unexpired token.
7. Finish requires the matching, unexpired token and a running job. A failed attempt is requeued while attempts remain; otherwise it becomes terminal failed. The worker applies exponential backoff capped at 1800 seconds.

## 3. Worker behavior observed

- Deployed worker snapshot v61 is 2,154 lines in one Edge Function module.
- The worker heartbeats edge-function jobs every 45 seconds and aborts the downstream request if heartbeat fails.
- Downstream edge-function calls use the service key and carry job ID, engine code, and contract version headers.
- PNG output is limited to 5 MB. JSON output is parsed as an object, but no equivalent explicit response-body byte limit was found in the reviewed branch snapshot.
- Worker failures are recorded through `finish_engine_job`; a finish RPC failure stops the current processing loop.

## 4. Confirmed protections

- Tenant write authorization is enforced at enqueue, and job identity includes organization scope.
- Idempotency compares the full request identity rather than silently accepting a changed payload.
- Old or expired lease tokens cannot finish or heartbeat a job.
- Worker RPC privileges are restricted to the trusted backend role.
- Retries are bounded by the job's configured `max_attempts`.

## 5. Follow-up tests and hardening candidates

These are not declared defects until integration tests establish them:

1. **Concurrent claim:** two workers racing on one queued job must yield exactly one active lease.
2. **Expired lease fencing:** a worker with an old token must fail both heartbeat and finish after reclaim.
3. **Retry boundary:** the final allowed attempt must transition to terminal failed, not queued.
4. **Idempotency:** same key/same payload returns one job; same key/different payload rejects; different organizations remain isolated.
5. **Run ledger consistency:** every claim creates one run; retries close the previous run; finish updates exactly the run matching attempt and token.
6. **Payload and output bounds:** add explicit byte limits for enqueue payloads and downstream JSON responses before considering larger job volume.
7. **Worker decomposition:** extract pure interpreters and adapters into modules under contract tests before changing runtime orchestration.

## 6. Recommended implementation order

- First add SQL integration tests for claim/heartbeat/finish/idempotency using the disposable CI PostgreSQL database.
- Then add explicit payload/response limits with documented compatibility values.
- Only after tests are green, split the 2,154-line worker into queue orchestration, domain interpreters, external adapters, and result persistence.
- Populate engine health state only from real probes (dependency reachability, recent execution, and error rate), never from registry presence alone.

No production schema, rows, permissions, Edge Function, or secrets were changed during this review.

## 7. Additional concurrency finding — lock order inversion

A read-only comparison of the active PostgreSQL definitions found a potential deadlock window:

- `claim_engine_job` locks the selected `engine_jobs` row first (`FOR UPDATE OF j SKIP LOCKED`), then inserts or updates its `engine_job_leases` row.
- `finish_engine_job` locks the `engine_job_leases` row first (`FOR UPDATE`), then locks the corresponding `engine_jobs` row (`FOR UPDATE`).

These opposite lock orders can deadlock around lease expiry: a claim that observes an expired lease can hold the job row while waiting for the lease row, while a finish call that began just before expiry can hold the lease row while waiting for the job row. PostgreSQL will abort one transaction with a deadlock error; the worker should treat that as a retryable transaction failure, not as successful completion.

There is a related fencing concern in `finish_engine_job`: `v_now` is captured once at function entry, before waiting on row locks. Its lease predicate checks `expires_at > v_now`, so a finish transaction that waits can potentially acquire the lease lock and proceed after the wall-clock expiry, provided its entry timestamp was still before expiry. The lease should be revalidated after acquiring the relevant locks using a fresh `clock_timestamp()`.

**Recommended correction (not yet applied):** standardize both claim and finish to lock `engine_jobs` before `engine_job_leases`, then re-check token ownership and expiry after lock acquisition. Preserve atomicity across job, lease, and run rows. Add a two-session PostgreSQL integration test that races finish against reclaim at the expiry boundary and asserts: no deadlock, at most one current token, and no stale-token finalization.

This is a source-level concurrency risk identified from the deployed function definitions, not a reproduced production incident. No production RPC was changed.
