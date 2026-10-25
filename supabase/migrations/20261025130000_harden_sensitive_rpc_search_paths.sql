-- Pin search_path on traceability RPCs to avoid resolving unqualified names
-- through writable schemas. All application relations are already schema-qualified.
alter function public.ingest_iot_payload(uuid, text, text, jsonb)
  set search_path = pg_catalog;

alter function public.record_biological_operation(
  uuid, uuid, text, timestamptz, text, jsonb, text[]
) set search_path = pg_catalog;
