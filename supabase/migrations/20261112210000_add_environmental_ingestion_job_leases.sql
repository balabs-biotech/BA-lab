-- Queue primitives for resilient environmental ingestion workers.
-- This migration adds the lease protocol without changing the existing
-- synchronous Sentinel-2 gateway. Queue adoption is a separate rollout step.

ALTER TABLE public.environmental_ingestion_jobs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3
    CHECK (max_attempts BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_owner text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

ALTER TABLE public.environmental_ingestion_jobs
  ADD CONSTRAINT environmental_ingestion_jobs_lease_consistency
  CHECK (
    (lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR
    (lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  );

CREATE INDEX environmental_ingestion_jobs_claim_idx
  ON public.environmental_ingestion_jobs (available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX environmental_ingestion_jobs_expired_lease_idx
  ON public.environmental_ingestion_jobs (lease_expires_at)
  WHERE status = 'processing' AND lease_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_environmental_ingestion_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.environmental_ingestion_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) < 3 OR length(p_worker_id) > 120 THEN
    RAISE EXCEPTION 'invalid_worker_id' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid_lease_seconds' USING ERRCODE = '22023';
  END IF;

  SELECT job.id INTO v_job_id
  FROM public.environmental_ingestion_jobs AS job
  WHERE job.attempt_count < job.max_attempts
    AND (
      (job.status = 'queued' AND job.available_at <= now())
      OR
      (job.status = 'processing' AND job.lease_token IS NOT NULL
        AND job.lease_expires_at < now())
    )
  ORDER BY job.available_at ASC, job.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.environmental_ingestion_jobs AS job
  SET status = 'processing',
      started_at = COALESCE(job.started_at, now()),
      attempt_count = job.attempt_count + 1,
      lease_owner = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      error_code = NULL
  WHERE job.id = v_job_id
  RETURNING job.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_environmental_ingestion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid_lease_seconds' USING ERRCODE = '22023';
  END IF;

  UPDATE public.environmental_ingestion_jobs
  SET heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_environmental_ingestion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_result_summary jsonb DEFAULT '{}'::jsonb,
  p_error_code text DEFAULT NULL,
  p_scenes_processed integer DEFAULT 0,
  p_scenes_failed integer DEFAULT 0,
  p_scenes_duplicated integer DEFAULT 0,
  p_observations_submitted integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_status NOT IN ('succeeded', 'partial_failed', 'failed') THEN
    RAISE EXCEPTION 'invalid_terminal_status' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_result_summary) IS DISTINCT FROM 'object'
    OR p_scenes_processed < 0 OR p_scenes_failed < 0
    OR p_scenes_duplicated < 0 OR p_observations_submitted < 0 THEN
    RAISE EXCEPTION 'invalid_job_result' USING ERRCODE = '22023';
  END IF;

  UPDATE public.environmental_ingestion_jobs
  SET status = p_status,
      result_summary = p_result_summary,
      error_code = CASE WHEN p_error_code IS NULL THEN NULL ELSE left(p_error_code, 120) END,
      scenes_processed = p_scenes_processed,
      scenes_failed = p_scenes_failed,
      scenes_duplicated = p_scenes_duplicated,
      observations_submitted = p_observations_submitted,
      completed_at = now(),
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      heartbeat_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND lease_expires_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_stale_environmental_ingestion_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.environmental_ingestion_jobs
  SET status = 'failed',
      error_code = 'lease_expired_attempts_exhausted',
      completed_at = now(),
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE status = 'processing'
    AND lease_token IS NOT NULL
    AND lease_expires_at < now()
    AND attempt_count >= max_attempts;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_environmental_ingestion_job(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_environmental_ingestion_job(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_environmental_ingestion_job(uuid, uuid, text, jsonb, text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_stale_environmental_ingestion_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_environmental_ingestion_job(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_environmental_ingestion_job(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_environmental_ingestion_job(uuid, uuid, text, jsonb, text, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_environmental_ingestion_jobs() TO service_role;

COMMENT ON FUNCTION public.claim_environmental_ingestion_job(text, integer) IS
  'Atomically claims one eligible environmental job using FOR UPDATE SKIP LOCKED and issues a bounded lease token.';
COMMENT ON FUNCTION public.heartbeat_environmental_ingestion_job(uuid, uuid, integer) IS
  'Extends only a currently valid processing lease owned by the supplied opaque lease token.';
COMMENT ON FUNCTION public.complete_environmental_ingestion_job(uuid, uuid, text, jsonb, text, integer, integer, integer, integer) IS
  'Finalizes only the currently leased processing attempt; stale workers cannot overwrite a reclaimed job.';
