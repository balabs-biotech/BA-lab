-- Runtime PostgreSQL checks for the IoT ingestion boundary after all migrations replay.
-- This uses only the disposable PostgreSQL service in GitHub Actions.
\set ON_ERROR_STOP on

DO $iot_security$
DECLARE
  rpc_definition text;
BEGIN
  IF to_regclass('public.iot_devices') IS NULL
     OR to_regclass('public.iot_ingest_receipts') IS NULL THEN
    RAISE EXCEPTION 'FAIL: IoT registry/receipt tables are missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.iot_devices'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.iot_ingest_receipts'::regclass) THEN
    RAISE EXCEPTION 'FAIL: RLS must be enabled on both IoT tables';
  END IF;

  IF has_table_privilege('anon','public.iot_devices','SELECT')
     OR has_table_privilege('anon','public.iot_devices','INSERT')
     OR has_table_privilege('authenticated','public.iot_devices','SELECT')
     OR has_table_privilege('authenticated','public.iot_devices','INSERT')
     OR has_table_privilege('anon','public.iot_ingest_receipts','SELECT')
     OR has_table_privilege('anon','public.iot_ingest_receipts','INSERT')
     OR has_table_privilege('authenticated','public.iot_ingest_receipts','SELECT')
     OR has_table_privilege('authenticated','public.iot_ingest_receipts','INSERT') THEN
    RAISE EXCEPTION 'FAIL: client role has direct access to server-managed IoT tables';
  END IF;

  IF NOT has_function_privilege('service_role',
      'public.ingest_iot_payload(uuid,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: service_role cannot execute IoT ingestion RPC';
  END IF;

  IF has_function_privilege('anon',
      'public.ingest_iot_payload(uuid,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated',
      'public.ingest_iot_payload(uuid,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: client role can execute server-side IoT ingestion RPC';
  END IF;

  SELECT lower(pg_get_functiondef(
    'public.ingest_iot_payload(uuid,text,text,jsonb)'::regprocedure
  )) INTO rpc_definition;

  IF position('existing_payload_sha256 is distinct from p_payload_sha256' in rpc_definition) = 0
     OR position('message_id_payload_mismatch' in rpc_definition) = 0
     OR position('status'', ''duplicate' in rpc_definition) = 0 THEN
    RAISE EXCEPTION 'FAIL: IoT RPC does not enforce payload-hash idempotency contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.iot_devices'::regclass
      AND contype='f'
      AND pg_get_constraintdef(oid) ILIKE '%(organization_id, environment_id)%'
  ) THEN
    RAISE EXCEPTION 'FAIL: IoT device environment relationship is not tenant-scoped';
  END IF;
END
$iot_security$;

SELECT 'PASS: IoT tables, RLS, grants, tenant FK and payload conflict contract' AS test_result;
