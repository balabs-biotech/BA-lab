# Culture lineage performance decision

Date: 2026-11-09
Status: **Defer closure-table implementation; retain the adjacency list as the canonical source of truth.**

## Context

The current lineage model is `public.cultures.parent_culture_id`. PR #266 adds a tenant-scoped recursive read RPC and an index on `(organization_id, parent_culture_id)`. The RPC bounds returned descendants, but exact descendant totals and deterministic depth ordering still require traversing and ranking the reachable descendant set.

A closure table could accelerate repeated ancestor/descendant reads, but it would duplicate lineage state and introduce a consistency obligation.

## Write-path audit

The repository contains at least two independent culture creation paths:

1. `public.create_culture_with_generation(...)` creates a culture and accepts an optional `p_parent_culture_id`.
2. `public.record_biological_operation(...)` creates one or more descendant cultures with `parent_culture_id = v_parent.id`.

The schema also defines a `cultures_no_cycle` trigger for inserts and parent changes. Existing policy/test definitions show organization-scoped direct INSERT and UPDATE access on `public.cultures`; therefore, an RPC-only closure-table update would not cover every permitted write path.

No dedicated parent-reassignment workflow was identified in the inspected code, but direct UPDATE policy means reassignment cannot be ruled out.

## Decision

Do **not** add a closure table in the current lineage-read PR.

Keep `cultures.parent_culture_id` authoritative. The current recursive RPC remains the correct low-risk first implementation while real dataset size and query plans are not yet measured.

## Requirements before reconsidering a closure table

- Maintain closure rows transactionally for every INSERT and every change of `parent_culture_id`; a database trigger is required unless direct DML is first removed and all writes are forced through a single controlled mutation API.
- Handle subtree reparenting correctly: remove obsolete ancestor-to-descendant paths and insert the new paths for the entire subtree.
- Enforce organization isolation in keys and foreign keys; clients must not write closure rows directly.
- Backfill existing cultures deterministically and provide a reconciliation query that compares closure rows with a recursive reconstruction from the canonical parent links.
- Preserve cycle prevention and add tests for root creation, child creation, deep descendants, reparenting, cross-organization isolation, rollback, and concurrent parent changes.
- Benchmark the recursive RPC against the closure-table query on representative synthetic datasets before choosing the added write complexity.

## Immediate performance follow-up

Before introducing duplicated lineage state, measure the existing RPC with `EXPLAIN (ANALYZE, BUFFERS)` on representative trees. The current exact `descendant_total` contract is a known cost: pagination limits response size, not traversal work. If this becomes material, consider a separate lightweight `has_more` contract using one extra row, while preserving exact totals only in an explicit summary path.

## Scope boundary

This decision concerns internal CultureOps biological lineage only. It does not change the separate client-facing Passeport Produit application or the BA Labs website.
