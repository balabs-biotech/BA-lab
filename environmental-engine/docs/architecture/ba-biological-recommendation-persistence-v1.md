# Biological recommendation persistence v1

## Scope

This contract persists the domain proposal and its human-review lifecycle. It
does not execute recommendations, control equipment, or establish biological
causality. The Python domain aggregate remains independent of Supabase.

## Existing tenant boundary

The live project uses `public.organizations` and
`public.organization_members`. Membership is keyed by
`(organization_id, user_id)`; roles are `owner | admin | member | viewer`.
Existing write authorization is expressed through
`private.is_org_writer(organization_id)`; membership/read access is separate
from write access.

The live `public.analyses` table has primary key
`(organization_id, id)`. The live `public.observations` table also has
primary key `(organization_id, id)`. These are valid tenant-scoped lineage
anchors.

There is no live `public.biological_signals` table and no live normalized
finding table identified in the current schema. The engine's finding UUID is
therefore a provenance identifier carried by the analysis output, not a
foreign-key target at this stage. The branch's future biological-signal
migration defines a separate signal inbox lifecycle (`open`, `acknowledged`,
`resolved`, `dismissed`). Recommendation review must not overload or mutate
that signal state.

The live `public.biological_contexts` table is tenant-scoped and links to
cultures, plant cultures and environments using organization-composite
foreign keys. Its primary key is currently `id`; do not assume it has the
composite primary key `(organization_id, id)` merely because its references
are tenant-scoped.

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
transaction. Add a composite foreign key to `analyses` using
`(organization_id, source_analysis_id)`. Do not add a foreign key to
`source_finding_id` until findings have an authoritative persisted table.
The feature-branch migration now defines the composite foreign key to
`biological_signals` on `(organization_id, source_signal_id)`. The signal
migration itself binds the source analysis and biological context to the same
tenant.

### `biological_recommendation_events`

Append-only history:

- `organization_id`, `recommendation_id`, `event_id`, `revision`;
- `action`, `actor_id`, `occurred_at`;
- `note`, `execution_details`, `outcome_summary`,
  `outcome_observed_at`.

Use a composite foreign key to the recommendation aggregate, a unique
constraint on `(organization_id, event_id)` for idempotency, and a unique
`(organization_id, recommendation_id, revision)` key to preserve exact append
order even when timestamps tie. Events must not
be updated or deleted by application roles. The event actor must be the
authenticated principal, not a browser-supplied identity.

## Atomic transition contract

A transition is a single database transaction:

1. Resolve the authenticated user with `auth.uid()`; reject null identity.
2. Verify `private.is_org_writer(organization_id)`.
3. Serialize event UUID reuse within the organization, then lock the
   tenant-scoped recommendation row (`FOR UPDATE`).
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
Protocol. `interpretation/supabase_recommendation_repository.py` implements it
using a service-role RPC for proposal creation and the caller's authenticated
client for reads and human transitions. `contexts/profile_persistence.py` now
loads the persisted `recommendations` JSONB into typed
`RecommendationDefinition` values, so profile-based resolution uses the same
versioned definitions that are stored in PostgreSQL. The adapter binds the supplied actor
UUID to the verified request context; PostgreSQL independently records
`auth.uid()`. The database owns authorization, transactionality, row locking,
idempotency, and mapping database conflicts to domain repository errors.
The pure `transition_recommendation` function remains useful for validating
the proposed transition before persistence, but the database must revalidate
against the locked persisted aggregate.

## Migration dependency correction

The live database currently has profile registries but no `biological_signals`
table. Its `biological_contexts` primary key is `id`, and the existing unique
key `(id, organization_id)` cannot satisfy a foreign key referencing
`(organization_id, id)`. The signal migration therefore now creates an explicit
unique key over `(organization_id, id, environment_id, domain)` and references
that exact tuple. It also binds `source_analysis_id` to the tenant-scoped
`analyses` key.

The repository migration versions for the four profile-registry migrations
now match the versions already recorded by Supabase (`20261111032007`,
`20261111032018`, `20261111032035`, and `20261111034000`). The earlier duplicate
table-creation migrations for biological contexts and environment registries
were removed because those tables already exist in the live baseline. Their
still-needed sensor-binding upgrade is now an additive migration against the
actual live schema.

The signal persistence, analysis-evidence and signal-lifecycle migrations have
been moved to versions after the live migration head `20261111043003`:
`20261111043100`, `20261111043200`, and `20261111043300`. This removes the
previous ordering where the signal table could be attempted before its profile
registry dependencies. A structural SQL test now checks these keys, grants and
RLS expectations.
The recommendation tables and RPCs follow as
`20261111043400_add_biological_recommendation_persistence.sql`. Structural SQL
tests cover the RLS/grant boundary, RPC execution grants, immutable proposal
snapshot, append-only event trigger, provenance FKs and event revision key.

The remaining feature migrations are ordered after that dependency chain:
`20261111043500` adds verified location altitude; `20261111043600` upgrades
the existing environment-profile sensor bindings and lifecycle guards;
`20261111043700`–`20261111043900` add lineage indexes and atomic multi-source
material creation; `20261111044000`–`20261111044100` add sensor-drift reference
policies and their writer-only read model. Migration `20261111044200` adds the
missing versioned `recommendations` JSONB field to
domain_interpretation_profiles and validates recommendation definitions against
the Python `RecommendationDefinition` contract. This closes the configuration
path from persisted profile to resolver without inventing definitions in code.

