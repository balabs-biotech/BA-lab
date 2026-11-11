# BAL-Normalizer

Status: experimental deterministic component, v0.1.0.

## Responsibility

BAL-Normalizer assesses whether a raw numeric measurement can be represented in the variable's configured canonical unit using only the controlled `variables` and `units` catalogues.

It is a pure transformation: it does not access Supabase, mutate records, create catalogue entries, or write normalized values. The caller remains responsible for persisting a result and its provenance.

## Input

- `rawValue`: finite JavaScript number; strings and implicit coercion are rejected.
- `rawUnitCode`: exact code from `public.units`.
- `variable`: exact catalogue variable including `dimension` and `canonical_unit_code`.
- `units`: catalogue rows including `code`, `dimension`, `factor`, `offset_value`, and `is_linear`.

## Output

- `already_canonical`: identity; raw value is already in the canonical unit.
- `normalized`: deterministic factor-ratio conversion.
- `blocked`: conversion cannot be justified from the current catalogue.

The raw measurement is always preserved by the caller. The normalizer never treats missing values as zero and never performs fuzzy matching.

## Conservative policy

For non-identity conversions, v0.1.0 requires equal dimensions, positive finite factors, both units marked linear, and zero offsets. It explicitly blocks temperature conversions and all non-linear conversions. This is intentional: the current catalogue has temperature units with insufficient offset metadata (for example K and degC both have factor 1 and offset 0), so converting them would silently create scientifically false values. pH remains an identity-only scale.

No result from this module is yet automatically persisted by BAL-JSON ingestion. Automatic normalization requires separate catalogue audit, reviewed tests and an explicit provenance/version policy.

## Verification

Run:

```sh
node scripts/test-bal-normalizer.mjs
```


## CultureOps preview integration

The Mycology and Laboratory workspaces load this module before the BAL-JSON import client. The tracker exposes read-only snapshots of the authenticated workspace's already-loaded `variables` and `units` catalogue rows, including `factor`, `offset_value`, and `is_linear`.

During local preview only:

1. BAL-JSON's raw `variable_code`, `raw_value`, and `raw_unit_code` are matched exactly to the loaded catalogue.
2. BAL-Normalizer returns an advisory conversion assessment.
3. The preview labels any result as proposed and not saved.
4. The import request remains the original BAL-JSON record. It never receives `normalized_value` or `normalized_unit_code` from this preview.

If the normalizer script or catalogue is unavailable, raw import remains possible after the server's authoritative contract and catalogue checks. This fallback does not imply that a conversion was performed.

The import UI tests execute the actual shared normalizer module, rather than a copied test implementation.


# Biological Interpreter

Status: experimental deterministic component, v0.1.0.

## Responsibility

The Biological Interpreter evaluates a single measurement against an explicitly supplied, reviewed rule. It does not generate biological thresholds, infer optimal conditions from species names, diagnose contamination, or convert units.

## Required evidence

- A finite `assessed_value` and exact `assessed_unit_code` already expressed in the rule's unit.
- An exact `variable_code` match.
- A culture context identifier.
- A rule identifier and version, plus explicit finite minimum and maximum bounds.
- Any context selectors declared by the rule (currently culture, strain, growth stage, medium and environment).

The caller must resolve the measurement's unit before assessment. A unit mismatch is not silently converted.

## Outcomes

- `normal`: within the supplied inclusive range.
- `out_of_range`: outside the supplied inclusive range.
- `insufficient_context`: required measurement, context or reviewed rule is absent or invalid.
- `not_assessed`: variable, unit or declared context does not match the supplied rule.

Every result includes engine version, rule ID/version, a compact evidence snapshot and `raw_measurement_modified: false`. The component is pure and does not access Supabase or write interpretations into BAL-Core.

## Important boundary

CultureOps does not yet have a validated, versioned library of biological operating ranges for all strains, media and growth stages. Therefore this first slice is an execution kernel only. Without an explicitly supplied reviewed rule, it returns `insufficient_context`; it never invents a temperature, humidity, pH or growth target.

## Verification

```sh
node scripts/test-biological-interpreter.mjs
```


## Biological Rule Registry

The companion `shared/biological-rule-registry.js` validates rule records before they can be used by the interpreter.

A rule carries a stable `rule_id`, semantic `version`, lifecycle `status` (`draft`, `reviewed`, `retired`), biological target, variable/unit, explicit bounds, source citations and review metadata. A target must identify at least a taxon or a strain. Reviewed rules require a reviewer identifier and timestamp.

Only structurally valid rules whose status is exactly `reviewed` are executable. Draft and retired rules remain valid registry records but cannot produce biological assessments. The registry checks metadata completeness; it does not authenticate citations, verify the scientific conclusions, or replace expert review.

Run:

```sh
node scripts/test-biological-rule-registry.mjs
node scripts/test-biological-interpreter.mjs
```


## Biological Rule Schema

The versioned contract is defined at `schemas/biological-rules/v1/rule.schema.json` (Draft 2020-12). The included fixture is deliberately `draft` and uses placeholder identifiers and bounds; it is not a biological recommendation.

The schema constrains the record shape, target, source provenance and reviewed metadata. The registry performs the additional cross-field check that `min <= max` and is the execution gate. Schema validity alone never makes a rule executable. The `reviewed` lifecycle state requires reviewer metadata, and only the registry's reviewed-only gate permits interpretation.

Run:

```sh
node scripts/test-biological-rule-schema.mjs
```


## Biological Rule Resolver

