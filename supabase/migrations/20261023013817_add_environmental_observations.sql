-- Foundation for free/open weather and satellite observations, kept separate
-- from manual measurements and IoT telemetry.
ALTER TABLE public.locations
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN coordinate_accuracy_m double precision,
  ADD COLUMN coordinate_source text;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_latitude_range
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT locations_longitude_range
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT locations_coordinate_pair
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT locations_coordinate_accuracy_nonnegative
    CHECK (coordinate_accuracy_m IS NULL OR coordinate_accuracy_m >= 0);

CREATE TABLE public.environmental_observations (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL,
  data_family text NOT NULL CHECK (data_family IN ('weather', 'satellite')),
  provider_code text NOT NULL CHECK (length(provider_code) BETWEEN 1 AND 80),
  dataset_code text NOT NULL CHECK (length(dataset_code) BETWEEN 1 AND 120),
  variable_code text NOT NULL CHECK (length(variable_code) BETWEEN 1 AND 100),
  value numeric,
  unit_code text,
  observed_at timestamptz NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  spatial_resolution_m double precision,
  quality_flag text,
  source_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (organization_id, id),
  CONSTRAINT environmental_observations_location_fk
    FOREIGN KEY (organization_id, location_id)
    REFERENCES public.locations (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT environmental_observations_resolution_nonnegative
    CHECK (spatial_resolution_m IS NULL OR spatial_resolution_m >= 0),
  CONSTRAINT environmental_observations_dedup_key
    UNIQUE (organization_id, location_id, provider_code, dataset_code, variable_code, observed_at)
);

CREATE INDEX environmental_observations_location_time_idx
  ON public.environmental_observations (organization_id, location_id, observed_at DESC);
CREATE INDEX environmental_observations_family_time_idx
  ON public.environmental_observations (organization_id, data_family, observed_at DESC);

ALTER TABLE public.environmental_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY environmental_observations_select
  ON public.environmental_observations
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

-- Ingestion is server-managed. Authenticated clients may read their own
-- organization's observations, but cannot forge provider-sourced records.
REVOKE ALL ON public.environmental_observations FROM anon, authenticated;
GRANT SELECT ON public.environmental_observations TO authenticated;
