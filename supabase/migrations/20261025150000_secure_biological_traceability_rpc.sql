-- The audit-table hardening migration revokes direct client writes to public.events.
-- Biological traceability writes through this validated RPC must therefore run with
-- the function owner's privileges, while preserving explicit organization membership
-- checks and a catalog-only search_path.
alter function public.record_biological_operation(
  uuid, uuid, text, timestamptz, text, jsonb, text[]
) security definer set search_path = pg_catalog;