`shared/biological-rule-resolver.js` performs exact-match selection across the supplied rules. It filters by domain, variable and unit, then requires every declared biological target and context selector to match. It never ranks strain-specific rules above taxon-level rules: if two reviewed rules match, the result is `ambiguous_rule` and no rule is selected.

Possible outcomes are `matched_rule`, `ambiguous_rule`, `insufficient_context` and `no_matching_rule`. Only the registry's structurally valid `reviewed` rules are candidates. The resolver is pure and does not query Supabase; the caller must supply rules and context from an authorized, trusted source.

Run:

```sh
node scripts/test-biological-rule-resolver.mjs
```


## Biological Context Adapter and Loader

`shared/biological-context-adapter.js` maps a supplied BAL-Core snapshot into the exact context keys consumed by the resolver and interpreter. It uses the current culture's material reference, material strain reference, organism taxonomy identifier and environment reference. It does not infer a growth stage or medium from free text, timestamps, protocol labels or unstructured metadata.

`shared/biological-context-loader.js` reads that snapshot from Supabase using the authenticated workspace client. Every organization-scoped read filters by the active `organization_id`; the global organism catalogue is read by exact organism ID. It delegates all mapping and relationship checks to the adapter. It performs no writes and does not use a service-role credential.

The Mycology and Laboratory entry points load both modules. The tracker exposes `window.BA_LABS_LOAD_BIOLOGICAL_CONTEXT(cultureId)`, which captures the active organization and authentication revision, then discards a result if the workspace changes during the request.

### Context limitations

The current BAL-Core schema provides structured culture, material, strain, organism and environment links. It does not provide a first-class growth-stage or culture-medium field on `cultures`. Those selectors remain absent from the generated context and any rule requiring them must remain unassessed until those data are explicitly captured. A partial context is not treated as a complete biological profile.

Run:

```sh
node scripts/test-biological-context-adapter.mjs
node scripts/test-biological-context-loader.mjs
```


## Biological Assessment Engine

`shared/biological-assessment-engine.js` is the orchestration layer. It passes the supplied domain, measurement variable/unit, BAL-Core context and candidate rules to the exact-match resolver. It calls the interpreter only when exactly one executable reviewed rule matches. Ambiguous rules, missing context and unit mismatches stop before interpretation.

The Mycology and Laboratory workspaces load the registry, resolver, interpreter, assessment engine, context adapter and context loader. The tracker exposes:

- `window.BA_LABS_LOAD_BIOLOGICAL_CONTEXT(cultureId)`
- `window.BA_LABS_ASSESS_BIOLOGICAL_MEASUREMENT({ cultureId, measurement, rules })`

The caller must supply a candidate rule set. This change does not add a database table or publish biological thresholds. It does not automatically assess measurements on page load, convert units, persist assessments or modify source records. An assessment is currently an explicit, read-only operation invoked by another feature or developer console.

Run:

```sh
node scripts/test-biological-assessment-engine.mjs
```


## Biological Rule Store v1

The tenant-scoped store is introduced by `supabase/migrations/20261111170000_add_biological_rule_store.sql`. It stores immutable, versioned rule snapshots in `public.biological_rules`; the JSON rule remains the interchange representation defined by `schemas/biological-rules/v1/rule.schema.json`. Indexed columns mirror rule identity, lifecycle, domain and variable/unit codes so reads remain selective and auditable.

Security model:

- Authenticated organization members can read only their own organization's rule records.
- Only organization owners/admins can create or modify draft records.
- A transition to `reviewed` requires the authenticated reviewer ID in the embedded review metadata; the database records the reviewer UUID and timestamp.
- Reviewed and retired versions cannot be updated or deleted. A new version is inserted instead.
- To retire a rule, insert a new `retired` version with the same `rule_id`; the store treats the newest reviewed/retired version as authoritative and suppresses older reviewed versions when the newest is retired.
- The global scientific catalogue is not mixed into tenant data. Cross-organization publication is a separate governance decision.

`shared/biological-rule-store.js` loads reviewed versions for the active organization and exact domain/variable/unit tuple. It selects the newest lifecycle version per `rule_id`, excludes retired rules, and rejects malformed or column/JSON-inconsistent records. It never searches another organization and has no write API.

CultureOps now loads this store in Mycology and Laboratory. If a caller does not explicitly pass a rule array to `BA_LABS_ASSESS_BIOLOGICAL_MEASUREMENT`, the tracker fetches executable rules from the active tenant's store. The operation is read-only; rule authoring and approval UI are not part of this slice.

Run:

```sh
node scripts/test-biological-rule-store.mjs
```


### Biological Rule Authoring API

`shared/biological-rule-authoring.js` adds the write lifecycle without exposing privileged credentials:

- `createDraft`: validates and inserts a draft under the active organization. RLS limits writes to organization owners/admins.
- `reviewDraft`: retrieves one exact draft, obtains the authenticated Supabase user, adds reviewer identity and server-generated review timestamp, then performs a conditional draft-to-reviewed update. The database trigger independently verifies the reviewer identity and freezes the reviewed version.
- `retireRule`: inserts a new `retired` version from an executable reviewed rule. It does not modify the historical reviewed version.

CultureOps exposes these operations through:

- `window.BA_LABS_CREATE_BIOLOGICAL_RULE_DRAFT(rule)`
- `window.BA_LABS_REVIEW_BIOLOGICAL_RULE_DRAFT({ ruleId, version, reviewNote })`
- `window.BA_LABS_RETIRE_BIOLOGICAL_RULE({ rule, newVersion })`

These are application APIs, not yet a visible rule-management screen. The database remains the authorization and immutability boundary; client-side validation is only an early rejection layer. The rule authoring tests exercise the draft, review and retirement transitions.
