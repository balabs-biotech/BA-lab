-- PostgREST's generic upsert API cannot infer a partial unique index
-- without the matching predicate. Keep satellite conflict handling in SQL.
CREATE OR REPLACE FUNCTION public.upsert_satellite_environmental_observations(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows_written integer := 0;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) < 2
     OR jsonb_array_length(p_rows) > 200
     OR mod(jsonb_array_length(p_rows), 2) <> 0 THEN
    RAISE EXCEPTION 'Sentinel-2 payload must contain 2 to 200 rows in pairs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS item
    WHERE item ->> 'data_family' IS DISTINCT FROM 'satellite'
       OR item ->> 'provider_code' IS DISTINCT FROM 'EARTH_SEARCH'
       OR item ->> 'dataset_code' IS DISTINCT FROM 'SENTINEL_2_L2A'
       OR item ->> 'source_record_id' IS NULL
       OR length(btrim(item ->> 'source_record_id')) = 0
       OR item -> 'metadata' ->> 'scene_id' IS DISTINCT FROM item ->> 'source_record_id'
       OR item ->> 'variable_code' NOT IN ('ndvi_mean', 'ndvi_median')
  ) THEN
    RAISE EXCEPTION 'Sentinel-2 payload contains an invalid source identity';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS row_data(
      source_record_id text,
      variable_code text,
      observed_at text,
      retrieved_at text,
      source_url text
    )
    GROUP BY source_record_id
    HAVING count(*) <> 2
       OR count(DISTINCT variable_code) <> 2
       OR bool_and(variable_code IN ('ndvi_mean', 'ndvi_median')) IS NOT TRUE
       OR count(DISTINCT observed_at) <> 1
       OR count(DISTINCT retrieved_at) <> 1
       OR count(DISTINCT source_url) <> 1
  ) THEN
    RAISE EXCEPTION 'Each Sentinel-2 scene must have one consistent mean/median pair';
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
    observed_at,
    source_record_id
  )
  WHERE data_family = 'satellite'
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

REVOKE ALL ON FUNCTION public.upsert_satellite_environmental_observations(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_satellite_environmental_observations(jsonb)
  TO service_role;

COMMENT ON FUNCTION public.upsert_satellite_environmental_observations(jsonb) IS
  'Validates paired Sentinel-2 NDVI observations and performs scene-aware idempotent upserts through the partial satellite unique index.';
