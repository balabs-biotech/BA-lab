-- Weather observations also use a partial unique index. Keep their
-- idempotent writes behind a matching conflict-predicate RPC.
CREATE OR REPLACE FUNCTION public.upsert_weather_environmental_observations(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows_written integer := 0;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Weather payload must be a JSON array';
  END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Weather payload must contain 1 to 5000 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS expanded(item)
    WHERE item ->> 'data_family' IS DISTINCT FROM 'weather'
       OR item ->> 'provider_code' IS DISTINCT FROM 'NASA_POWER'
       OR item ->> 'dataset_code' IS DISTINCT FROM 'POWER_DAILY_AGRO'
       OR item ->> 'variable_code' IS NULL
       OR item ->> 'variable_code' NOT IN (
         'air_temperature_mean',
         'air_temperature_max',
         'air_temperature_min',
         'precipitation_corrected',
         'solar_radiation_all_sky',
         'uv_index_daily_mean',
         'relative_humidity_mean',
         'wind_speed_mean'
       )
       OR jsonb_typeof(item -> 'value') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item -> 'metadata') IS DISTINCT FROM 'object'
       OR item -> 'metadata' ->> 'source_parameter' IS NULL
  ) THEN
    RAISE EXCEPTION 'Weather payload contains an invalid NASA POWER observation';
  END IF;

  IF (
    SELECT count(DISTINCT item ->> 'organization_id')
    FROM jsonb_array_elements(p_rows) AS expanded(item)
  ) <> 1 OR (
    SELECT count(DISTINCT item ->> 'location_id')
    FROM jsonb_array_elements(p_rows) AS expanded(item)
  ) <> 1 THEN
    RAISE EXCEPTION 'Weather rows must share one organization and location scope';
  END IF;

  INSERT INTO public.environmental_observations (
    organization_id,
    location_id,
    data_family,
    provider_code,
    dataset_code,
    variable_code,
    value,
    unit_code,
    observed_at,
    retrieved_at,
    spatial_resolution_m,
    quality_flag,
    source_url,
    metadata,
    source_record_id
  )
  SELECT
    row_data.organization_id,
    row_data.location_id,
    row_data.data_family,
    row_data.provider_code,
    row_data.dataset_code,
    row_data.variable_code,
    row_data.value,
    row_data.unit_code,
    row_data.observed_at,
    row_data.retrieved_at,
    row_data.spatial_resolution_m,
    row_data.quality_flag,
    row_data.source_url,
    row_data.metadata,
    row_data.source_record_id
  FROM jsonb_to_recordset(p_rows) AS row_data(
    organization_id uuid,
    location_id uuid,
    data_family text,
    provider_code text,
    dataset_code text,
    variable_code text,
    value numeric,
    unit_code text,
    observed_at timestamptz,
    retrieved_at timestamptz,
    spatial_resolution_m double precision,
    quality_flag text,
    source_url text,
    metadata jsonb,
    source_record_id text
  )
  ON CONFLICT (
    organization_id,
    location_id,
    provider_code,
    dataset_code,
    variable_code,
    observed_at
  )
  WHERE data_family = 'weather'
  DO UPDATE SET
    value = EXCLUDED.value,
    unit_code = EXCLUDED.unit_code,
    retrieved_at = EXCLUDED.retrieved_at,
    spatial_resolution_m = EXCLUDED.spatial_resolution_m,
    quality_flag = EXCLUDED.quality_flag,
    source_url = EXCLUDED.source_url,
    metadata = EXCLUDED.metadata;

  GET DIAGNOSTICS v_rows_written = ROW_COUNT;
  RETURN v_rows_written;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_weather_environmental_observations(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_weather_environmental_observations(jsonb)
  TO service_role;

COMMENT ON FUNCTION public.upsert_weather_environmental_observations(jsonb) IS
  'Validates and idempotently upserts NASA POWER daily weather observations through the partial weather unique index.';
