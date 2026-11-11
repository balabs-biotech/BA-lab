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
