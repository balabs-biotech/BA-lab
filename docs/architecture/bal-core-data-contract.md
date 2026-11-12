# BAL-Core — data integrity and scientific normalization contract

## Purpose

BAL-Core is the deterministic boundary between incoming biological records and BA Labs' persistent data model. It does not make biological diagnoses. It validates structure, provenance, traceability, units and quality state before a record can be used by analytical engines.

## Responsibility boundaries

- **CultureOps (TypeScript):** data entry, previews, workflow orchestration and user feedback. Client validation is advisory only.
- **Supabase Edge Functions:** authenticated ingress, payload limits, JSON Schema validation, organization authorization, catalogue lookup and calls to atomic database functions.
- **PostgreSQL:** canonical persistence, relational integrity, row-level security, idempotency and immutable event history.
- **BAL-Core (shared deterministic rules):** server-side validation and unit normalization, beginning with the shared helper in `supabase/functions/_shared/measurement-normalization.ts`. It must not bypass database authorization or become a second persistence layer.
- **Python analytical engines:** statistical analysis, time-series processing, environmental data fusion and model execution. They consume validated records and return versioned outputs.
- **Specialized engines:** mycology, laboratory, GreenTech and environmental intelligence. Each is replaceable and isolated behind versioned input/output contracts.

## Canonical measurement contract

A measurement has two distinct value representations:

1. **Raw observation:** `raw_value`, `raw_unit_code`, `measured_at`, method and instrument. These describe what was actually observed and must never be silently overwritten.
2. **Normalized value:** `normalized_value`, `normalized_unit_code`. This is a derived representation in the variable's canonical unit and must be reproducible from the raw observation and a versioned unit catalogue.

The variable catalogue (`public.variables`) supplies the dimension and `canonical_unit_code`. The unit catalogue (`public.units`) supplies the dimension, factor, offset and linearity.

The first shared deterministic implementation now lives in `supabase/functions/_shared/measurement-normalization.ts` and is used by BAL-JSON ingestion. The Kelvin catalogue offset is corrected by migration `20261112010000_correct_kelvin_unit_offset.sql`; regression tests assert that 273.15 K normalizes to 0 °C. Client-provided normalized values are checked against the server-computed result.

For linear units with a verified catalogue mapping, the intended conversion is:

`base_value = raw_value * raw_unit.factor + raw_unit.offset_value`

`normalized_value = (base_value - canonical_unit.offset_value) / canonical_unit.factor`

The normalized unit must equal the variable's canonical unit. Both units must share the variable dimension, both factors must be non-null, and the canonical factor must be non-zero.

**Non-linear dimensions are not converted by this formula.** pH is the current explicit example: retain the raw pH reading and canonical pH unit; do not apply a linear conversion.

Temperature catalogue entries require particular care. Migration `20261112010000_correct_kelvin_unit_offset.sql` sets the Kelvin offset to -273.15 for the Celsius-based temperature dimension. Regression coverage checks 273.15 K → 0 °C. A unit dimension match alone is not proof of a valid conversion; the factor, offset and linearity flags must also be valid.

## Ingestion invariants

- Accept only known record types and a supported contract version.
- Validate the complete record against the JSON Schema on the server.
- Require an authenticated user and an organization membership check.
- Require a traceability anchor: culture, plant culture or batch.
- Verify that the referenced context belongs to the same organization.
- Resolve variable and unit codes from the canonical catalogue.
- Never trust a client-supplied normalized value without recomputing and comparing it server-side.
- Preserve provenance, method, instrument, timestamps and external source metadata.
- Store imported records as raw; review/approval is a separate controlled transition.
- Enforce idempotency using organization + record ID + payload hash.
- Reject a reused record ID when its payload hash differs.
- Never let an AI-generated interpretation overwrite raw measurements or observations.

## Interpretation result contract

Analytical engines must return a separate result object, not mutate the source record. Each result must include:

- `engine_id` and semantic `engine_version`
- a separate immutable `engine_execution_results` record linked to the execution ledger, with queryable outcome, structured value, limitations, quality flags, optional calibrated confidence, provenance and immutable input snapshot references
- `input_record_ids` or a stable input-set hash
- `generated_at`
- `result_type` and structured `result`
- `confidence` only when the method supports a calibrated confidence measure
- `limitations` and `quality_flags`
- `provenance` identifying algorithms, datasets and external sources

An engine may return `insufficient_data`, `out_of_domain` or `review_required`. It must not fabricate a numeric confidence score when none is defensible.

## Failure isolation

A failed satellite provider, weather source, Python package, model or specialized engine must not prevent CultureOps from recording a manual observation or viewing existing batches. Each engine has an explicit status, bounded timeout, retry policy and error envelope. Raw data persistence remains independent from derived analysis.

## Delivery sequence

1. Version and test BAL-JSON schemas.
2. Complete authenticated ingestion and tenant/context validation.
3. Establish a tested unit-conversion catalogue and server-side normalization.
4. Publish the BAL-Core contract and shared test fixtures.
5. Add engine input/output envelopes.
6. Connect one analytical engine at a time, starting with deterministic environmental time-series quality checks before biological inference.

## Current implementation boundary

BAL-JSON v1 schemas, the authenticated Edge Function and the atomic PostgreSQL receipt/RPC exist in the repository. The browser import adapter is being connected to Mycology and Laboratory. This does not yet establish that production Supabase has the function deployed or that all external records have been tested end-to-end.
