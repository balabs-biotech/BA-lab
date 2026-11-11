# BAL-JSON v1 — biological data interchange contract

Status: draft implementation, version 1.0.0  
Scope: first interoperable record types for quantitative measurements and qualitative observations.

## Purpose

BAL-JSON is the versioned interchange format shared by CultureOps, Green Tech, Laboratory, import tools and future analytical engines. It separates a stable transport contract from the internal PostgreSQL schema.

It is **not** a direct database-write API. A receiving adapter must authenticate the actor, authorize the organization, resolve referenced records, validate units and variable codes against the BA Labs catalogues, and then use the application's approved write path (including transactional RPCs where required).

## Files

- `record.schema.json`: common envelope, record discriminator and provenance.
- `measurement.schema.json`: quantitative values with raw and optional normalized value/unit.
- `observation.schema.json`: qualitative observations.
- `examples/`: canonical fixtures for implementers.

Schemas use JSON Schema Draft 2020-12. Schema identifiers are stable URNs; consumers should resolve them from the schema bundle rather than attempt to fetch them as web pages.

## Common envelope

Every record carries:

- `contract`: fixed identifier `BA-LABS/JSON`.
- `contract_version`: semantic contract version, currently `1.0.0`.
- `record_type`: `measurement` or `observation`.
- `record_id`: UUID of the interchange record; it is not automatically a database primary key.
- `organization_id`: tenant scope. A receiver must independently authorize it.
- `created_at`: RFC 3339 date-time with timezone.
- `data`: type-specific payload.
- `provenance`: source and optional acquisition/review metadata.
- `extensions`: optional namespaced extension objects; extensions cannot redefine core fields.

## Scientific semantics

1. Preserve the raw value and raw unit exactly as received. Normalized values are additional, never replacements.
2. A unit code and variable code must resolve against the BA Labs controlled catalogues. Matching strings alone do not establish dimensional compatibility.
3. Missing values are not zero. Do not synthesize zero, a negative result, or a default measurement when a field is absent.
4. Keep quantitative measurements separate from qualitative observations. A visual description must not be coerced into a numeric measurement without an explicit, documented method.
5. Preserve acquisition time (`measured_at` / `observed_at`) separately from record creation time (`created_at`).
6. Keep provenance. AI-assisted extraction is marked `ai_assisted` and remains unreviewed until a human or an explicitly authorized workflow reviews it.
7. Quality states describe data quality, not biological success. `excluded` measurements require an exclusion reason.
8. Context identifiers are references, not embedded copies of private records. The receiver must verify that each referenced object belongs to the stated organization. In v1, every record must be anchored by a culture, plant culture or batch because those are the supported anchors in the current atomic manual-write RPCs; environment/location alone, or a standalone material/sample/experimental-unit reference, is insufficient.
9. The workspace/domain label belongs in metadata or a namespaced extension; it does not replace biological context.
10. Do not put credentials, access tokens, private keys, or secrets in a record.

## Mapping to the current BAL-Core model

| BAL-JSON | Current data model |
| --- | --- |
| `organization_id` | `organization_id` on tenant-scoped tables |
| `record_type=measurement` / `data` | `measurements` plus its linked `events` record |
| `record_type=observation` / `data` | `observations` plus its linked `events` record |
| `variable_code` | `variables.code` |
| `raw_unit_code`, `normalized_unit_code` | `units.code` |
| `quality_state` | `quality_state` enum |
| `context` | Existing culture, plant culture, material, sample, experimental unit, batch, environment and location references |
| `provenance` | Acquisition details; adapter maps actor and source details to events/provenance as appropriate |

The mapping is intentionally adapter-based. BAL-JSON must not force a one-to-one database layout or require every domain to have identical tables.

## Versioning policy

- Patch: clarify descriptions or correct schema metadata without changing accepted payloads.
- Minor: add optional fields or record types while preserving existing v1 payloads.
- Major: remove/rename fields, change required fields, or alter scientific meaning.
- Unknown core fields are rejected in v1. Optional extension payloads must be namespaced.
- A receiver must reject unsupported major versions and report the reason; it must not silently reinterpret data.

## Current boundaries / next steps

This first slice defines only measurements and observations. It does not yet define culture creation, strain/genetic lineage, experiments, protocols, environmental time series, analytical claims, evidence graphs, or device telemetry. Those are subsequent contracts and must be based on their existing authoritative schemas.

Before production ingestion, add a full Draft 2020-12 validator in the application boundary and test UUID/date-time formats, reference resolution, tenant isolation, unit dimensions, duplicate/replay handling, and round-trip preservation. The current repository test is a structural guard for the checked-in contract files; it is not a substitute for full JSON Schema validation.
