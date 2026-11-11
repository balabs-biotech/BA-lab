# Biological assessment evidence history

## Scope

The assessment-history path is enabled only in the Mycology and Laboratory workspaces. GreenTech remains outside this interpreter until it has a plant-specific context adapter and reviewed rules.

## Flow

1. The user explicitly requests an assessment from a persisted measurement.
2. CultureOps reloads the measurement by both organization and measurement ID. Excluded measurements are refused.
3. BAL-Core context is loaded from structured culture/material/strain/organism/environment links. Missing growth stage or medium is not inferred from notes.
4. The rule resolver loads the latest reviewed lifecycle record for the exact domain, variable and unit. Ambiguous or missing rules do not produce a range verdict.
5. The interpreter calculates a result without mutating the raw measurement.
6. The authenticated client submits the evidence to `record_biological_assessment`.
7. The database checks tenant membership, source measurement identity and raw value, and the current reviewed rule-version reference before appending the record.
8. History is read-only to authenticated organization members. Database triggers reject updates and deletes.

## Evidence and trust boundary

Each record preserves:
- source measurement ID and an exact raw measurement snapshot;
- organization, domain and structured culture context snapshot;
- resolver output and the selected immutable rule-version ID, if any;
- interpreter result, reason and engine version;
- actor and server timestamp.

The record explicitly stores `calculation_origin = client_engine` and `server_verification = not_recomputed`. The database validates provenance and references; it does **not** independently recalculate the biological conclusion. A result must not be presented as a server-verified biological finding.

## Append-only and retry semantics

Each evaluation attempt has a client-generated UUID idempotency key. Retrying the same request returns the existing record only if all evidence fields match. Reusing the key with a different payload fails. A later deliberate evaluation uses a new key and appends a new record, preserving the history across rule revisions.

## Non-goals

- No automatic biological diagnosis or recommendation.
- No inferred thresholds, growth stage, medium or strain identity.
- No modification of source measurements.
- No direct writes from external AI tools.
- No automatic publication of rules.
- No live database migration or deployment as part of this branch work.

## Operational requirements

Apply migrations through the reviewed deployment process. Run migration replay, assessment store/UI tests and SQL security-contract tests in CI before merging. Reviewed rules must be authored and approved by qualified BA Labs personnel with evidence sources and a review note.
