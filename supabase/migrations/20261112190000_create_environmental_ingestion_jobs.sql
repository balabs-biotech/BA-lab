-- Durable execution ledger for provider ingestion. The gateway writes with
-- service_role only; organization members can read their own organization's jobs.
CREATE TABLE public.environmental_ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  location_id uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('sentinel2_scene_ingestion')),
  provider_code text NOT NULL CHECK (provider_code IN ('EARTH_SEARCH')),
  dataset_code text NOT NULL CHECK (dataset_code IN ('SENTINEL_2_L2A')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'succeeded', 'partial_failed', 'failed')),
  request_parameters jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(request_parameters) = 'object'),
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(result_summary) = 'object'),
  error_code text,
  items_seen integer NOT NULL DEFAULT 0 CHECK (items_seen >= 0),
  scenes_selected integer NOT NULL DEFAULT 0 CHECK (scenes_selected >= 0),
  scenes_processed integer NOT NULL DEFAULT 0 CHECK (scenes_processed >= 0),
  scenes_failed integer NOT NULL DEFAULT 0 CHECK (scenes_failed >= 0),
  scenes_duplicated integer NOT NULL DEFAULT 0 CHECK (scenes_duplicated >= 0),
  observations_submitted integer NOT NULL DEFAULT 0 CHECK (observations_submitted >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT environmental_ingestion_jobs_completion_consistency
    CHECK (
      (status IN ('queued', 'processing') AND completed_at IS NULL)
      OR (status IN ('succeeded', 'partial_failed', 'failed') AND completed_at IS NOT NULL)
    )
);

CREATE INDEX environmental_ingestion_jobs_org_created_idx
  ON public.environmental_ingestion_jobs (organization_id, created_at DESC);
CREATE INDEX environmental_ingestion_jobs_location_created_idx
  ON public.environmental_ingestion_jobs (location_id, created_at DESC);

ALTER TABLE public.environmental_ingestion_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.environmental_ingestion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.environmental_ingestion_jobs TO authenticated;
GRANT ALL ON public.environmental_ingestion_jobs TO service_role;

CREATE POLICY environmental_ingestion_jobs_org_member_read
  ON public.environmental_ingestion_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members AS membership
      WHERE membership.organization_id = environmental_ingestion_jobs.organization_id
        AND membership.user_id = (SELECT auth.uid())
    )
  );

COMMENT ON TABLE public.environmental_ingestion_jobs IS
  'Durable, tenant-scoped execution ledger for environmental provider ingestion. Contains bounded request/result summaries, never raw credentials or source payloads.';
