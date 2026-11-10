# Biological context persistence and CultureOps entity mapping

**Status:** Architecture decision record — approved for implementation planning, not yet a database migration  
**Scope:** Environmental Intelligence Engine biological context persistence  
**Branch:** `feat/environmental-source-contract-v1`

## Decision

Do not create a second biological registry for organisms, strains, cultures, plant cultures, materials, or production batches.

Persist a biological context as a **time-bounded association** between an existing CultureOps biological subject and an existing physical environment. The context stores only the operating facts that are not reliably represented by the subject record itself (stage during the interval, production system, substrate-at-the-time, explicit tags, and validity dates).

The existing subject remains authoritative for identity and lineage. The context is authoritative for the subject's operating conditions during a specific interval.

## Existing canonical entities found in migrations

| Existing table | Existing role | Environmental Engine mapping |
|---|---|---|
| `organizations` | Tenant boundary | `organization_id` |
| `locations` | Physical site / coordinates / altitude | `location_id`; altitude and coordinates stay here |
| `environments` | Named environment associated with a location | `environment_context_id` maps to `environments.id` |
| `organisms` | Taxonomic organism reference | Resolve taxon through `strains.organism_id` where applicable |
| `strains` | Tenant-scoped strain catalogue | Resolve fungal/microbial strain through material lineage |
| `materials` | Biological material and lineage | Derive strain and generation through `materials.strain_id`, parent material and relationships |
| `cultures` | General culture record, linked to material and environment | Canonical subject for Mycology and Lab |
| `plant_cultures` | Plant/crop/cultivar record, linked to location and environment | Canonical subject for GreenTech |
| `batches` | Production batch, optionally linked to culture, material, location and environment | Operational/production scope; do not duplicate as a new biological subject |
| `measurements`, `observations`, `events` | Existing biological observations and event traceability | Preserve and reuse their existing subject foreign keys |
| `environmental_observations` | Provider-sourced weather/satellite observations | Reuse as environmental source data; retain its six-column deduplication key |

## Subject resolution

The Python contract currently exposes `subject_id` without a database discriminator. The persisted representation must therefore make the subject table unambiguous:

- `domain = mycology` or `domain = lab`: `subject_id` resolves to `cultures.id`.
- `domain = greentech`: `subject_id` resolves to `plant_cultures.id`.
- Strain identity is not copied into a new strain table. Resolve it through `cultures.material_id -> materials.strain_id -> strains.id -> organisms.id`.
- Cultivar identity for GreenTech remains on `plant_cultures.cultivar_name`; a stable cultivar reference/code can be added to the existing catalogue later if needed, not recreated inside the Engine.
- A batch is an operational production unit. When it has a `culture_id`, resolve its biological subject through that culture. Do not assume every batch has a culture link: the current schema allows it to be null.

A future SQL table needs two explicit nullable subject foreign keys (culture and plant culture), with a CHECK requiring exactly one. This gives PostgreSQL real referential integrity; a polymorphic `subject_type + subject_id` pair without a foreign key is not acceptable for this relationship.

## Environment resolution

The Python `EnvironmentContext.context_id` maps to `public.environments.id`, not to a new `environment_contexts` table. The environment's `location_id` must match the biological subject's operational location where that subject type has a location field.

For cultures, the current `cultures.environment_id` is the existing environment association. For plant cultures, `plant_cultures.environment_id` is already present. A time-bounded biological context may override the current association for historical interpretation, but must not silently rewrite the source culture or plant-culture row.

## Persistence shape to implement after review

Proposed table: `public.biological_contexts`.

- Tenant key: `organization_id`.
- Context primary key: `id` (maps to Python `context_id`).
- Exactly one of `culture_id` or `plant_culture_id` (maps to Python `subject_id`).
- `environment_id` (maps to Python `environment_context_id`).
- `domain`, `organism_kind`, `culture_stage`, `production_system`.
- Optional `taxon_code`, `strain_code`, `cultivar_code`, `substrate_code`.
- `context_tags` as a JSON array of strings.
- `valid_from`, nullable `valid_to`.
- Composite tenant-scoped foreign keys to the existing subject and environment tables.
- CHECK constraints for exactly one subject reference, valid date range, and domain/subject compatibility.
- RLS using `private.is_org_member(organization_id)`; client write privileges must be considered against the existing trusted-backend and role-aware write policies.
- Indexes on tenant + subject + validity and tenant + environment + validity.

