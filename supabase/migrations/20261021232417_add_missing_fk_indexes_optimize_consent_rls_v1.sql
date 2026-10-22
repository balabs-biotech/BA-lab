-- Reconciliation marker for production migration version 20261021232417.
-- This duplicate ledger entry is already represented by the canonical migration 20261021120000.
-- Keep the production timestamp in source control without repeating DDL on clean replay.
select 1;
