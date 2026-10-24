-- Permit environment/device-linked telemetry as a valid measurement context.
-- The core trigger originally required a culture/sample/experimental unit/event,
-- which rejected IoT measurements even though the IoT RPC supplies environment_id
-- and iot_device_id. Keep the guard: every measurement still needs a context.
CREATE OR REPLACE FUNCTION private.enforce_measurement_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF num_nonnulls(
    NEW.culture_id,
    NEW.sample_id,
    NEW.experimental_unit_id,
    NEW.event_id,
    NEW.plant_culture_id,
    NEW.environment_id,
    NEW.iot_device_id
  ) < 1 THEN
    RAISE EXCEPTION 'Measurement must reference at least one context object';
  END IF;
  RETURN NEW;
END
$$;
