-- The registry migration follows this historical version in the production ledger.
-- The RPC is created by 20261024070000_finalize_iot_ingestion_after_registry.sql,
-- after public.iot_devices and public.iot_ingest_receipts exist.
do $migration$
begin
  if to_regclass('public.iot_devices') is null
     or to_regclass('public.iot_ingest_receipts') is null then
    raise notice 'Deferring ingest_iot_payload creation until the IoT registry migration';
  else
    raise notice 'IoT registry exists; the canonical RPC is installed by the finalization migration';
  end if;
end
$migration$;
