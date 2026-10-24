-- Run after full migration replay.
\set ON_ERROR_STOP on

DO $assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'measurements_org_iot_device_fk'
      AND conrelid = 'public.measurements'::regclass
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'FAIL: measurements-to-IoT-device foreign key is missing or unvalidated';
  END IF;
END
$assertions$;
