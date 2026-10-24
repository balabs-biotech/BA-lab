-- Install the atomic ingestion RPC only after the device registry and receipt ledger exist.
-- Atomic IoT ingestion RPC. Only the service role may execute it.
create or replace function public.ingest_iot_payload(
  p_device_id uuid,
  p_message_id text,
  p_payload_sha256 text,
  p_readings jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.iot_devices%rowtype;
  receipt_id uuid;
  item jsonb;
  v_code text;
  v_unit text;
  v_value numeric;
  v_measured_at timestamptz;
  v_instrument text;
  v_method text;
  v_min numeric;
  v_max numeric;
  v_count integer := 0;
begin
  if p_message_id is null or length(p_message_id) < 1 or length(p_message_id) > 120 then
    raise exception 'invalid_message_id' using errcode = '22023';
  end if;
  if p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_payload_hash' using errcode = '22023';
  end if;
  if jsonb_typeof(p_readings) <> 'array' or jsonb_array_length(p_readings) < 1 or jsonb_array_length(p_readings) > 20 then
    raise exception 'invalid_readings_count' using errcode = '22023';
  end if;

  select * into d from public.iot_devices where id = p_device_id and enabled = true for update;
  if not found then
    raise exception 'device_disabled_or_missing' using errcode = '22023';
  end if;

  insert into public.iot_ingest_receipts(device_id, message_id, payload_sha256, status)
  values (d.id, p_message_id, p_payload_sha256, 'received')
  on conflict (device_id, message_id) do nothing
  returning id into receipt_id;

  if receipt_id is null then
    return jsonb_build_object('status', 'duplicate', 'message_id', p_message_id);
  end if;

  for item in select value from jsonb_array_elements(p_readings)
  loop
    v_code := item->>'variable_code';
    v_unit := item->>'unit_code';
    v_value := (item->>'value')::numeric;
    v_measured_at := coalesce((item->>'measured_at')::timestamptz, now());
    v_instrument := left(coalesce(item->>'instrument', d.device_type), 120);
    v_method := left(coalesce(item->>'method', 'iot_sensor'), 120);

    if v_code is null or v_unit is null or v_value is null then
      raise exception 'reading_missing_required_field' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.variables v
      where v.code = v_code and v.canonical_unit_code = v_unit
        and ((v_code = 'temperature' and v_unit = 'degC' and v_value between -20 and 80)
          or (v_code = 'relative_humidity' and v_unit = '%' and v_value between 0 and 100)
          or (v_code = 'substrate_moisture' and v_unit = '%' and v_value between 0 and 100)
          or (v_code = 'co2_concentration' and v_unit = 'ppm' and v_value between 0 and 10000))
    ) then
      raise exception 'unsupported_variable_unit_or_range' using errcode = '22023';
    end if;

    insert into public.measurements (
      organization_id, variable_code, raw_value, raw_unit_code,
      measured_at, method, instrument, quality_state, environment_id,
      iot_device_id, metadata
    ) values (
      d.organization_id, v_code, v_value, v_unit,
      v_measured_at, v_method, v_instrument, 'raw', d.environment_id,
      d.id, jsonb_build_object(
        'source', 'iot',
        'message_id', p_message_id,
        'receipt_id', receipt_id,
        'sensor_label', left(coalesce(item->>'sensor_label', v_code), 80),
        'device_code', d.device_code
      )
    );
    v_count := v_count + 1;
  end loop;

  update public.iot_ingest_receipts
    set status = 'processed', processed_at = now()
    where id = receipt_id;
  update public.iot_devices set last_seen_at = now() where id = d.id;

  return jsonb_build_object('status', 'processed', 'message_id', p_message_id, 'count', v_count);
end;
$$;

revoke all on function public.ingest_iot_payload(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_iot_payload(uuid, text, text, jsonb) to service_role;
