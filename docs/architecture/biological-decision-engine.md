# Biological Decision Engine v0.1.0

## Responsibility

The decision engine consumes a persisted biological assessment and an explicitly supplied reviewed decision policy. It emits an explainable decision candidate; it does not diagnose an organism, alter a measurement, publish a rule, notify a user or execute an intervention.

## Input contract

- A persisted assessment ID, organization ID, domain and exact biological rule-version ID are mandatory.
- A reviewed policy must belong to the same organization and domain and reference the exact rule version used by the assessment; a policy cannot spill over to another tenant or a later rule revision.
- Only recognized assessment states are accepted.
- The assessment provenance must be a client-engine result that has not been independently recomputed by the server.
- The first trigger implemented is the explicit `out_of_range` assessment state. Other states are not silently interpreted as biological alerts.
- A policy must be reviewed, belong to the active domain, explicitly include the trigger state, include a reviewer and timestamp, and cite at least one source.

## Resolution behavior

- No policy: `decision_not_configured`.
- More than one matching policy: `ambiguous_decision_policy`; no ranking or tie-break.
- Exactly one matching reviewed policy: `decision_candidate`, carrying its reviewed title, explanation, severity and recommended action as authored.
- A non-triggering assessment: `no_decision_candidate`.
- Missing or unrecognized assessment evidence: `insufficient_evidence`.

Policy-authored severity and recommended action are never inferred by the engine. No default threshold, severity, intervention, notification or automatic action exists. The result always states `automatic_action_taken = false`.

## Trust boundary

This is a pure deterministic module. It does not query the database or persist decisions. The tenant-scoped `biological_decision_policies` read adapter now supplies reviewed policies bound to the same organization, domain and exact biological rule-version ID as the assessment. Client-side policy evaluation is not server verification and must not be represented as such. Policy creation, review and retirement are available in the Mycology and Laboratory workspaces. The assessment history can display a decision candidate from the matching reviewed policy. This display is a fresh client-side evaluation of persisted assessment evidence; it is not a persisted decision event, independent server verification or an intervention record. A durable decision-event history and server-side recomputation remain separate increments.

## Non-goals

- No automatic diagnosis or causal attribution.
- No environmental forecasts or OSINT claims.
- No default agronomic or mycological thresholds.
- No automatic humidification, aeration, temperature adjustment, culture quarantine or other intervention.
- No GreenTech integration until a plant-specific decision model and adapter are reviewed.
