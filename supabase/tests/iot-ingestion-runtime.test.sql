-- Runtime test: exercise the real IoT RPC after the full migration replay.
-- Runs only against disposable PostgreSQL in GitHub Actions; never production.
\set ON_ERROR_STOP on

DO $iot_runtime$
DECLARE
  org_id uuid := '10000000-0000-0000-0000-000000000001';
  location_id uuid;
  environment_id uuid;
  v_device_id uuid;
  first_result jsonb;
  retry_result jsonb;
  conflict_caught boolean := false;
  invalid_batch_caught boolean := false;
  measurement_count integer;
  receipt_count integer;
BEGIN
  INSERT INTO public.organizations (id, code, name)
  VALUES (org_id, 'ci-iot-runtime', 'CI IoT runtime test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.locations (organization_id, code, name, location_type)
  VALUES (org_id, 'ci-iot-location', 'CI IoT location', 'test')
  ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO location_id;

  INSERT INTO public.environments (organization_id, location_id, name)
  VALUES (org_id, location_id, 'CI IoT environment')
  RETURNING id INTO environment_id;

  INSERT INTO public.iot_devices (
    id, organization_id, environment_id, device_code, device_type, token_sha256
  ) VALUES (
    '10000000-0000-0000-0000-000000000002',
    org_id, environment_id, 'ci-iot-device', 'esp32-test',
    repeat('a', 64)
  )
  RETURNING id INTO v_device_id;

  first_result := public.ingest_iot_payload(
    v_device_id,
    'ci-message-001',
    repeat('b', 64),
    '[{"variable_code":"temperature","unit_code":"degC","value":24.5}]'::jsonb
  );
  IF first_result->>'status' <> 'processed'
     OR (first_result->>'count')::integer <> 1 THEN
    RAISE EXCEPTION 'FAIL: first ingestion was not processed: %', first_result;
  END IF;

  retry_result := public.ingest_iot_payload(
    v_device_id,
    'ci-message-001',
    repeat('b', 64),
    '[{"variable_code":"temperature","unit_code":"degC","value":24.5}]'::jsonb
  );
  IF retry_result->>'status' <> 'duplicate' THEN
    RAISE EXCEPTION 'FAIL: identical retry was not marked duplicate: %', retry_result;
  END IF;

  BEGIN
    PERFORM public.ingest_iot_payload(
      v_device_id,
      'ci-message-001',
      repeat('c', 64),
      '[{"variable_code":"temperature","unit_code":"degC","value":25.5}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'message_id_payload_mismatch' THEN
      conflict_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT conflict_caught THEN
    RAISE EXCEPTION 'FAIL: same message ID with a different hash was accepted';
  END IF;

  SELECT count(*) INTO measurement_count
  FROM public.measurements
  WHERE organization_id = org_id
    AND iot_device_id = v_device_id
    AND metadata->>'message_id' = 'ci-message-001';
  IF measurement_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one persisted measurement, got %', measurement_count;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.iot_ingest_receipts
  WHERE iot_ingest_receipts.device_id = v_device_id AND message_id = 'ci-message-001';
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly one receipt, got %', receipt_count;
  END IF;

  -- A multi-reading payload must be atomic: a later invalid reading must not
  -- leave the earlier valid reading or its receipt persisted.
  BEGIN
    PERFORM public.ingest_iot_payload(
      v_device_id,
      'ci-message-atomic-001',
      repeat('d', 64),
      '[{"variable_code":"temperature","unit_code":"degC","value":24.5},
        {"variable_code":"temperature","unit_code":"degC","value":999}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'unsupported_variable_unit_or_range' THEN
      invalid_batch_caught := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT invalid_batch_caught THEN
    RAISE EXCEPTION 'FAIL: invalid reading in batch was accepted';
  END IF;

  SELECT count(*) INTO measurement_count
  FROM public.measurements
  WHERE organization_id = org_id
    AND iot_device_id = v_device_id
    AND metadata->>'message_id' = 'ci-message-atomic-001';
  IF measurement_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: invalid batch left partial measurements: %', measurement_count;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.iot_ingest_receipts
  WHERE device_id = v_device_id AND message_id = 'ci-message-atomic-001';
  IF receipt_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: invalid batch left a receipt: %', receipt_count;
  END IF;
END
$iot_runtime$;

SELECT 'PASS: IoT RPC processes once, retries idempotently, rejects hash conflict, persists one measurement' AS test_result;
