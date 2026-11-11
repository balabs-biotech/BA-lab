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
