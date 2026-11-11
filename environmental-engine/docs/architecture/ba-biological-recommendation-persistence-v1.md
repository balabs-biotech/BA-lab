# Biological recommendation persistence v1

## Scope

This contract persists the domain proposal and its human-review lifecycle. It
does not execute recommendations, control equipment, or establish biological
causality. The Python domain aggregate remains independent of Supabase.

## Existing tenant boundary

The Supabase project uses `public.organizations` and
`public.organization_members`. Membership is keyed by
`(organization_id, user_id)`; the existing role enum is
`owner | admin | member | viewer`. Existing write authorization is expressed
through `private.is_org_writer(organization_id)`; membership/read access is
separate from write access.

The existing `public.biological_signals` table is not a recommendation
ledger. It stores interpreted signal snapshots and has its own inbox lifecycle
(`open`, `acknowledged`, `resolved`, `dismissed`). Recommendation review
must not overload or mutate that signal lifecycle.

## Aggregate storage model

Use two tenant-scoped tables, with composite tenant keys:

### `biological_recommendations`

One immutable proposal snapshot plus a mutable concurrency projection:

- `organization_id`, `recommendation_id` — composite primary key;
- `recommendation_code`, `profile_id`, `profile_version`, `module`;
- `source_signal_id`, `source_analysis_id`, `source_finding_id`;
- `instruction_code`, `rationale_code`;
- `proposal_status` (`proposed` or `withheld`);
- `withholding_reasons` (JSON array of stable reason codes);
- `lifecycle_status`, `revision`, `created_at`, `updated_at`.

The proposal fields and provenance are immutable after insert. Only the
lifecycle projection and revision may change, and only through the transition
transaction. A composite foreign key to `biological_signals` must include
`organization_id` and `source_signal_id`, preventing cross-tenant lineage.
The source analysis/finding identifiers remain provenance references unless
their authoritative composite-key constraints are confirmed.

### `biological_recommendation_events`

Append-only history:

- `organization_id`, `recommendation_id`, `event_id`;
- `action`, `actor_id`, `occurred_at`;
- `note`, `execution_details`, `outcome_summary`,
  `outcome_observed_at`.

Use a composite foreign key to the recommendation aggregate and a unique
constraint on `(organization_id, event_id)` for idempotency. Events must not
be updated or deleted by application roles. The event actor must be the
authenticated principal, not a browser-supplied identity.

## Atomic transition contract

A transition is a single database transaction:

1. Resolve the authenticated user with `auth.uid()`; reject null identity.
2. Verify `private.is_org_writer(organization_id)`.
3. Lock the tenant-scoped recommendation row (`FOR UPDATE`) or perform a
   revision compare-and-swap.
4. Compare stored `revision` with `expected_revision`; return a conflict
   instead of overwriting a concurrent transition.
5. Validate the action against the persisted lifecycle state and validate
   required execution/outcome fields and timestamps.
6. Insert the immutable event and update the lifecycle projection plus
   `revision = revision + 1` in the same transaction.
7. Return the new aggregate.

A repeated event UUID with an identical payload may return the already
committed result. Reuse of the UUID with a different payload is a conflict.
The transition function must not accept an arbitrary actor identity from the
client. The actor is resolved from the authenticated session.

## Access model

- Enable RLS on both tables.
- Authenticated organization members may read only rows for organizations in
  which they are members.
- Direct client INSERT/UPDATE/DELETE privileges are revoked. Do not expose
  mutation of proposal provenance or event history through PostgREST.
- Route writes through a narrowly scoped authenticated RPC or trusted
  application boundary. The RPC must check `auth.uid()` and
  `private.is_org_writer`; `TO authenticated` alone is insufficient.
- Do not grant anonymous access. Do not put a `SECURITY DEFINER` function in
  the exposed schema without an explicit privilege review, fixed search path,
  authenticated identity check, and restricted EXECUTE grants.
- Composite tenant foreign keys must be used for every tenant-owned reference.

## Python adapter boundary

`interpretation/recommendation_repository.py` defines the application-facing
Protocol. The adapter owns authorization, transactionality, row locking,
idempotency, and mapping database conflicts to domain repository errors.
The pure `transition_recommendation` function remains useful for validating
the proposed transition before persistence, but the database must revalidate
against the locked persisted aggregate.

## Deployment gate

This is a persistence contract, not an applied database migration. Before
writing DDL, verify the live production policies and exact composite keys for
the source signal, analysis, and finding tables. The current project migration
history is behind the latest repository branch migrations; do not apply this
schema directly to production from this design document.
