-- Make lease ownership and satellite observation persistence one transaction.
-- The row lock prevents a concurrent reclaim/heartbeat/completion from changing
-- the active lease between validation and the observation upsert.
CREATE OR REPLACE FUNCTION public.persist_leased_satellite_environmental_observations(
  p_job_id uuid,
  p_lease_token uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.environmental_ingestion_jobs%ROWTYPE;
  v_persisted integer;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_leased_satellite_payload' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) < 2
    OR jsonb_array_length(p_rows) > 200
    OR mod(jsonb_array_length(p_rows), 2) <> 0 THEN
    RAISE EXCEPTION 'invalid_leased_satellite_payload' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.environmental_ingestion_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_environmental_job_lease_required'
      USING ERRCODE = '42501';
  END IF;

  IF v_job.status <> 'processing'
    OR v_job.job_type <> 'sentinel2_scene_ingestion'
    OR v_job.provider_code <> 'EARTH_SEARCH'
    OR v_job.dataset_code <> 'SENTINEL_2_L2A'
    OR v_job.lease_token IS DISTINCT FROM p_lease_token
    OR v_job.lease_expires_at IS NULL
    OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'active_environmental_job_lease_required'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS candidate(row_data)
    WHERE jsonb_typeof(candidate.row_data) IS DISTINCT FROM 'object'
      OR candidate.row_data ->> 'organization_id' IS DISTINCT FROM v_job.organization_id::text
      OR candidate.row_data ->> 'location_id' IS DISTINCT FROM v_job.location_id::text
      OR candidate.row_data ->> 'data_family' IS DISTINCT FROM 'satellite'
      OR candidate.row_data ->> 'provider_code' IS DISTINCT FROM v_job.provider_code
      OR candidate.row_data ->> 'dataset_code' IS DISTINCT FROM v_job.dataset_code
  ) THEN
    RAISE EXCEPTION 'leased_satellite_tenant_or_source_mismatch'
      USING ERRCODE = '22023';
  END IF;

  -- This RPC runs inside the same transaction while the job row remains locked.
  SELECT public.upsert_satellite_environmental_observations(p_rows)
    INTO v_persisted;

  RETURN v_persisted;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_leased_satellite_environmental_observations(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_leased_satellite_environmental_observations(uuid, uuid, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.persist_leased_satellite_environmental_observations(uuid, uuid, jsonb) IS
  'Locks and validates the live Sentinel-2 job lease, then persists tenant-scoped satellite rows atomically in the same transaction.';