## Deployment gate

These migrations are committed to the feature branch only; none has been
applied to the live database. The repository versions for already-applied
profile migrations now match the live history, and all new migrations follow
the live head `20261111043003`. The Supabase project reports
`ACTIVE_HEALTHY`, but its development-branch status still reports
`MIGRATIONS_FAILED`. A disposable branch must replay the chain and run the SQL
contract tests before merge. Do not apply this schema directly to production
from this design document.

## Biological signal persistence

`interpretation/signal_service.py` now provides the application orchestration
for the first persistence stage: it interprets one analysis against the exact
supplied `DomainProfile`, validates the biological/environment binding, and
then calls `SupabaseBiologicalSignalRepository`. The adapter uses only an
injected trusted server-side client, maps the analysis, finding, observation,
biological subject/context and both profile versions into the database row,
and verifies that every generated signal can be read back. Large outputs are
written in bounded 500-row chunks to stay below the default PostgREST response
cap. A failed later chunk can be replayed: earlier inserts are idempotent and
existing triage state is never overwritten.

The database's natural idempotency key is used with conflict-ignore semantics.
A replay therefore does not overwrite operational triage state such as
`acknowledged` or `resolved`. A replay whose natural provenance key resolves
to a different signal UUID fails closed during read-back verification.

The current schema deliberately keeps `source_finding_id` as a provenance
value rather than a foreign key because findings have no normalized persisted
table. Observation identifiers remain in JSONB as a stable snapshot and are
also normalized into `biological_signal_observations`; its composite foreign
key to `observations(organization_id, id)` proves tenant ownership. An
AFTER INSERT trigger creates those evidence links in the same transaction as
the signal insert. The signal table also enforces tenant-scoped foreign keys
to the analysis, biological context, domain profile and environment profile.
A future normalized finding store should add a composite tenant foreign key
after its canonical schema is established.

`BiologicalSignalService.interpret_and_persist` is the application entry point
for this stage. `BiologicalWorkflowService.run` then sequences that verified
signal persistence before recommendation resolution and persistence, returning
the interpretation, stored signals, resolution and stored recommendation
aggregates as one application result. The stages remain independently
injectable and testable.

The private FastAPI analysis boundary now returns a
`recommendation_resolution` alongside the biological interpretation. Both
authenticated Supabase gateways (daily NASA POWER and IoT sensor analysis)
resolve the recommendation definitions from the tenant-scoped versioned
profile registry, persist signal rows first, then call the restricted
`create_biological_recommendation` RPC for each proposal. The gateway verifies
that every proposal points to a signal from the same response and matches its
analysis, finding, recommendation code and profile version before the RPC.
Withheld proposals are persisted as audit records; no recommendation is
automatically executed. Each RPC call is atomic and idempotent, while a batch
of proposals is intentionally replayable rather than one cross-proposal
transaction.

## Application orchestration

`RecommendationService` coordinates the pure lifecycle transition with the repository port:

Proposal persistence is exposed through `RecommendationService.create`,
`persist_resolution`, and `resolve_and_persist`. The last method resolves only
against the exact versioned `DomainProfile`, then persists proposed and withheld
results alike. Source biological signals must already exist; the database
checks their analysis, finding and profile lineage before accepting each
proposal. Proposal IDs are deterministic; the create RPC returns the existing
aggregate and its complete event history for an identical replay, and rejects
reuse with different immutable content. A resolution batch is a sequence of
individually atomic creates, not one cross-proposal transaction; an interrupted
batch can therefore be safely replayed.

A human lifecycle transition follows this sequence:

1. Load the aggregate by `(organization_id, recommendation_id)`.
2. Return a not-found result scoped to that organization when absent.
3. Apply the domain transition and construct one immutable event.
4. Call `append_event` with the revision observed during the load.
5. The transition RPC returns the committed recommendation and complete
   revision-ordered event history in the same transaction; the adapter does
   not perform a second read that could race with another writer.
6. Propagate a revision conflict unchanged. The service must not retry by
   silently applying the same human decision to a newer state.

The service receives the actor identifier from the authenticated server request context. This value is descriptive event data, not an authorization credential: the concrete repository/RPC must independently compare it with `auth.uid()` and reject mismatches. A client must never be able to choose the actor recorded in the audit trail.

## Required persistence test matrix

The database adapter is not complete until a disposable database verifies:

- member read access is restricted to the member's organizations;
- viewer reads succeed but lifecycle mutations fail;
- owner/admin/member can mutate only within their own organizations;
- anonymous execution and direct client writes are denied;
- event actor is derived from `auth.uid()` and mismatched actor input is rejected;
- stale `expected_revision` produces a conflict without changing either row;
- a successful transition inserts exactly one event and increments revision once;
- event UPDATE/DELETE is denied to application roles;
- identical proposal ID replay returns the existing aggregate and history, while conflicting proposal reuse fails;
- identical event UUID replay is idempotent, while conflicting payload reuse fails;
- source analysis foreign keys cannot cross organization boundaries;
- proposal provenance cannot be changed after creation.

Unit tests cover profile-definition hydration, proposal creation/replay reconstruction, service orchestration and conflict propagation. They do not substitute for the PostgreSQL/RLS tests.
