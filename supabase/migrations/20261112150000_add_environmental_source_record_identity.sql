-- Give satellite scenes a stable source identity in the deduplication key.
-- Weather keeps its existing observation-level idempotency semantics.
ALTER TABLE public.environmental_observations
  ADD COLUMN source_record_id text;

UPDATE public.environmental_observations
SET source_record_id = metadata ->> 'scene_id'
WHERE data_family = 'satellite'
  AND jsonb_typeof(metadata) = 'object'
  AND metadata ? 'scene_id'
  AND length(btrim(metadata ->> 'scene_id')) > 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.environmental_observations
    WHERE data_family = 'satellite'
      AND (source_record_id IS NULL OR length(btrim(source_record_id)) = 0)
  ) THEN
    RAISE EXCEPTION
      'Satellite observations without metadata.scene_id require an explicit backfill before source identity migration';
  END IF;
END
$$;

ALTER TABLE public.environmental_observations
  ADD CONSTRAINT environmental_observations_source_record_id_nonempty
    CHECK (source_record_id IS NULL OR length(btrim(source_record_id)) > 0),
  ADD CONSTRAINT environmental_observations_satellite_source_id_required
    CHECK (data_family <> 'satellite' OR source_record_id IS NOT NULL);

ALTER TABLE public.environmental_observations
  DROP CONSTRAINT environmental_observations_dedup_key;

CREATE UNIQUE INDEX environmental_observations_weather_dedup_key
  ON public.environmental_observations
    (organization_id, location_id, provider_code, dataset_code, variable_code, observed_at)
  WHERE data_family = 'weather';

CREATE UNIQUE INDEX environmental_observations_satellite_dedup_key
  ON public.environmental_observations
    (organization_id, location_id, provider_code, dataset_code, variable_code, observed_at, source_record_id)
  WHERE data_family = 'satellite';

COMMENT ON COLUMN public.environmental_observations.source_record_id IS
  'Stable provider record identity; Sentinel-2 uses the STAC scene/item ID.';
