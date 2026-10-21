-- Reconciliation marker for an already-recorded duplicate migration execution.
-- Production migration history contains this version after the canonical
-- 20261021120000_add_missing_fk_indexes_optimize_consent_rls migration was applied.
-- Keep the historical version represented in source control without repeating DDL.
select 1;
