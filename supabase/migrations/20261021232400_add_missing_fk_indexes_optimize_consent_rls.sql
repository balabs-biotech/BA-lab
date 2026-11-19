-- Reconciliation marker for production migration version 20261021232400.
-- The canonical migration 20261021120000 already applies the index and consent-RLS changes.
-- Production recorded a second execution under this version; keep its timestamp represented
-- without repeating DDL during a clean replay.
select 1;