The persisted row's `location_id` should be derived from the linked environment or existing subject, not stored as a second independently editable location value. The Python contract may continue carrying `location_id` for validation and analysis scope binding.

## Important implementation gaps

1. The current Python `BiologicalContext` has no `subject_type`; domain currently acts as the discriminator. The SQL mapping above is consistent with that, but the API boundary must resolve and validate the corresponding table before constructing the model.
2. The current Python `environment_context_id` maps to `environments.id`; the database has no separate versioned environment-context table. Profile version and timezone in the Python model are not currently persisted by `public.environments`. Decide whether these belong in environment metadata or a later versioned environment-profile table before claiming full round-trip parity.
3. `plant_cultures` uses free-text `species_name` and `cultivar_name`; it does not currently reference `organisms` or a cultivar catalogue. Do not pretend those strings are stable taxonomy identifiers.
4. `batches` may have nullable `culture_id`. A batch-only biological context needs a deliberate domain resolution rule before it can be added to the subject FK model.
5. `public.environmental_observations` is separate from manual `measurements` and IoT telemetry by design. Keep those provenance classes separate.

## Non-goals

- No duplicate organisms, strains, cultures, batches, plant cultures, or environments.
- No automatic stage, strain, cultivar, or substrate inference from environmental data.
- No default biological thresholds or recommendations.
- No production migration, schema mutation, or deployment in this decision record.

## Next implementation sequence

1. Add a typed database-subject resolver for culture vs plant culture, enforcing tenant ownership and domain compatibility.
2. Add migration and SQL tests for the time-bounded association table, composite tenant foreign keys, CHECK constraints, RLS and role-aware write policy.
3. Add repository/service persistence adapters that translate database rows to/from the existing Python `BiologicalContext` contract.
4. Add integration tests for tenant isolation, historical validity, subject deletion behavior, environment mismatch, and round-trip mapping.
5. Only then connect the persisted context to domain interpretation and the GreenTech/Mycology/Lab interfaces.


## Implementation status — 2026-11-10

The first persistence slice is now present on the feature branch:

- Migration: `supabase/migrations/20261110160000_add_biological_contexts.sql`.
- SQL contract test: `supabase/tests/biological_contexts_contract.test.sql`.
- Python row mapper: `environmental-engine/src/ba_environmental_engine/contexts/persistence.py`.
- Python mapper tests: `environmental-engine/tests/test_biological_context_persistence.py`.

The SQL table stores either `culture_id` or `plant_culture_id`, plus `environment_id`. It does not duplicate `location_id`; an insert/update trigger rejects environments without a physical location. A second trigger prevents changing or clearing an environment's location once a biological context references it, preserving historical scope binding. Tenant-scoped composite foreign keys enforce subject and environment ownership. Reads require organization membership; writes require the existing `private.is_org_writer` policy, so viewer accounts remain read-only.

The Python mapper accepts a row with the PostgREST relation alias `environment` containing `location_id`. It maps the typed database subject FK to the model's `subject_id` and resolves the model's `location_id` from that joined environment. The reverse mapper emits database columns only and deliberately omits the derived location and generic subject ID.

CI was extended to:
- replay the migration chain and execute the biological-context SQL contract test;
- run the Environmental Engine pytest suite on Python 3.10 and 3.12.

**Validation state:** these tests have been added to CI but have not yet been observed running on the latest branch commit. No migration has been applied to the production Supabase project.


### Repository adapter — 2026-11-10

The repository layer is now implemented in `contexts/persistence.py` as
`SupabaseBiologicalContextRepository`. It receives an already-authenticated
Supabase client by dependency injection; it does not create clients or load
credentials.

Supported operations:

- `get_by_id`: tenant-scoped lookup by organization and context UUID.
- `list_for_subject`: tenant/domain/typed-subject lookup, with optional
  application-side validity-date filtering.
- `create`: insert through the row mapper and return the joined environment.
- `update`: update by tenant + context UUID; the payload cannot reassign the
  primary key or organization.

The joined location uses the explicit FK relationship
`biological_contexts_environment_fk`, avoiding an ambiguous implicit relation.
PostgreSQL RLS remains the security boundary; explicit tenant predicates are
defense-in-depth, not a replacement for RLS.

Mock-client tests cover tenant/subject filters, validity filtering, explicit
relationship selection, and immutable tenant/primary-key fields during update.
They are written but have not been executed in this environment.
