-- Audit data is append-only for application clients.
-- All supported writers are validated RPCs; the service role remains available
-- for trusted ingestion and administrative operations.
alter function public.record_manual_measurement(jsonb, jsonb)
  security definer set search_path = pg_catalog;
alter function public.record_manual_observation(jsonb, jsonb)
  security definer set search_path = pg_catalog;
alter function public.record_biological_operation(
  uuid, uuid, text, timestamptz, text, jsonb, text[]
) security definer set search_path = pg_catalog;

revoke insert, update, delete, truncate on table public.events, public.measurements, public.observations
  from public, anon, authenticated;
